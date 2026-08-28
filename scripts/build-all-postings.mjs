#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  assertFreshSnapshot,
  contentFingerprint,
  isISODate,
  loadSourcePlan,
  normalizeStage,
  now,
  parseArgs,
  readJSON,
  regionOf,
  requireRunDir,
  sha256,
  snapshotProvenance,
  statusGroup,
  unique,
  validateLedger,
  valuesOf,
  writeJSON
} from "./common.mjs";

const started = Date.now();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: build-all-postings.mjs --run-dir RUN [--snapshot reviewed/ledger.json] [--career-years N] [--max-payload-bytes N]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const { plan, file: planFile } = loadSourcePlan(runDir, args["source-plan"] ? path.resolve(String(args["source-plan"])) : undefined);
const terminalStates = new Set(["complete_query", "complete_surface", "partial", "blocked", "failed"]);
const rawDir = path.join(runDir, "raw");
const distDir = path.join(runDir, "dist");
const stageDir = path.join(runDir, `.dist-staging-${process.pid}`);
const maxPayloadBytes = integerOption("max-payload-bytes", 26_214_400, 1);
const maxBuildMs = integerOption("max-build-ms", 30_000, 1);
const targetCareer = finiteOrNull(args["career-years"] ?? plan.target_career_years);

function integerOption(name, fallback, minimum) {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return value;
}
function finiteOrNull(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}
function careerFit(job) {
  if (targetCareer === null) return "unknown";
  const minimum = finiteOrNull(job.career_min);
  const maximum = finiteOrNull(job.career_max);
  if (minimum === null && maximum === null) return "unknown";
  if (minimum !== null && minimum > targetCareer) return "above";
  if (maximum !== null && maximum < targetCareer) return "below";
  return "includes";
}
function employmentGroup(job) {
  const text = `${job.employment || ""} ${job.title || ""}`.toLowerCase();
  const fullTime = /정규직|full[- ]?time/.test(text);
  const intern = /인턴|intern/.test(text);
  const nonRegular = /계약|프리랜서|파견|위촉|아르바이트|part[- ]?time|contract|freelance/.test(text);
  if ((fullTime && nonRegular) || (fullTime && intern)) return "mixed";
  if (intern) return "intern";
  if (nonRegular) return "non_regular";
  if (fullTime) return "full_time";
  return "unknown";
}
const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const object = map => Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
const sum = counts => Object.values(counts).reduce((total, value) => total + value, 0);

function listedRawFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".staging") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listedRawFiles(target));
    else if (entry.name.endsWith(".json")) files.push(path.resolve(target));
  }
  return files.sort();
}

const rawSnapshots = [];
const rawJobs = [];
const sourceRows = new Map();
const coverageBySource = new Map();
let inputSourceRows = 0;
let duplicateSourceRowsCollapsed = 0;
let invalidSourceRows = 0;
for (const entry of plan.sources) {
  if (!terminalStates.has(entry.attempt_status)) throw new Error(`${entry.source}: attempt_status ${entry.attempt_status} is not terminal`);
  const file = path.resolve(runDir, entry.output_path);
  if (!fs.existsSync(file)) throw new Error(`${entry.source}: planned raw snapshot missing: ${file}`);
  const payload = readJSON(file);
  validateLedger(payload, { expectedSource: entry.source, label: file });
  assertFreshSnapshot(payload, entry, file);
  if (payload.metadata.completeness !== entry.attempt_status) throw new Error(`${entry.source}: attempt_status and snapshot completeness differ`);
  const jobCaptured = payload.jobs.map(job => job.captured_at).sort();
  if (jobCaptured.length && jobCaptured.at(-1) !== payload.metadata.captured_at) throw new Error(`${entry.source}: metadata.captured_at does not equal the latest emitted job capture`);
  sourceRows.set(entry.source, payload.jobs.length);
  coverageBySource.set(entry.source, payload.metadata.completeness);
  inputSourceRows += Number(payload.metadata.fetched_rows);
  duplicateSourceRowsCollapsed += Number(payload.metadata.duplicates_removed);
  invalidSourceRows += Number(payload.metadata.invalid_rows);
  rawJobs.push(...payload.jobs);
  rawSnapshots.push(snapshotProvenance(runDir, file, payload));
}

