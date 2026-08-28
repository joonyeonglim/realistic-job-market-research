#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  contentFingerprint,
  hashValue,
  hasConsecutiveEmptyPages,
  ledgerPayload,
  mergeSameSourceJobs,
  normalizeSourceRefs,
  parseSaraminCareer,
  readJSON,
  sha256,
  statusGroup,
  validateLedger,
  writeJSON
} from "./common.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-census-selftest-"));
const keep = process.argv.includes("--keep");
const capturedAt = new Date(Date.now() - 1_000).toISOString();

function run(script, args, expected = 0) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], { encoding: "utf8" });
  assert.equal(result.status, expected, `${script}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}
function rawJob(source, sourceId, fields = {}) {
  const job = {
    source,
    source_id: sourceId,
    company: fields.company || "테스트 회사",
    title: fields.title || "AI Product Engineer",
    url: fields.url || `https://example.com/${source}/${sourceId}`,
    captured_at: capturedAt,
    posted_at: fields.posted_at || null,
    location: fields.location || "서울",
    career_min: fields.career_min ?? 3,
    career_max: fields.career_max ?? 10,
    employment: fields.employment ?? "정규직",
    deadline: fields.deadline || null,
    status: fields.status || "active",
    filter_stage: "raw",
    match_terms: fields.match_terms || ["AI"],
    review_text: fields.review_text || "RAG Agent evaluation",
    source_payload_hash: hashValue(fields.payload || { source, sourceId, ...fields }),
    source_fields: {},
    evidence_level: fields.evidence_level || "source_listing"
  };
  job.content_fingerprint = contentFingerprint(job);
  return job;
}
function snapshot(source, scope, jobs) {
  return ledgerPayload(source, scope, jobs, {
    producer: "self-test-producer",
    captured_at: capturedAt,
    fetched_rows: jobs.length,
    scope_kind: "query",
    queries: ["AI"],
    pagination: { method: "page", page_size: 100, requests: [{ page: 1, count: jobs.length }], termination: "reported final page fetched" },
    completeness: "complete_query",
    inputs: [{ kind: "public_search", uri: `https://example.com/${source}`, captured_at: capturedAt }],
    limits: []
  });
}

