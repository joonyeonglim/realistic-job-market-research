#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadSourcePlan, now, parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: sync-source-plan.mjs --run-dir RUN");
  process.exit(0);
}

const runDir = requireRunDir(args);
const { plan, file } = loadSourcePlan(runDir);
const missing = [];
for (const entry of plan.sources) {
  const rawFile = path.resolve(runDir, entry.output_path);
  if (!fs.existsSync(rawFile)) {
    missing.push(entry.source);
    continue;
  }
  const payload = readJSON(rawFile);
  entry.attempt_status = payload.metadata?.completeness;
  entry.attempts = [{
    captured_at: payload.metadata?.captured_at,
    completeness: payload.metadata?.completeness,
    rows: payload.jobs?.length ?? 0,
    limits: payload.metadata?.limits || []
  }];
}
if (missing.length) throw new Error(`missing raw snapshots: ${missing.join(", ")}`);
plan.updated_at = now();
writeJSON(file, plan);
console.log(JSON.stringify({ source_plan: file, terminal_sources: plan.sources.length }, null, 2));
