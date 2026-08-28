#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
};

for (const file of fs.readdirSync(here).filter(name => name.endsWith(".mjs"))) {
  run(process.execPath, ["--check", path.join(here, file)]);
}
assert.match(run(process.execPath, [path.join(here, "self-test.mjs")]), /PASS/);
assert.match(run(process.execPath, [path.join(here, "smoke-dashboard.mjs")]), /SMOKE_DASHBOARD_PASS/);
assert.equal(run("python3", [path.join(here, "validate_profile.py"), "--self-test"]), "SELF_TEST_PASS");
assert.equal(run("python3", [path.join(here, "validate_review.py"), "--self-test"]), "SELF_TEST_PASS");
assert.equal(run("python3", [path.join(here, "validate_profile.py"), path.join(root, "assets/profile.example.json")]), "VALID");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "realistic-job-market-skill-"));
const runDir = path.join(temp, "run");
run(process.execPath, [
  path.join(here, "init-run.mjs"),
  "--run-dir", runDir,
  "--profile-config", path.join(root, "assets/profile.example.json"),
  "--official-targets", path.join(root, "assets/official-targets.example.json")
]);
const plan = JSON.parse(fs.readFileSync(path.join(runDir, "source-plan.json"), "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(runDir, "profile.json"), "utf8"));
const targets = JSON.parse(fs.readFileSync(path.join(runDir, "official-targets.json"), "utf8"));
assert.equal(plan.sources.length, 29);
assert.equal(plan.sources.filter(source => source.attempt_status === "planned").length, 29);
assert.equal(profile.profile_version, "example-v1");
assert.equal(targets.jobs.length, 1);
console.log("PACKAGE_SELF_TEST_PASS");
