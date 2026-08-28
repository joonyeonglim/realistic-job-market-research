#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  isISODate,
  loadSourcePlan,
  normalizeStage,
  now,
  parseArgs,
  readJSON,
  requireRunDir,
  sha256,
  unique,
  writeJSON
} from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: create-review-snapshot.mjs --run-dir RUN --decisions decisions.json [--output reviewed/manual.json]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const decisionsFile = args.decisions ? path.resolve(String(args.decisions)) : null;
if (!decisionsFile || !fs.existsSync(decisionsFile)) throw new Error("--decisions JSON file is required");
const { plan } = loadSourcePlan(runDir);
const profileFile = path.join(runDir, "profile.json");
if (!fs.existsSync(profileFile)) throw new Error(`profile snapshot not found: ${profileFile}`);
const profile = readJSON(profileFile);
const profileHash = sha256(profileFile);
const input = readJSON(decisionsFile);
if (!Array.isArray(input.jobs) || !input.jobs.length) throw new Error(`${decisionsFile}: expected non-empty jobs[]`);
const reviewedAt = input.reviewed_at || now();
if (!isISODate(reviewedAt)) throw new Error(`${decisionsFile}: reviewed_at must be ISO-8601`);

const rawByKey = new Map();
for (const entry of plan.sources) {
  const file = path.resolve(runDir, entry.output_path);
  if (!fs.existsSync(file)) throw new Error(`missing raw snapshot: ${file}`);
  const payload = readJSON(file);
  for (const job of payload.jobs || []) rawByKey.set(`${job.source}|${job.source_id}`, job);
}

const seen = new Set();
const jobs = input.jobs.map((decision, index) => {
  const key = `${decision.source}|${decision.source_id}`;
  if (seen.has(key)) throw new Error(`${decisionsFile}: duplicate jobs[${index}] ${key}`);
  seen.add(key);
  const raw = rawByKey.get(key);
  if (!raw) throw new Error(`${decisionsFile}: jobs[${index}] not found in current raw: ${key}`);
  const stage = normalizeStage(decision.filter_stage);
  return {
    source: raw.source,
    source_id: String(raw.source_id),
    content_fingerprint: raw.content_fingerprint,
    reviewed_at: reviewedAt,
    profile_version: profile.profile_version,
    profile_hash: profileHash,
    filter_stage: stage,
    evidence_level: decision.evidence_level || "detail_verified",
    evidence_url: decision.evidence_url || raw.url,
    status: decision.status || raw.status,
    employment: decision.employment ?? raw.employment ?? null,
    match_terms: unique(decision.match_terms || [`reviewed-${stage}`]),
    exclusion_reason: decision.exclusion_reason || null,
    review_note: decision.review_note || ""
  };
});

const output = path.resolve(runDir, String(args.output || "reviewed/manual.json"));
writeJSON(output, {
  metadata: {
    schema_version: 1,
    reviewed_at: reviewedAt,
    profile_version: profile.profile_version,
    profile_hash: profileHash,
    scope: input.scope || `${jobs.length} manually reviewed current rows`,
    limits: input.limits || ["Review labels are not application or offer decisions"]
  },
  jobs
});
console.log(JSON.stringify({ output, rows: jobs.length, profile_version: profile.profile_version, profile_hash: profileHash }, null, 2));