const plannedFiles = new Set(plan.sources.map(entry => path.resolve(runDir, entry.output_path)));
const extraRawFiles = listedRawFiles(rawDir).filter(file => !plannedFiles.has(file));
if (extraRawFiles.length) throw new Error(`unplanned raw snapshots found: ${extraRawFiles.join(", ")}`);
const identities = new Set();
for (const job of rawJobs) {
  const key = `${job.source}|${job.source_id}`;
  if (identities.has(key)) throw new Error(`cross-snapshot duplicate source identity: ${key}`);
  identities.add(key);
}

let profile = null;
let profileHash = null;
const profileFile = path.resolve(String(args.profile || path.join(runDir, "profile.json")));
if (fs.existsSync(profileFile)) {
  profile = readJSON(profileFile);
  if (!profile.profile_version || !isISODate(profile.captured_at)) throw new Error(`${profileFile}: profile_version and ISO captured_at are required`);
  profileHash = sha256(profileFile);
}

const reviewValues = valuesOf(args.snapshot);
if (reviewValues.length > 1) throw new Error("build the reviewed ledger first; build-all-postings accepts one --snapshot");
const reviewFile = reviewValues.length ? path.resolve(String(reviewValues[0]).replace(/^[^=]+=/, "")) : null;
const reviewByExact = new Map();
const reviewByIdentity = new Map();
let reviewPayload = null;
if (reviewFile) {
  if (!fs.existsSync(reviewFile)) throw new Error(`reviewed ledger not found: ${reviewFile}`);
  if (!profile || !profileHash) throw new Error("review attachment requires profile.json");
  reviewPayload = readJSON(reviewFile);
  if (reviewPayload.metadata?.kind !== "reviewed_ledger" || reviewPayload.metadata.profile_version !== profile.profile_version || reviewPayload.metadata.profile_hash !== profileHash || !Array.isArray(reviewPayload.jobs)) {
    throw new Error(`${reviewFile}: reviewed ledger/profile contract mismatch`);
  }
  for (const review of reviewPayload.jobs) {
    const identity = `${review.source}|${review.source_id}`;
    const exact = `${identity}|${review.content_fingerprint}|${review.profile_version}|${review.profile_hash}`;
    reviewByExact.set(exact, review);
    if (!reviewByIdentity.has(identity)) reviewByIdentity.set(identity, []);
    reviewByIdentity.get(identity).push(review);
  }
}

const schema = [
  "source", "source_id", "company", "title", "url", "location", "career_min", "career_max", "employment", "deadline",
  "status", "relevance", "reason", "terms", "region", "career_fit", "employment_group", "completeness", "status_group",
  "listing_status_conflict", "conflict_types", "captured_at", "posted_at", "content_fingerprint", "reviewed_at", "profile_version", "evidence", "evidence_level"
];
const sourceCount = new Map();
const relevanceCount = new Map();
const coverageCount = new Map();
const regionCount = new Map();
const statusCount = new Map();
const careerCount = new Map();
const employmentCount = new Map();
let matchedReviews = 0;
let staleReviews = 0;
let unmatchedReviews = 0;

const rows = rawJobs.map(job => {
  const identity = `${job.source}|${job.source_id}`;
  const exact = `${identity}|${job.content_fingerprint}|${profile?.profile_version || ""}|${profileHash || ""}`;
  const review = reviewByExact.get(exact);
  const hasStaleReview = !review && reviewByIdentity.has(identity);
  if (review && !review.legacy_unreviewed) matchedReviews += 1;
  else if (hasStaleReview) staleReviews += 1;
  else unmatchedReviews += 1;
  const relevance = review && !review.legacy_unreviewed ? normalizeStage(review.filter_stage) : "unreviewed";
  const completeness = coverageBySource.get(job.source);
  const region = regionOf(job.location);
  const status = statusGroup(job.status);
  const career = careerFit(job);
  const employment = employmentGroup(job);
  const listingStatusConflict = Boolean(job.status_conflict || review?.listing_status_conflict);
  const conflictTypes = unique([...(job.conflict_types || []), ...(review?.conflict_types || [])]);
  count(sourceCount, job.source);
  count(relevanceCount, relevance);
  count(coverageCount, completeness);
  count(regionCount, region);
  count(statusCount, status);
  count(careerCount, career);
  count(employmentCount, employment);
  return [
    job.source, String(job.source_id), job.company, job.title, job.url, job.location || null,
    job.career_min ?? null, job.career_max ?? null, job.employment || null, job.deadline || null,
    job.status || "unknown", relevance, review?.exclusion_reason || null,
    unique([...(job.match_terms || []), ...(review?.match_terms || [])]), region, career, employment,
    completeness, status, listingStatusConflict, conflictTypes, job.captured_at, job.posted_at || null,
    job.content_fingerprint, review?.reviewed_at || null, review?.profile_version || null,
    review?.evidence_level || job.evidence_level || "search_card", review?.evidence_level || job.evidence_level || "search_card"
  ];
});

