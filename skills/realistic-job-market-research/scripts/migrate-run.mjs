#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, readJSON, requireRunDir, sha256, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: migrate-run.mjs --run-dir OLD --out NEW");
  process.exit(0);
}
const oldRun = requireRunDir(args);
if (!args.out || args.out === true) throw new Error("--out NEW is required");
const newRun = path.resolve(String(args.out));
if (fs.existsSync(newRun) && fs.readdirSync(newRun).length) throw new Error(`${newRun} must be new or empty`);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const registry = readJSON(path.join(root, "assets", "source-registry.json"));
const governance = readJSON(path.join(root, "assets", "source-governance.json"));
const inventory = new Map(Object.entries(registry.adapter_inventory).flatMap(([status, names]) => names.map(source => [source, status])));
const collectionClass = new Map(Object.entries(governance.collection_classes).flatMap(([value, names]) => names.map(source => [source, value])));
const oldPlanFile = path.join(oldRun, "source-plan.json");
const plan = readJSON(oldPlanFile);
for (const entry of plan.sources) {
  if (!inventory.has(entry.source) || !collectionClass.has(entry.source)) throw new Error(`current policy no longer recognizes source ${entry.source}`);
  entry.adapter_status = inventory.get(entry.source);
  entry.governance = { ...governance.defaults, collection_class: collectionClass.get(entry.source) };
}
plan.profile_attached = fs.existsSync(path.join(oldRun, "profile.json"));
plan.governance = { path: "assets/source-governance.json", policy_version: governance.policy_version, acknowledged_at: null, migrated_private_snapshot: true };
fs.mkdirSync(newRun, { recursive: true });
fs.writeFileSync(path.join(newRun, ".gitignore"), "*\n!.gitignore\n");
writeJSON(path.join(newRun, "source-plan.json"), plan);
for (const file of ["profile.json", "official-targets.json", "final-report.md", "realistic-assessment.md"]) if (fs.existsSync(path.join(oldRun, file))) fs.copyFileSync(path.join(oldRun, file), path.join(newRun, file));
if (fs.existsSync(path.join(newRun, "profile.json"))) fs.chmodSync(path.join(newRun, "profile.json"), 0o600);
fs.cpSync(path.join(oldRun, "raw"), path.join(newRun, "raw"), { recursive: true, filter: source => !source.includes(`${path.sep}.staging`) });
if (fs.existsSync(path.join(oldRun, "reviewed"))) fs.cpSync(path.join(oldRun, "reviewed"), path.join(newRun, "reviewed"), { recursive: true });
writeJSON(path.join(newRun, "migration.json"), { schema_version: 1, migrated_at: new Date().toISOString(), source_plan_sha256: sha256(oldPlanFile), target_policy_version: governance.policy_version, raw_mutated: false });
const buildArgs = ["--run-dir", newRun];
const ledger = path.join(newRun, "reviewed", "ledger.json");
if (fs.existsSync(ledger)) buildArgs.push("--snapshot", ledger);
for (const [script, scriptArgs] of [["build-census.mjs", buildArgs], ["build-dashboard.mjs", ["--dist", path.join(newRun, "dist"), "--out", path.join(newRun, "site")]]]) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${script}: ${result.stderr}`);
}
console.log(JSON.stringify({ source_run: oldRun, migrated_run: newRun, sources: plan.sources.length, raw_mutated: false }, null, 2));
