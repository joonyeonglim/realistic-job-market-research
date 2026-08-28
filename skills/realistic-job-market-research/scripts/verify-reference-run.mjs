#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseArgs, readJSON, requireRunDir } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: verify-reference-run.mjs --run-dir RUN [--reference FILE]");
  process.exit(0);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const runDir = requireRunDir(args);
const reference = readJSON(path.resolve(String(args.reference || path.join(here, "../assets/reference-run-2026-08-28.json"))));
const jobsFile = path.join(runDir, "dist", "jobs.js");
if (!fs.existsSync(jobsFile)) throw new Error(`missing ${jobsFile}`);

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(jobsFile, "utf8"), sandbox);
const payload = sandbox.window.JOB_CENSUS;
if (!payload?.metadata || !Array.isArray(payload.rows)) throw new Error("invalid jobs.js payload");
const identity = crypto.createHash("sha256")
  .update(JSON.stringify(payload.rows.map(row => [row[0], row[1], row[22]])))
  .digest("hex");
const checks = {
  source_count: payload.metadata.raw_snapshots?.length,
  total_source_rows: payload.rows.length,
  source_attempt_counts: payload.metadata.source_attempt_counts,
  relevance_counts: payload.metadata.relevance_counts,
  coverage_counts: payload.metadata.coverage_counts,
  row_identity_sha256: identity
};
const mismatches = Object.keys(checks).filter(key => JSON.stringify(checks[key]) !== JSON.stringify(reference[key]));
console.log(JSON.stringify({ run_dir: runDir, reference: reference.run_id, checks, mismatches }, null, 2));
if (mismatches.length) process.exit(1);
