#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const builder = path.join(here, "build-dashboard.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "job-census-dashboard-"));
const dist = path.join(temp, "dist");
const site = path.join(temp, "site");
const total = 40_001;

const schema = ["source", "source_id", "company", "title", "url", "location", "career_min", "career_max", "employment", "deadline", "status", "relevance", "reason", "terms", "region", "career_fit", "employment_group", "completeness", "status_group", "evidence_level"];
const variants = [
  ["alpha", "회사 A", "AI Engineer", "https://example.com/1", "서울", 3, 8, "정규직", "2026-09-01", "active", "candidate", null, ["AI", "RAG"], "seoul", "includes", "full_time", "complete_query", "active", "JD 확인"],
  ["alpha", "<img src=x onerror=alert(1)>", "Backend", "javascript:alert(1)", null, null, null, null, null, "unknown", "unknown", null, [], "unknown", "unknown", "unknown", "partial", "unknown", "확인 필요"],
  ["beta", "회사 B", "Researcher", "https://example.com/3", "경기", 8, null, "계약직", null, "closed", "excluded", "경력 초과", ["LLM"], "gyeonggi", "above", "non_regular", "complete_surface", "closed", null],
  ["beta", "회사 C", "Intern", "https://example.com/4", "원격", 0, 1, "인턴", null, "active", "unreviewed", null, ["Python"], "remote", "below", "intern", "complete_surface", "active", null],
  ["gamma", "회사 D", "Product Engineer", "https://example.com/5", "대한민국", 5, 10, "정규직 또는 계약직", null, "active", "candidate", null, ["Agent"], "korea", "includes", "mixed", "partial", "active", "제품 역할"]
];
const rows = Array.from({ length: total }, (_, index) => {
  const [source, ...rest] = variants[index % variants.length];
  return [source, String(index + 1), ...rest];
});
const tally = index => rows.reduce((counts, row) => {
  counts[row[index]] = (counts[row[index]] || 0) + 1;
  return counts;
}, {});
const payload = { metadata: null, rows };
let jobsSource;
const manifest = {
  schema_version: 1,
  run_id: "synthetic-dashboard-smoke",
  generated_at: "2026-08-24T00:00:00Z",
  schema,
  raw_snapshots: [
    { source: "alpha", file: "raw/alpha.json", captured_at: "2026-08-24T00:00:00Z", completeness: "complete_query", rows: tally(0).alpha, sha256: "a".repeat(64), scope: "synthetic query" },
    { source: "beta", file: "raw/beta.json", captured_at: "2026-08-24T01:00:00Z", completeness: "partial", rows: tally(0).beta, sha256: "b".repeat(64), scope: "synthetic partial" },
    { source: "gamma", file: "raw/gamma.json", captured_at: "2026-08-24T02:00:00Z", completeness: "complete_surface", rows: tally(0).gamma, sha256: "c".repeat(64), scope: "synthetic surface" }
  ],
  source_rows: tally(0),
  source_attempt_counts: { attempted: 3, row_producing: 3, complete: 2, partial: 1, blocked: 0, failed: 0 },
  input_source_rows: total,
  total_source_rows: total,
  duplicate_source_rows_collapsed: 0,
  relevance_counts: tally(schema.indexOf("relevance")),
  coverage_counts: tally(schema.indexOf("completeness")),
  region_counts: tally(schema.indexOf("region")),
  status_counts: tally(schema.indexOf("status_group")),
  career_counts: tally(schema.indexOf("career_fit")),
  employment_counts: tally(schema.indexOf("employment_group")),
  reviewed_snapshot: { attached: false },
  build_config: {
    page_size: 100,
    debounce_ms: 180,
    facets: ["relevance", "source", "region", "status_group", "career_fit", "employment_group", "completeness"],
    max_payload_bytes: 26_214_400,
    max_build_ms: 30_000,
    actual_payload_bytes: 0,
    actual_build_ms: 1
  }
};
for (let attempt = 0; attempt < 8; attempt += 1) {
  payload.metadata = manifest;
  jobsSource = `window.JOB_CENSUS=${JSON.stringify(payload)};\n`;
  const bytes = Buffer.byteLength(jobsSource);
  if (manifest.build_config.actual_payload_bytes === bytes) break;
  manifest.build_config.actual_payload_bytes = bytes;
}
payload.metadata = manifest;
jobsSource = `window.JOB_CENSUS=${JSON.stringify(payload)};\n`;

