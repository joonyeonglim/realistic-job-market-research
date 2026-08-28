#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadSourcePlan, parseArgs, readJSON, requireRunDir, sha256, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: create-review-queue.mjs --run-dir RUN --query TEXT [--limit 50] [--output reviewed/score-queue.json]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const query = String(args.query || "").trim().toLocaleLowerCase("ko-KR");
if (!query) throw new Error("--query TEXT is required; do not pretend the full census was deeply reviewed");
const limit = Number(args.limit || 50);
if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("--limit must be 1..200");
const profileFile = path.join(runDir, "profile.json");
if (!fs.existsSync(profileFile)) throw new Error("review queue requires a private profile snapshot");
const profile = readJSON(profileFile);
const { plan } = loadSourcePlan(runDir);
const jobs = plan.sources.flatMap(entry => readJSON(path.join(runDir, entry.output_path)).jobs);
const selected = jobs.filter(job => [job.company, job.title, job.location, ...(job.match_terms || [])].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR").includes(query)).slice(0, limit);
const output = path.resolve(runDir, String(args.output || "reviewed/score-queue.json"));
if (fs.existsSync(output)) throw new Error(`${output} already exists`);
writeJSON(output, {
  schema_version: 1,
  kind: "score_review_queue",
  created_at: new Date().toISOString(),
  query,
  limit,
  profile_version: profile.profile_version,
  profile_hash: sha256(profileFile),
  coverage_limit: `${selected.length} query-matched rows only; every item remains unresolved until exact JD and employer evidence are reviewed`,
  items: selected.map(job => ({
    source: job.source,
    source_id: String(job.source_id),
    content_fingerprint: job.content_fingerprint,
    company: job.company,
    title: job.title,
    url: job.url,
    current_status: "UNKNOWN",
    mandatory_requirements: "UNRESOLVED",
    company_identity: "UNRESOLVED",
    finance: "UNRESOLVED",
    location_work_policy: "UNRESOLVED",
    hiring_process: "UNRESOLVED",
    compensation: "UNRESOLVED"
  }))
});
console.log(JSON.stringify({ output, items: selected.length, query }, null, 2));