for (const key of ["candidate", "unknown", "excluded", "unreviewed"]) if (!relevanceCount.has(key)) relevanceCount.set(key, 0);
const sourceRowsObject = object(sourceRows);
const relevanceCounts = object(relevanceCount);
const coverageCounts = object(coverageCount);
const regionCounts = object(regionCount);
const statusCounts = object(statusCount);
const careerCounts = object(careerCount);
const employmentCounts = object(employmentCount);
const totalSourceRows = rows.length;
for (const [name, counts] of Object.entries({ source_rows: sourceRowsObject, relevance_counts: relevanceCounts, coverage_counts: coverageCounts, region_counts: regionCounts, status_counts: statusCounts, career_counts: careerCounts, employment_counts: employmentCounts })) {
  if (sum(counts) !== totalSourceRows) throw new Error(`${name} sum does not equal total_source_rows`);
}
if (rows.some(row => row.length !== schema.length || !row[0] || !row[1] || !row[2] || !row[3] || !/^https?:\/\//i.test(row[4]))) throw new Error("row schema validation failed");

const sourceAttemptCounts = {
  attempted: plan.sources.length,
  row_producing: [...sourceRows.values()].filter(value => value > 0).length,
  complete: plan.sources.filter(entry => entry.attempt_status.startsWith("complete_")).length,
  partial: plan.sources.filter(entry => entry.attempt_status === "partial").length,
  blocked: plan.sources.filter(entry => entry.attempt_status === "blocked").length,
  failed: plan.sources.filter(entry => entry.attempt_status === "failed").length
};
if (sourceAttemptCounts.complete + sourceAttemptCounts.partial + sourceAttemptCounts.blocked + sourceAttemptCounts.failed !== sourceAttemptCounts.attempted) throw new Error("source attempt accounting failed");
if (inputSourceRows !== totalSourceRows + duplicateSourceRowsCollapsed + invalidSourceRows) throw new Error("raw row accounting failed");
if (matchedReviews + staleReviews + unmatchedReviews !== totalSourceRows) throw new Error("current review join accounting failed");

const jobCapturedTimes = rawJobs.map(job => job.captured_at).sort();
const snapshotCapturedTimes = rawSnapshots.map(snapshot => snapshot.captured_at).sort();
const rawByIdentity = new Map(rawJobs.map(job => [`${job.source}|${job.source_id}`, job]));
const reviewInputCounts = { matched: 0, stale: 0, orphan: 0 };
if (reviewPayload) for (const review of reviewPayload.jobs) {
  const identity = `${review.source}|${review.source_id}`;
  const current = rawByIdentity.get(identity);
  if (!current) reviewInputCounts.orphan += 1;
  else if (!review.legacy_unreviewed && current.content_fingerprint === review.content_fingerprint && review.profile_version === profile?.profile_version && review.profile_hash === profileHash) reviewInputCounts.matched += 1;
  else reviewInputCounts.stale += 1;
}
if (reviewInputCounts.matched + reviewInputCounts.stale + reviewInputCounts.orphan !== (reviewPayload?.jobs.length || 0)) throw new Error("review input accounting failed");
const generatedAt = now();
if (snapshotCapturedTimes.length && Date.parse(snapshotCapturedTimes.at(-1)) > Date.parse(generatedAt)) throw new Error("snapshot captured_at cannot be in the future relative to generated_at");
if (jobCapturedTimes.length && Date.parse(jobCapturedTimes.at(-1)) > Date.parse(generatedAt)) throw new Error("job captured_at cannot be in the future relative to generated_at");
if (profile && Date.parse(profile.captured_at) > Date.parse(generatedAt)) throw new Error("profile captured_at cannot be in the future relative to generated_at");
const buildConfig = {
  page_size: 100,
  debounce_ms: 180,
  facets: ["relevance", "source", "region", "status_group", "career_fit", "employment_group", "completeness"],
  max_payload_bytes: maxPayloadBytes,
  max_index_bytes: 262_144,
  max_local_load_ms: 2_000,
  max_filter_ms: 250,
  max_build_ms: maxBuildMs,
  actual_payload_bytes: 0,
  actual_build_ms: 0
};
const manifest = {
  schema_version: 1,
  run_id: plan.run_id,
  generated_at: generatedAt,
  source_plan: { path: path.relative(runDir, planFile), sha256: sha256(planFile) },
  profile: profile ? { attached: true, path: path.relative(runDir, profileFile), sha256: profileHash, version: profile.profile_version, captured_at: profile.captured_at } : { attached: false },
  schema,
  target_career_years: targetCareer,
  raw_snapshots: rawSnapshots,
  raw_files: rawSnapshots.map(snapshot => snapshot.file),
  source_rows: sourceRowsObject,
  input_source_rows: inputSourceRows,
  total_source_rows: totalSourceRows,
  duplicate_source_rows_collapsed: duplicateSourceRowsCollapsed,
  invalid_source_rows: invalidSourceRows,
  row_source_count: sourceAttemptCounts.row_producing,
  source_attempt_counts: sourceAttemptCounts,
  relevance_counts: relevanceCounts,
  coverage_counts: coverageCounts,
  region_counts: regionCounts,
  status_counts: statusCounts,
  career_counts: careerCounts,
  employment_counts: employmentCounts,
  posting_status_conflicts: rows.filter(row => row[schema.indexOf("listing_status_conflict")]).length,
  limits: rawSnapshots.flatMap(snapshot => snapshot.limits.map(limit => ({ source: snapshot.source, limit }))),
  captured_at_min: snapshotCapturedTimes[0] || null,
  captured_at_max: snapshotCapturedTimes.at(-1) || null,
  job_captured_at_min: jobCapturedTimes[0] || null,
  job_captured_at_max: jobCapturedTimes.at(-1) || null,
  reviewed_snapshot: reviewPayload ? {
    attached: true,
    path: path.relative(runDir, reviewFile),
    sha256: sha256(reviewFile),
    reviewed_at_min: reviewPayload.metadata.reviewed_at_min,
    reviewed_at_max: reviewPayload.metadata.reviewed_at_max,
    profile_version: reviewPayload.metadata.profile_version,
    profile_hash: reviewPayload.metadata.profile_hash,
    join_key: "source|source_id|content_fingerprint|profile_version|profile_hash",
    matched: matchedReviews,
    stale: staleReviews,
    unmatched: unmatchedReviews,
    current_join_counts: { matched: matchedReviews, stale: staleReviews, unreviewed: unmatchedReviews },
    review_input_counts: reviewInputCounts
  } : { attached: false, matched: 0, stale: 0, unmatched: totalSourceRows, current_join_counts: { matched: 0, stale: 0, unreviewed: totalSourceRows }, review_input_counts: reviewInputCounts },
  build_config: buildConfig
};

if (fs.existsSync(distDir)) throw new Error(`${distDir} already exists; census runs are immutable`);
if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true });
fs.mkdirSync(stageDir, { recursive: true });
try {
  let javascript;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    manifest.build_config.actual_build_ms = Date.now() - started;
    javascript = `window.JOB_CENSUS=${JSON.stringify({ metadata: manifest, rows })};\n`;
    const bytes = Buffer.byteLength(javascript);
    if (manifest.build_config.actual_payload_bytes === bytes) break;
    manifest.build_config.actual_payload_bytes = bytes;
  }
  javascript = `window.JOB_CENSUS=${JSON.stringify({ metadata: manifest, rows })};\n`;
  const payloadBytes = Buffer.byteLength(javascript);
  if (payloadBytes !== manifest.build_config.actual_payload_bytes) throw new Error("payload byte fixed-point failed");
  if (payloadBytes > maxPayloadBytes) throw new Error(`jobs.js ${payloadBytes} bytes exceeds ${maxPayloadBytes}`);
  if (Date.now() - started > maxBuildMs) throw new Error(`build exceeded ${maxBuildMs}ms`);
  fs.writeFileSync(path.join(stageDir, "jobs.js"), javascript);
  writeJSON(path.join(stageDir, "manifest.json"), manifest);
  fs.renameSync(stageDir, distDir);
} catch (error) {
  if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true });
  throw error;
}

console.log(JSON.stringify({ run_id: plan.run_id, total_source_rows: totalSourceRows, source_attempt_counts: sourceAttemptCounts, relevance_counts: relevanceCounts, coverage_counts: coverageCounts, dist: distDir }, null, 2));