const runBuilder = (manifestValue, output = site) => {
  fs.writeFileSync(path.join(dist, "manifest.json"), `${JSON.stringify(manifestValue, null, 2)}\n`);
  return spawnSync(process.execPath, [builder, "--dist", dist, "--out", output], { encoding: "utf8" });
};

try {
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "jobs.js"), jobsSource);
  const result = runBuilder(manifest);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rebuild = runBuilder(manifest);
  assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);
  assert.equal(fs.readdirSync(temp).some(name => /^\.site-(staging|backup)-/.test(name)), false);

  const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
  const jobs = fs.readFileSync(path.join(site, "jobs.js"), "utf8");
  assert.ok(Buffer.byteLength(html) <= 262_144, "index budget exceeded");
  assert.ok(Buffer.byteLength(jobs) <= manifest.build_config.max_payload_bytes, "payload budget exceeded");
  for (const hook of ["census-filter", "result-count", "ledger-rows", "page-prev", "page-next", "page-label", "snapshot-rows"]) assert.match(html, new RegExp(`id="${hook}"`));
  for (const filter of ["query", "relevance", "source", "region", "status", "career", "employment", "completeness"]) assert.match(html, new RegExp(`name="${filter}"`));
  assert.match(html, /const pageSize = config\.page_size;/);
  assert.match(html, /const debounceMs = config\.debounce_ms;/);
  assert.match(html, /filtered\.slice\(start, start \+ pageSize\)/);
  assert.match(html, /replace\(\/\[&<>"'\]\/g/);
  assert.match(html, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
  assert.match(html, /max-height: min\(66vh, 720px\); overflow: auto/);
  assert.doesNotMatch(html, /show[-_ ]?all|전체 펼치/i);
  for (const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) new Function(script[1]);

  const context = { window: {} };
  vm.runInNewContext(jobs, context);
  assert.equal(context.window.JOB_CENSUS.rows.length, total);
  assert.equal(context.window.JOB_CENSUS_MANIFEST.total_source_rows, total);
  assert.equal(context.window.JOB_CENSUS_CONFIG.page_size, 100);
  assert.equal(Math.ceil(total / context.window.JOB_CENSUS_CONFIG.page_size), 401);
  assert.match(context.window.JOB_CENSUS_BUILD.payload_sha256, /^[a-f0-9]{64}$/);
  assert.match(context.window.JOB_CENSUS_BUILD.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(context.window.JOB_CENSUS_BUILD.payload_sha256, crypto.createHash("sha256").update(jobsSource).digest("hex"));
  assert.equal(context.window.JOB_CENSUS.rows[1][schema.indexOf("company")], "<img src=x onerror=alert(1)>");

  const unsafeRender = structuredClone(manifest);
  unsafeRender.build_config.page_size = 101;
  assert.notEqual(runBuilder(unsafeRender).status, 0, "page_size=101 must fail");

  const overBudget = structuredClone(manifest);
  overBudget.build_config.max_payload_bytes = Buffer.byteLength(jobsSource) - 1;
  assert.notEqual(runBuilder(overBudget).status, 0, "over-budget payload must fail");

  const overIndexBudget = structuredClone(manifest);
  overIndexBudget.build_config.max_index_bytes = 1;
  assert.notEqual(runBuilder(overIndexBudget).status, 0, "over-budget index must fail");

  const missingBreakdown = structuredClone(manifest);
  delete missingBreakdown.region_counts;
  assert.notEqual(runBuilder(missingBreakdown).status, 0, "missing breakdown must fail");
  console.log(`SMOKE_DASHBOARD_PASS rows=${total} pages=401 filters=8 page_size=100`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
