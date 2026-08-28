#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, requireRunDir } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: run-census.mjs --run-dir RUN [--profile-config FILE] [--official-targets FILE] [--review-snapshot FILE] [--from-frozen-raw] [--acknowledge-source-policy]");
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const runDir = requireRunDir(args);
const run = (script, scriptArgs = []) => {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}`);
};

fs.mkdirSync(runDir, { recursive: true });
const lockFile = path.join(runDir, ".run.lock");
let lockHandle;
try {
  lockHandle = fs.openSync(lockFile, "wx", 0o600);
  fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
} catch (error) {
  throw new Error(`run is already owned or has a stale lock: ${lockFile}; inspect it before removal (${error.message})`);
}

try {
if (!fs.existsSync(path.join(runDir, "source-plan.json"))) {
  const initArgs = ["--run-dir", runDir];
  if (args["profile-config"]) initArgs.push("--profile-config", String(args["profile-config"]));
  if (args["official-targets"]) initArgs.push("--official-targets", String(args["official-targets"]));
  if (args["acknowledge-source-policy"]) initArgs.push("--acknowledge-source-policy");
  run("init-run.mjs", initArgs);
}

if (!args["from-frozen-raw"]) {
  if (!args["acknowledge-source-policy"]) throw new Error("live collection requires --acknowledge-source-policy after reviewing references/source-governance.md");
  run("collect-raw-ledgers.mjs", ["--run-dir", runDir, "--phase", "all"]);
  run("collect-extended-sources.mjs", ["--run-dir", runDir]);
}
run("sync-source-plan.mjs", ["--run-dir", runDir]);
const buildArgs = ["--run-dir", runDir];
if (args["review-snapshot"]) {
  if (!fs.existsSync(path.join(runDir, "profile.json"))) throw new Error("--review-snapshot requires a private profile snapshot; initialize the run with --profile-config");
  const reviewSnapshot = path.resolve(String(args["review-snapshot"]));
  const ledger = path.join(runDir, "reviewed", "ledger.json");
  run("build-ledger.mjs", [
    "--run-dir", runDir,
    "--snapshot", reviewSnapshot,
    "--profile", path.join(runDir, "profile.json"),
    "--output", ledger
  ]);
  buildArgs.push("--snapshot", ledger);
}
run("build-census.mjs", buildArgs);
run("build-dashboard.mjs", ["--dist", path.join(runDir, "dist"), "--out", path.join(runDir, "site")]);
run("self-test.mjs");
run("smoke-dashboard.mjs");
console.log(JSON.stringify({ run_dir: runDir, dashboard: path.join(runDir, "site", "index.html") }, null, 2));
} finally {
  if (lockHandle !== undefined) fs.closeSync(lockHandle);
  try {
    const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (lock.pid === process.pid) fs.unlinkSync(lockFile);
  } catch {
    // Preserve an unreadable or foreign lock for manual inspection.
  }
}