try {
  assert.equal(hasConsecutiveEmptyPages([2, 1, 2, 0, 0, 0]), true);
  assert.equal(hasConsecutiveEmptyPages([2, 1, 0, 2, 0]), false);
  assert.deepEqual(parseSaraminCareer("경력5년↓"), [0, 5]);
  assert.deepEqual(parseSaraminCareer("경력 5년 이하"), [0, 5]);
  assert.equal(statusGroup("inactive"), "closed");
  const refs = normalizeSourceRefs({
    source: "groupby",
    url: "https://groupby.kr/p/1",
    sources: ["https://groupby.kr/jobs/ai", { source: "linkedin", source_id: "L1", url: "https://linkedin.com/jobs/view/L1" }]
  });
  assert.deepEqual(refs.sources, ["groupby", "linkedin"]);
  assert.equal(refs.sources.some(source => /^https?:/.test(source)), false);
  assert.equal(refs.urls.length, 3);

  const lower = rawJob("work24", "W0", { evidence_level: "search_card", employment: null, review_text: "old" });
  const stronger = rawJob("work24", "W0", { evidence_level: "official_detail_verified", employment: "정규직", review_text: "new", match_terms: ["RAG"] });
  const mergedEvidence = mergeSameSourceJobs([lower, stronger]);
  assert.equal(mergedEvidence.length, 1);
  assert.equal(mergedEvidence[0].evidence_level, "official_detail_verified");
  assert.equal(mergedEvidence[0].employment, "정규직");
  assert.deepEqual(new Set(mergedEvidence[0].match_terms), new Set(["AI", "RAG"]));
  assert.notEqual(contentFingerprint({ ...stronger, review_text: "changed requirements" }), stronger.content_fingerprint);

  const work24Jobs = [
    rawJob("work24", "W1", { review_text: "Agent evaluation" }),
    rawJob("work24", "W2", { review_text: "RAG backend" })
  ];
  const linkedInJobs = [
    rawJob("linkedin", "L2", { company: "Alias Co", title: "AI Engineer", url: "https://linkedin.com/jobs/view/L2" }),
    rawJob("linkedin", "L3", { company: "Alias Co", title: "AI Engineer", url: "https://linkedin.com/jobs/view/L3" })
  ];
  const fixtureDir = path.join(runDir, "fixtures");
  const sourcePlan = {
    schema_version: 1,
    run_id: "self-test",
    started_at: new Date(Date.now() - 2_000).toISOString(),
    target_career_years: 6.2,
    sources: [
      {
        source: "work24", producer: "self-test-producer", expected_inputs: [{ kind: "imported_snapshot", uri: path.join(fixtureDir, "work24.json") }], access_mode: "imported_snapshot", adapter_status: "implemented", governance: { rights_status: "review_required", collection_class: "fixture", minimum_request_interval_ms: 1000 },
        scope: "work24 AI query", queries: ["AI"], pagination: { method: "page", page_size: 100, termination: "reported final page fetched" },
        output_path: "raw/work24.json", minimum_captured_at: capturedAt, attempt_status: "complete_query"
      },
      {
        source: "linkedin", producer: "self-test-producer", expected_inputs: [{ kind: "imported_snapshot", uri: path.join(fixtureDir, "linkedin.json") }], access_mode: "imported_snapshot", adapter_status: "implemented", governance: { rights_status: "review_required", collection_class: "fixture", minimum_request_interval_ms: 1000 },
        scope: "linkedin public cards", queries: ["AI"], pagination: { method: "page", page_size: 100, termination: "reported final page fetched" },
        output_path: "raw/linkedin.json", minimum_captured_at: capturedAt, attempt_status: "complete_query"
      }
    ]
  };
  writeJSON(path.join(runDir, "source-plan.json"), sourcePlan);
  writeJSON(path.join(fixtureDir, "work24.json"), snapshot("work24", "work24 AI query", work24Jobs));
  writeJSON(path.join(fixtureDir, "linkedin.json"), snapshot("linkedin", "linkedin public cards", linkedInJobs));

  run("collect-raw-ledgers.mjs", [
    "--run-dir", runDir, "--phase", "snapshot",
    "--snapshot", `work24=${path.join(fixtureDir, "work24.json")}`,
    "--snapshot", `linkedin=${path.join(fixtureDir, "linkedin.json")}`
  ]);
  assert.equal(readJSON(path.join(runDir, "raw/work24.json")).metadata.snapshot_kind, "imported");
  run("collect-raw-ledgers.mjs", ["--run-dir", runDir, "--phase", "snapshot", "--snapshot", `work24=${path.join(fixtureDir, "work24.json")}`], 1);

  const broken = snapshot("work24", "work24 AI query", [work24Jobs[0]]);
  broken.metadata.fetched_rows = 2;
  assert.throws(() => validateLedger(broken, { expectedSource: "work24" }), /duplicate accounting/);

  const futureRun = path.join(runDir, "future-capture-case");
  const futureCapturedAt = new Date(Date.now() + 60_000).toISOString();
  writeJSON(path.join(futureRun, "source-plan.json"), {
    schema_version: 1,
    run_id: "future-capture-case",
    started_at: capturedAt,
    sources: [{
      source: "blocked_source", producer: "self-test-producer",
      expected_inputs: [{ kind: "live_http", uri: "https://example.com/blocked" }], access_mode: "public_http", adapter_status: "probe_only", governance: { rights_status: "review_required", collection_class: "fixture", minimum_request_interval_ms: 1000 },
      scope: "blocked fixture", queries: [], pagination: { method: "page", page_size: 100, termination: "blocked attempt" },
      output_path: "raw/blocked_source.json", minimum_captured_at: capturedAt, attempt_status: "blocked"
    }]
  });
  writeJSON(path.join(futureRun, "raw/blocked_source.json"), ledgerPayload("blocked_source", "blocked fixture", [], {
    producer: "self-test-producer", captured_at: futureCapturedAt, scope_kind: "public_surface", completeness: "blocked",
    queries: [], pagination: { method: "page", page_size: 100, requests: [], termination: "blocked attempt" },
    inputs: [{ kind: "live_http", uri: "https://example.com/blocked", captured_at: futureCapturedAt }], limits: ["fixture block"]
  }));
  const futureBuild = run("build-census.mjs", ["--run-dir", futureRun], 1);
  assert.match(futureBuild.stderr, /snapshot captured_at cannot be in the future/);

  const profileFile = path.join(runDir, "profile.json");
  writeJSON(profileFile, { profile_version: "self-test-v1", captured_at: capturedAt, career_years: 6.2, source: { path: "fixture-profile.md", sha256: hashValue("fixture-profile") } });
  const profileHash = sha256(profileFile);
  const reviewMeta = reviewedAt => ({ schema_version: 1, reviewed_at: reviewedAt, profile_version: "self-test-v1", profile_hash: profileHash });
  const reviewRow = (job, filterStage, extra = {}) => ({
    source: job.source, source_id: job.source_id, content_fingerprint: job.content_fingerprint,
    reviewed_at: capturedAt, profile_version: "self-test-v1", profile_hash: profileHash,
    filter_stage: filterStage, evidence_level: extra.evidence_level || "detail_verified", match_terms: extra.match_terms || [],
    exclusion_reason: extra.exclusion_reason || null, status: extra.status || "active", employment: extra.employment ?? job.employment
  });
  const oldLinkedIn = rawJob("linkedin", "L1", { company: "Alias Co", title: "AI Engineer", url: "https://linkedin.com/jobs/view/L1" });
  const reviewA = {
    metadata: reviewMeta(capturedAt),
    jobs: [reviewRow(work24Jobs[0], "candidate"), reviewRow(work24Jobs[1], "status_conflict", { status: "employment_conflict" }), reviewRow(oldLinkedIn, "candidate")]
  };
  const reviewB = { metadata: reviewMeta(capturedAt), jobs: [reviewRow(work24Jobs[0], "excluded", { exclusion_reason: "fixture conflict" })] };
  writeJSON(path.join(runDir, "reviewed/a.json"), reviewA);
  writeJSON(path.join(runDir, "reviewed/b.json"), reviewB);
  run("build-ledger.mjs", ["--run-dir", runDir, "--snapshot", path.join(runDir, "reviewed/a.json"), "--snapshot", path.join(runDir, "reviewed/b.json")]);
  const reviewed = readJSON(path.join(runDir, "reviewed/ledger.json"));
  const w1Review = reviewed.jobs.find(job => job.source_id === "W1");
  const w2Review = reviewed.jobs.find(job => job.source_id === "W2");
  assert.equal(w1Review.filter_stage, "unknown");
  assert.equal(w1Review.classification_conflict, true);
  assert.equal(w2Review.conflict_types.includes("employment"), true);
  assert.equal(w2Review.listing_status_conflict, false);

  run("build-census.mjs", ["--run-dir", runDir, "--snapshot", path.join(runDir, "reviewed/ledger.json")]);
  const manifest = readJSON(path.join(runDir, "dist/manifest.json"));
  assert.equal(manifest.total_source_rows, 4);
  assert.equal(manifest.source_attempt_counts.attempted, 2);
  assert.equal(manifest.relevance_counts.unknown, 2);
  assert.equal(manifest.relevance_counts.unreviewed, 2);
  assert.equal(manifest.reviewed_snapshot.matched, 2);
  assert.equal(manifest.reviewed_snapshot.stale, 0);
  assert.equal(manifest.reviewed_snapshot.unmatched, 2);
  assert.equal(manifest.target_career_years, 6.2);
  assert.equal(Date.parse(manifest.captured_at_max) <= Date.parse(manifest.generated_at), true);
  assert.equal(manifest.build_config.actual_payload_bytes, fs.statSync(path.join(runDir, "dist/jobs.js")).size);
  assert.equal(manifest.raw_snapshots.every(snapshotRow => snapshotRow.sha256 && !path.isAbsolute(snapshotRow.file)), true);
  assert.equal(fs.existsSync(path.join(runDir, `.dist-staging-${process.pid}`)), false);
  run("build-dashboard.mjs", ["--dist", path.join(runDir, "dist"), "--out", path.join(runDir, "site")]);
  assert.equal(fs.existsSync(path.join(runDir, "site/index.html")), true);
  assert.equal(fs.existsSync(path.join(runDir, "site/jobs.js")), true);
  console.log(`PASS job-market-census self-test (${runDir})`);
} finally {
  if (!keep) fs.rmSync(runDir, { recursive: true, force: true });
}
