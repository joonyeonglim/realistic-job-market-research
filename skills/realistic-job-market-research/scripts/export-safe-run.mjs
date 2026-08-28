#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: export-safe-run.mjs --run-dir RUN --out DIR --acknowledge-redistribution");
  process.exit(0);
}
if (!args.out || args.out === true) throw new Error("--out DIR is required");
if (!args["acknowledge-redistribution"]) throw new Error("--acknowledge-redistribution is required; privacy redaction is not copyright or terms clearance");
const runDir = requireRunDir(args);
const output = path.resolve(String(args.out));
if ([path.parse(output).root, osHome()].includes(output) || output === runDir || output.startsWith(`${runDir}${path.sep}`)) throw new Error("--out must be a new bounded directory outside the private run");
if (fs.existsSync(output)) throw new Error(`${output} already exists`);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const manifest = readJSON(path.join(runDir, "dist", "manifest.json"));
const jobsSource = fs.readFileSync(path.join(runDir, "dist", "jobs.js"), "utf8").trim();
if (!jobsSource.startsWith("window.JOB_CENSUS=") || !jobsSource.endsWith(";")) throw new Error("unsupported dist/jobs.js format");
const payload = JSON.parse(jobsSource.slice("window.JOB_CENSUS=".length, -1));

const sanitizeSnapshot = item => ({
  source: item.source,
  sha256: item.sha256,
  captured_at: item.captured_at,
  completeness: item.completeness,
  scope: item.scope,
  scope_kind: item.scope_kind,
  rows: item.rows,
  fetched_rows: item.fetched_rows,
  limits: item.limits || []
});
const safeManifest = {
  ...manifest,
  source_plan: { sha256: manifest.source_plan?.sha256 },
  profile: manifest.profile?.attached ? { attached: true, captured_at: manifest.profile.captured_at, version: "redacted" } : { attached: false },
  raw_snapshots: (manifest.raw_snapshots || []).map(sanitizeSnapshot),
  raw_files: undefined,
  reviewed_snapshot: manifest.reviewed_snapshot?.attached
    ? { ...manifest.reviewed_snapshot, path: undefined, sha256: undefined, profile_hash: undefined, profile_version: "redacted" }
    : manifest.reviewed_snapshot,
  build_config: { ...manifest.build_config, actual_payload_bytes: undefined, actual_build_ms: undefined }
};
const safePayload = { metadata: safeManifest, rows: payload.rows };
const serialized = JSON.stringify({ safeManifest, safePayload });
const privacyPolicy = readJSON(path.join(root, "assets", "privacy-patterns.json"));
const sensitive = privacyPolicy.content_patterns.map(item => new RegExp(item.pattern, item.flags));
const sensitiveQuery = new RegExp(privacyPolicy.sensitive_query_key_pattern, "i");
const publicQueryExceptions = (privacyPolicy.public_query_key_exceptions || []).map(item => ({ ...item, value: new RegExp(item.value_pattern) }));
if (sensitive.some(pattern => pattern.test(serialized))) throw new Error("sensitive content detected; export refused");
for (const row of safePayload.rows) {
  const url = String(row[safeManifest.schema.indexOf("url")] || "");
  const parsed = new URL(url);
  for (const key of parsed.searchParams.keys()) {
    const allowed = publicQueryExceptions.some(item => item.hostname === parsed.hostname && item.path === parsed.pathname && item.key === key && item.value.test(parsed.searchParams.get(key) || ""));
    if (sensitiveQuery.test(key) && !allowed) throw new Error(`sensitive URL query parameter detected: ${key}`);
  }
}

const stage = `${output}.staging-${process.pid}`;
fs.mkdirSync(path.join(stage, "dist"), { recursive: true });
writeJSON(path.join(stage, "dist", "manifest.json"), safeManifest);
fs.writeFileSync(path.join(stage, "dist", "jobs.js"), `window.JOB_CENSUS=${JSON.stringify(safePayload)};\n`);
const built = spawnSync(process.execPath, [path.join(here, "build-dashboard.mjs"), "--dist", path.join(stage, "dist"), "--out", path.join(stage, "site")], { encoding: "utf8" });
if (built.status !== 0) {
  fs.rmSync(stage, { recursive: true, force: true });
  throw new Error(`dashboard export failed: ${built.stderr}`);
}
fs.writeFileSync(path.join(stage, "EXPORT-NOTICE.md"), "# Privacy-safe export\n\nPrivate profile paths, hashes, and review profile identifiers were removed. This export is not copyright, terms-of-service, or redistribution clearance.\n");
fs.renameSync(stage, output);
console.log(JSON.stringify({ output, rows: safePayload.rows.length, profile_redacted: true, raw_included: false }, null, 2));

function osHome() {
  return process.env.HOME ? path.resolve(process.env.HOME) : "";
}
