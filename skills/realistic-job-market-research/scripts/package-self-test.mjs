#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repoRoot = path.resolve(root, "../..");
const docsRoot = fs.existsSync(path.join(repoRoot, ".codex-plugin", "plugin.json")) ? repoRoot : root;
const skillPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const skillLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
assert.equal(skillLock.version, skillPackage.version);
assert.equal(skillLock.packages[""].version, skillPackage.version);
if (docsRoot === repoRoot) {
  const versions = ["package.json", "package-lock.json", ".codex-plugin/plugin.json"].map(file => JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8")).version);
  assert.deepEqual(versions, [skillPackage.version, skillPackage.version, skillPackage.version]);
}
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
const runPython = (script, args = []) => run(process.execPath, [path.join(here, "python-runner.mjs"), path.join(here, script), ...args]);
const markdownFiles = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if ([".git", "node_modules"].includes(entry.name)) return [];
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith(".md") ? [file] : [];
});

for (const file of markdownFiles(docsRoot)) {
  const markdown = fs.readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), decodeURI(target))), `${file}: missing link ${target}`);
  }
}

for (const file of fs.readdirSync(here).filter(name => name.endsWith(".mjs"))) {
  run(process.execPath, ["--check", path.join(here, file)]);
}
assert.match(run(process.execPath, [path.join(here, "self-test.mjs")]), /PASS/);
assert.match(run(process.execPath, [path.join(here, "smoke-dashboard.mjs")]), /SMOKE_DASHBOARD_PASS/);
assert.equal(run(process.execPath, [path.join(here, "safe-http-self-test.mjs")]), "SAFE_HTTP_SELF_TEST_PASS");
assert.equal(run(process.execPath, [path.join(here, "source-parsers-self-test.mjs")]), "SOURCE_PARSERS_SELF_TEST_PASS");
assert.equal(run(process.execPath, [path.join(here, "adapter-contract-self-test.mjs")]), "ADAPTER_CONTRACT_PASS");
assert.equal(run(process.execPath, [path.join(here, "verify-public-reference.mjs")]), "PUBLIC_REFERENCE_PASS");
assert.equal(run(process.execPath, [path.join(here, "generate-schemas.mjs")]), "SCHEMAS_IN_SYNC");
assert.equal(run(process.execPath, [path.join(here, "doctor.mjs")]), "SKILL_DOCTOR_PASS");
assert.match(run(process.execPath, [path.join(here, "python-runner.mjs"), "--self-test"]), /^PYTHON_RUNNER_PASS/);
assert.equal(runPython("validate_profile.py", ["--self-test"]), "SELF_TEST_PASS");
assert.equal(runPython("validate_review.py", ["--self-test"]), "SELF_TEST_PASS");
assert.equal(runPython("score_review.py", ["--self-test"]), "SELF_TEST_PASS");
assert.equal(runPython("derive_swing_weights.py", ["--self-test"]), "SWING_WEIGHT_SELF_TEST_PASS");
assert.equal(runPython("evaluate_outcomes.py", ["--self-test"]), "OUTCOME_EVAL_SELF_TEST_PASS");
assert.equal(runPython("validate_profile.py", [path.join(root, "assets/profile.example.json")]), "VALID");
const policy = JSON.parse(fs.readFileSync(path.join(root, "assets/scoring-policy.default.json"), "utf8"));
const registry = JSON.parse(fs.readFileSync(path.join(root, "assets/source-registry.json"), "utf8"));
const adapterCounts = Object.fromEntries(Object.entries(registry.adapter_inventory).map(([key, values]) => [key, values.length]));
const exampleProfile = JSON.parse(fs.readFileSync(path.join(root, "assets/profile.example.json"), "utf8"));
for (const key of ["model_version", "match_weights", "opportunity_weights", "match_values", "axis_values", "confidence_threshold", "sensitivity_profiles"]) assert.deepEqual(exampleProfile.scoring[key], policy[key]);
assert.equal(runPython("validate_review.py", [path.join(root, "assets/score-review.example.json")]), "VALID");
const scored = JSON.parse(runPython("score_review.py", [
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
assert.match(fs.readFileSync(path.join(root, "SKILL.md"), "utf8"), new RegExp(`${adapterCounts.implemented} automated adapters and ${adapterCounts.authenticated_handoff} owner-browser handoffs`));
if (docsRoot === repoRoot) {
  assert.match(fs.readFileSync(path.join(repoRoot, "README.md"), "utf8"), new RegExp(`자동 수집 어댑터 ${adapterCounts.implemented}개와 사용자 브라우저 handoff ${adapterCounts.authenticated_handoff}개`));
  for (const file of ["README.en.md", "AUDIT.md"]) assert.match(fs.readFileSync(path.join(repoRoot, file), "utf8"), new RegExp(`${adapterCounts.implemented} automated collectors and ${adapterCounts.authenticated_handoff} owner-browser handoffs`));
}

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
assert.equal(plan.sources.length, registry.sources.length);
assert.equal(plan.sources.filter(source => source.attempt_status === "planned").length, registry.sources.length);
assert.equal(profile.profile_version, "example-v1");
assert.equal(targets.jobs.length, 1);
assert.deepEqual(
  Object.fromEntries(Object.entries(plan.sources.reduce((counts, source) => ({ ...counts, [source.adapter_status]: (counts[source.adapter_status] || 0) + 1 }), {})).sort()),
  Object.fromEntries(Object.entries(adapterCounts).filter(([, count]) => count > 0))
);
fs.mkdirSync(path.join(runDir, "imports"));
const browserExample = JSON.parse(fs.readFileSync(path.join(root, "assets/browser-export.example.json"), "utf8"));
for (const [source, url] of Object.entries({ jobplanet: "https://www.jobplanet.co.kr/job/example-1", rocketpunch: "https://www.rocketpunch.com/jobs/example-1", remember: "https://career.rememberapp.co.kr/job/example-1" })) {
  fs.writeFileSync(path.join(runDir, "imports", `${source}.json`), `${JSON.stringify({ ...browserExample, source, captured_at: new Date().toISOString(), jobs: [{ ...browserExample.jobs[0], url }] }, null, 2)}\n`);
}
run(process.execPath, [path.join(here, "collect-extended-sources.mjs"), "--run-dir", runDir, "--phase", "jobplanet,rocketpunch,remember"]);
for (const source of ["jobplanet", "rocketpunch", "remember"]) assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, "raw", `${source}.json`), "utf8")).jobs.length, 1);
const noProfileHome = fs.mkdtempSync(path.join(os.tmpdir(), "realistic-job-market-no-profile-"));
const noProfileRun = path.join(noProfileHome, "run");
const noProfile = spawnSync(process.execPath, [path.join(here, "init-run.mjs"), "--run-dir", noProfileRun], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, HOME: noProfileHome }
});
assert.equal(noProfile.status, 0, noProfile.stderr);
assert.equal(fs.existsSync(path.join(noProfileRun, "profile.json")), false);
assert.equal(JSON.parse(fs.readFileSync(path.join(noProfileRun, "source-plan.json"), "utf8")).profile_attached, false);
assert.equal(fs.readFileSync(path.join(noProfileRun, ".gitignore"), "utf8"), "*\n!.gitignore\n");
const profileHome = fs.mkdtempSync(path.join(os.tmpdir(), "realistic-job-market-profile-"));
const initializedProfile = spawnSync(process.execPath, [path.join(here, "init-profile.mjs")], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, HOME: profileHome }
});
assert.equal(initializedProfile.status, 0, initializedProfile.stderr);
const initializedProfilePath = path.join(profileHome, ".config", "realistic-job-market-research", "profile.json");
assert.match(JSON.parse(fs.readFileSync(initializedProfilePath, "utf8")).captured_at, /^\d{4}-\d{2}-\d{2}T/);
if (process.platform !== "win32") assert.equal(fs.statSync(initializedProfilePath).mode & 0o777, 0o600);
assert.deepEqual(pngSize(path.join(root, "assets/icon-large.png")), [512, 512]);
assert.match(fs.readFileSync(path.join(root, "assets/icon-small.svg"), "utf8"), /viewBox="0 0 64 64"/);
console.log("PACKAGE_SELF_TEST_PASS");
