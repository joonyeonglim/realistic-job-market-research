#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  compareEvidence,
  isISODate,
  loadSourcePlan,
  normalizeStage,
  now,
  parseArgs,
  parseSnapshot,
  readJSON,
  requireRunDir,
  resolveStage,
  sha256,
  statusGroup,
  unique,
  valuesOf,
  writeJSON
} from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: build-ledger.mjs --run-dir RUN [--snapshot REVIEW.json ...] [--profile PROFILE.json] [--output reviewed/ledger.json]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const { plan } = loadSourcePlan(runDir, args["source-plan"] ? path.resolve(String(args["source-plan"])) : undefined);
const profileFile = path.resolve(String(args.profile || path.join(runDir, "profile.json")));
const requested = valuesOf(args.snapshot).map(parseSnapshot).map(ref => ref.file);
const planned = (plan.reviewed_snapshots || []).map(value => path.resolve(runDir, typeof value === "string" ? value : value.file));
const inputFiles = requested.length ? requested : planned;
if (!inputFiles.length) throw new Error("no reviewed snapshots declared; pass --snapshot or source-plan.reviewed_snapshots[]");
if (!fs.existsSync(profileFile)) throw new Error(`profile snapshot not found: ${profileFile}`);

const profile = readJSON(profileFile);
const profileVersion = profile.profile_version;
const profileHash = sha256(profileFile);
if (!profileVersion || !isISODate(profile.captured_at)) {
  throw new Error(`${profileFile}: profile_version and captured_at are required`);
}

const records = [];
const provenance = [];
const warnings = [];
for (const file of inputFiles) {
  if (!fs.existsSync(file)) throw new Error(`review snapshot not found: ${file}`);
  const payload = readJSON(file);
  if (!payload?.metadata || !Array.isArray(payload.jobs)) throw new Error(`${file}: expected {metadata,jobs}`);
  if (!isISODate(payload.metadata.reviewed_at) || !payload.metadata.profile_version || !payload.metadata.profile_hash) {
    throw new Error(`${file}: metadata reviewed_at, profile_version, and profile_hash are required`);
  }
  if (payload.metadata.profile_version !== profileVersion || payload.metadata.profile_hash !== profileHash) {
    throw new Error(`${file}: review profile does not match ${profileFile}`);
  }
  for (const [index, raw] of payload.jobs.entries()) {
    const legacyOutside = raw.filter_stage === "outside";
    if (legacyOutside && !args["legacy-review"]) throw new Error(`${file}: jobs[${index}] uses legacy outside; rerun with --legacy-review to migrate as unreviewed`);
    if (!raw.source || raw.source_id == null || !/^[a-f0-9]{64}$/.test(String(raw.content_fingerprint)) || !isISODate(raw.reviewed_at) || raw.profile_version !== profileVersion || raw.profile_hash !== profileHash) {
      throw new Error(`${file}: jobs[${index}] lacks exact identity/fingerprint/review/profile provenance`);
    }
    const employmentConflict = raw.filter_stage === "status_conflict" && raw.status === "employment_conflict";
    if (legacyOutside) warnings.push(`${raw.source}|${raw.source_id}: legacy outside retained as unreviewed`);
    records.push({
      ...raw,
      source: String(raw.source),
      source_id: String(raw.source_id),
      filter_stage: legacyOutside || employmentConflict ? "unknown" : normalizeStage(raw.filter_stage),
      legacy_unreviewed: legacyOutside,
      conflict_types: unique([...(raw.conflict_types || []), ...(employmentConflict ? ["employment"] : [])]),
      listing_status_conflict: false,
      evidence_level: raw.evidence_level || "search_card",
      match_terms: unique(raw.match_terms || []),
      exclusion_reason: raw.exclusion_reason || null
    });
  }
  provenance.push({ file: path.relative(runDir, file), sha256: sha256(file), reviewed_at: payload.metadata.reviewed_at, rows: payload.jobs.length });
}

const groups = new Map();
for (const record of records) {
  const key = `${record.source}|${record.source_id}|${record.content_fingerprint}|${record.profile_version}|${record.profile_hash}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(record);
}

const jobs = [...groups.entries()].map(([key, group]) => {
  const ordered = [...group].sort(compareEvidence);
  const primary = { ...ordered[0] };
  const stages = group.map(record => record.filter_stage);
  const employmentValues = unique(group.map(record => record.employment));
  const statusGroups = unique(group.map(record => statusGroup(record.status)));
  const classificationConflict = stages.includes("candidate") && stages.includes("excluded");
  const employmentConflict = employmentValues.length > 1 || group.some(record => record.conflict_types.includes("employment"));
  const listingStatusConflict = statusGroups.includes("active") && statusGroups.includes("closed");
  primary.filter_stage = resolveStage(stages);
  primary.classification_conflict = classificationConflict;
  primary.listing_status_conflict = listingStatusConflict;
  primary.conflict_types = unique([
    ...group.flatMap(record => record.conflict_types),
    ...(classificationConflict ? ["classification"] : []),
    ...(employmentConflict ? ["employment"] : []),
    ...(listingStatusConflict ? ["listing_status"] : [])
  ]);
  primary.match_terms = unique(group.flatMap(record => record.match_terms));
  primary.exclusion_reasons = unique(group.map(record => record.exclusion_reason));
  primary.exclusion_reason = primary.exclusion_reasons.join(" · ") || null;
  primary.evidence_chain = ordered.map(record => ({
    evidence_level: record.evidence_level,
    reviewed_at: record.reviewed_at,
    label: normalizeStage(record.filter_stage),
    evidence_url: record.evidence_url || record.url || null
  }));
  primary.review_key = key;
  return primary;
}).sort((left, right) => left.source.localeCompare(right.source) || left.source_id.localeCompare(right.source_id));

const output = path.resolve(runDir, String(args.output || "reviewed/ledger.json"));
const payload = {
  metadata: {
    schema_version: 1,
    kind: "reviewed_ledger",
    generated_at: now(),
    reviewed_at_min: records.map(record => record.reviewed_at).sort()[0],
    reviewed_at_max: records.map(record => record.reviewed_at).sort().at(-1),
    profile_version: profileVersion,
    profile_hash: profileHash,
    profile_file: path.relative(runDir, profileFile),
    input_rows: records.length,
    unique_review_keys: jobs.length,
    duplicate_reviews_collapsed: records.length - jobs.length,
    classification_conflicts: jobs.filter(job => job.classification_conflict).length,
    listing_status_conflicts: jobs.filter(job => job.listing_status_conflict).length,
    employment_conflicts: jobs.filter(job => job.conflict_types.includes("employment")).length,
    warnings,
    inputs: provenance
  },
  jobs
};

if (!jobs.length || jobs.some(job => job.classification_conflict && job.filter_stage !== "unknown")) throw new Error("reviewed ledger self-check failed");
writeJSON(output, payload);
console.log(JSON.stringify({ output, ...payload.metadata }, null, 2));
