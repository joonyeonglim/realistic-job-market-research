#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { now, parseArgs, readJSON, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: init-profile.mjs [--out FILE] [--official-targets FILE] [--force]");
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const configRoot = path.join(os.homedir(), ".config", "realistic-job-market-research");
const output = path.resolve(String(args.out || path.join(configRoot, "profile.json")));
const targetsOutput = path.resolve(String(args["official-targets"] || path.join(path.dirname(output), "official-targets.json")));
if (!args.force && (fs.existsSync(output) || fs.existsSync(targetsOutput))) {
  throw new Error("profile or official-targets already exists; use --force only for an intentional replacement");
}

const capturedAt = now();
const date = capturedAt.slice(0, 10);
const profile = readJSON(path.join(root, "assets", "profile.example.json"));
const policy = readJSON(path.join(root, "assets", "scoring-policy.default.json"));
profile.captured_at = capturedAt;
profile.profile_version = `${date}-personal-v1`;
profile.scoring = {
  model_version: policy.model_version,
  policy_source: "assets/scoring-policy.default.json",
  weight_method: "owner_policy_provisional",
  elicited_at: date,
  rationale: "Replace with a dated owner swing-weighting rationale before treating ranks as calibrated preferences.",
  match_weights: policy.match_weights,
  opportunity_weights: policy.opportunity_weights,
  match_values: policy.match_values,
  axis_values: policy.axis_values,
  confidence_threshold: policy.confidence_threshold,
  sensitivity_profiles: policy.sensitivity_profiles
};
const targets = readJSON(path.join(root, "assets", "official-targets.example.json"));
targets.captured_at = capturedAt;
targets.jobs = [];

writeJSON(output, profile);
writeJSON(targetsOutput, targets);
fs.chmodSync(output, 0o600);
fs.chmodSync(targetsOutput, 0o600);
console.log(JSON.stringify({ profile: output, official_targets: targetsOutput, profile_version: profile.profile_version }, null, 2));
