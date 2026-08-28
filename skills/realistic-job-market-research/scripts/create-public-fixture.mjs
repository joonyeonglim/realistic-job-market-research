#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashValue, ledgerPayload, now, parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: create-public-fixture.mjs --run-dir RUN");
  process.exit(0);
}
const runDir = requireRunDir(args);
if (fs.existsSync(runDir) && fs.readdirSync(runDir).length) throw new Error(`${runDir} must be new or empty`);
const here = path.dirname(fileURLToPath(import.meta.url));
const run = (script, scriptArgs) => {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${script}: ${result.stderr}`);
};
const initArgs = ["--run-dir", runDir];
if (args["profile-config"]) initArgs.push("--profile-config", path.resolve(String(args["profile-config"])));
run("init-run.mjs", initArgs);
const planFile = path.join(runDir, "source-plan.json");
const plan = readJSON(planFile);
const capturedAt = now();
for (const entry of plan.sources) {
  const implemented = entry.adapter_status === "implemented";
  const syntheticInput = { kind: "synthetic_fixture", uri: `fixture:${entry.source}` };
  entry.expected_inputs = [syntheticInput];
  entry.access_mode = "synthetic_fixture";
  const jobs = implemented ? [{
    source: entry.source,
    source_id: "synthetic-1",
    company: `Example ${entry.source}`,
    title: "Applied AI Engineer",
    url: `https://example.com/jobs/${entry.source}`,
    captured_at: capturedAt,
    posted_at: null,
    location: "Example City",
    career_min: 3,
    career_max: 8,
    employment: "Full-time",
    deadline: null,
    status: "active",
    filter_stage: "raw",
    match_terms: ["AI"],
    review_text: "Synthetic fixture only",
    source_payload_hash: hashValue([entry.source, "synthetic-1"]),
    source_fields: {},
    evidence_level: "snapshot"
  }] : [];
  const completeness = implemented ? "partial" : "blocked";
  const payload = ledgerPayload(entry.source, entry.scope, jobs, {
    producer: entry.producer,
    captured_at: capturedAt,
    fetched_rows: jobs.length,
    scope_kind: entry.pagination.method === "feed" ? "feed" : "query",
    queries: entry.queries,
    pagination: { ...entry.pagination, requests: [{ synthetic: true, rows: jobs.length }] },
    completeness,
    limits: [implemented ? "Synthetic public transformation fixture; not live source coverage" : `Synthetic ${entry.adapter_status}; zero real rows`],
    snapshot_kind: "synthetic",
    inputs: [{ ...syntheticInput, captured_at: capturedAt }]
  });
  writeJSON(path.join(runDir, entry.output_path), payload);
  entry.attempt_status = completeness;
  entry.attempts = [{ started_at: capturedAt, finished_at: capturedAt, status: completeness, synthetic: true }];
}
writeJSON(planFile, plan);
run("build-census.mjs", ["--run-dir", runDir]);
run("build-dashboard.mjs", ["--dist", path.join(runDir, "dist"), "--out", path.join(runDir, "site")]);
const manifest = readJSON(path.join(runDir, "dist", "manifest.json"));
writeJSON(path.join(runDir, "fixture-summary.json"), {
  schema_version: 1,
  kind: "synthetic_public_fixture",
  total_source_rows: manifest.total_source_rows,
  source_attempt_counts: manifest.source_attempt_counts,
  source_adapter_counts: manifest.source_adapter_counts
});
console.log(JSON.stringify({ run_dir: runDir, rows: manifest.total_source_rows, sources: plan.sources.length }, null, 2));
