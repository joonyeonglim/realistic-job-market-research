#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, requireRunDir } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: run-census.mjs --run-dir RUN [--profile-config FILE] [--official-targets FILE] [--review-snapshot FILE] [--from-frozen-raw]");
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const runDir = requireRunDir(args);
const run = (script, scriptArgs = []) => {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}`);
};

if (!fs.existsSync(path.join(runDir, "source-plan.json"))) {
  const initArgs = ["--run-dir", runDir];
  if (args["profile-config"]) initArgs.push("--profile-config", String(args["profile-config"]));
  if (args["official-targets"]) initArgs.push("--official-targets", String(args["official-targets"]));
  run("init-run.mjs", initArgs);
}

if (!args["from-frozen-raw"]) {
  run("collect-raw-ledgers.mjs", ["--run-dir", runDir, "--phase", "all"]);
  run("collect-extended-sources.mjs", ["--run-dir", runDir]);
}
run("sync-source-plan.mjs", ["--run-dir", runDir]);
const buildArgs = ["--run-dir", runDir];
if (args["review-snapshot"]) {
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
