#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pngSize = file => {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
};
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
assert.equal(run("python3", [path.join(here, "score_review.py"), "--self-test"]), "SELF_TEST_PASS");
assert.equal(run("python3", [path.join(here, "validate_profile.py"), path.join(root, "assets/profile.example.json")]), "VALID");
assert.equal(run("python3", [path.join(here, "validate_review.py"), path.join(root, "assets/score-review.example.json")]), "VALID");
const scored = JSON.parse(run("python3", [
  path.join(here, "score_review.py"),
  "--input", path.join(root, "assets/score-review.example.json"),
  "--profile", path.join(root, "assets/profile.example.json")
]));
assert.equal(scored.roles[0].match_score, 98);
assert.equal(scored.roles[0].opportunity_score, 84.9);
assert.equal(scored.roles[0].evidence_confidence, 93);
assert.equal(scored.roles[0].match_calculation.numerator, 9020);
assert.equal(scored.roles[0].match_calculation.denominator, 92);
assert.equal(scored.roles[0].match_calculation.raw_score, 98.0435);
assert.equal(scored.roles[0].opportunity_calculation.numerator, 8491.9565);
assert.equal(scored.roles[0].opportunity_calculation.denominator, 100);
assert.equal(scored.roles[0].opportunity_calculation.raw_score, 84.9196);
assert.equal(scored.roles[0].confidence_calculation.raw_score, 93);
assert.equal(scored.roles[0].sensitivity_rank.fit_first, 1);

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
assert.deepEqual(pngSize(path.join(root, "assets/social-preview.png")), [1200, 630]);
assert.deepEqual(pngSize(path.join(root, "assets/github-social-preview.png")), [1280, 640]);
assert.deepEqual(pngSize(path.join(root, "assets/workflow-overview.png")), [1600, 900]);
assert.deepEqual(pngSize(path.join(root, "assets/brand/hero-background.png")), [1536, 1024]);
assert.match(fs.readFileSync(path.join(root, "assets/workflow-overview.svg"), "utf8"), /viewBox="0 0 1600 900"/);
console.log("PACKAGE_SELF_TEST_PASS");
