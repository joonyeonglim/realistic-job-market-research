#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { now, parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: init-run.mjs --run-dir RUN [--profile-config FILE] [--official-targets FILE] [--registry FILE]");
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, "..");
const runDir = requireRunDir(args);
const registryFile = path.resolve(String(args.registry || path.join(skillRoot, "assets/source-registry.json")));
const defaultConfigRoot = path.join(os.homedir(), ".config", "realistic-job-market-research");
const profileFile = path.resolve(String(args["profile-config"] || path.join(defaultConfigRoot, "profile.json")));
const targetsFile = path.resolve(String(args["official-targets"] || path.join(defaultConfigRoot, "official-targets.json")));

if (fs.existsSync(path.join(runDir, "source-plan.json"))) throw new Error(`run already initialized: ${runDir}`);
if (!fs.existsSync(registryFile)) throw new Error(`source registry not found: ${registryFile}`);
if (!fs.existsSync(profileFile)) throw new Error(`personal profile not found: ${profileFile}`);

const registry = readJSON(registryFile);
const profile = readJSON(profileFile);
if (registry.schema_version !== 1 || !Array.isArray(registry.sources) || registry.sources.length !== 29) {
  throw new Error(`${registryFile}: expected schema_version=1 and exactly 29 sources`);
}
if (profile.schema_version !== 1 || !profile.profile_version || !profile.captured_at || !Number.isFinite(Number(profile.career_years))) {
  throw new Error(`${profileFile}: expected schema_version=1, profile_version, captured_at, and career_years`);
}

const capturedAt = now();
const runId = String(args["run-id"] || path.basename(runDir));
const targets = fs.existsSync(targetsFile)
  ? readJSON(targetsFile)
  : { schema_version: 1, captured_at: capturedAt, jobs: [] };
if (targets.schema_version !== 1 || !Array.isArray(targets.jobs)) throw new Error(`${targetsFile}: expected schema_version=1 and jobs[]`);

const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceProfile = {
  ...profile,
  source: {
    path: profileFile,
    sha256: sha256(profileFile)
  }
};

const monthStart = `${capturedAt.slice(0, 8)}01`;
const today = capturedAt.slice(0, 10);
const sources = registry.sources.map(source => {
  const entry = structuredClone(source);
  delete entry.preferred_completeness;
  entry.minimum_captured_at = capturedAt;
  entry.attempt_status = "planned";
  if (entry.source === "official_ats") {
    entry.scope = `${targets.jobs.length} named official ATS and company-career surfaces`;
    entry.expected_inputs = [{ kind: "named_targets", uri: "file:official-targets.json" }];
  }
  if (entry.source === "gojobs") entry.scope = `AI and 인공지능 title queries posted ${monthStart} through ${today}`;
  return entry;
});

fs.mkdirSync(path.join(runDir, "raw"), { recursive: true });
fs.mkdirSync(path.join(runDir, "reviewed"), { recursive: true });
writeJSON(path.join(runDir, "profile.json"), sourceProfile);
writeJSON(path.join(runDir, "official-targets.json"), { ...targets, captured_at: targets.captured_at || capturedAt });
writeJSON(path.join(runDir, "source-plan.json"), {
  schema_version: 1,
  run_id: runId,
  started_at: capturedAt,
  timezone: String(args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
  target_career_years: Number(profile.career_years),
  registry_version: registry.registry_version,
  sources
});

console.log(JSON.stringify({
  run_dir: runDir,
  run_id: runId,
  sources: sources.length,
  profile_version: profile.profile_version,
  official_targets: targets.jobs.length
}, null, 2));
