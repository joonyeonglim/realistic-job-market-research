#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(here, "../templates/dashboard.html");
const defaultConfig = {
  page_size: 100,
  debounce_ms: 180,
  facets: ["relevance", "source", "region", "status_group", "career_fit", "employment_group", "completeness"],
  max_payload_bytes: 26_214_400,
  max_index_bytes: 262_144,
  max_local_load_ms: 2_000,
  max_filter_ms: 250
};

const fail = message => {
  console.error(`build-dashboard: ${message}`);
  process.exit(1);
};
const readArgs = values => {
  if (values.includes("--help")) {
    console.log("Usage: build-dashboard.mjs --dist <run/dist> --out <run/site>");
    process.exit(0);
  }
  const args = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value) fail("usage: build-dashboard.mjs --dist <run/dist> --out <run/site>");
    args[key.slice(2)] = value;
  }
  if (!args.dist || !args.out) fail("usage: build-dashboard.mjs --dist <run/dist> --out <run/site>");
  return args;
};
const parsePayload = source => {
  const match = source.match(/^\s*window\.JOB_CENSUS\s*=\s*([\s\S]+);\s*$/);
  if (!match) fail("dist/jobs.js must contain only window.JOB_CENSUS={metadata,rows};");
  try { return JSON.parse(match[1]); }
  catch (error) { fail(`dist/jobs.js payload is not JSON: ${error.message}`); }
};
const sum = object => Object.values(object || {}).reduce((total, value) => total + Number(value || 0), 0);
const assertBreakdown = (label, object, expected) => {
  if (!object || typeof object !== "object" || Array.isArray(object)) fail(`${label} is missing`);
  if (expected > 0 && Object.keys(object).length === 0) fail(`${label} is empty`);
  const count = sum(object);
  if (count !== expected) fail(`${label} sums to ${count}, expected ${expected}`);
};
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const args = readArgs(process.argv.slice(2));
const dist = path.resolve(args.dist);
const out = path.resolve(args.out);
if (path.basename(dist) !== "dist" || path.basename(out) !== "site" || path.dirname(dist) !== path.dirname(out)) fail("--dist and --out must be sibling <run>/dist and <run>/site directories");
const jobsPath = path.join(dist, "jobs.js");
const manifestPath = path.join(dist, "manifest.json");
for (const file of [templatePath, jobsPath, manifestPath]) if (!fs.existsSync(file)) fail(`missing ${file}`);

const jobsSource = fs.readFileSync(jobsPath, "utf8");
const manifestSource = fs.readFileSync(manifestPath, "utf8");
const payload = parsePayload(jobsSource);
let manifest;
try { manifest = JSON.parse(manifestSource); }
catch (error) { fail(`dist/manifest.json is not JSON: ${error.message}`); }

if (!payload || typeof payload !== "object" || !payload.metadata || !Array.isArray(payload.metadata.schema) || !Array.isArray(payload.rows)) fail("jobs payload must be {metadata:{schema},rows:[]}");
const schema = payload.metadata.schema;
const required = ["source", "source_id", "company", "title", "url", "location", "career_min", "career_max", "employment", "deadline", "status", "relevance", "reason", "terms", "region", "career_fit", "employment_group", "completeness", "status_group", "evidence_level"];
const missing = required.filter(field => !schema.includes(field));
if (missing.length) fail(`jobs schema missing: ${missing.join(", ")}`);
if (new Set(schema).size !== schema.length) fail("jobs schema contains duplicate fields");
if (!Array.isArray(manifest.schema) || manifest.schema.length !== schema.length || manifest.schema.some((field, index) => field !== schema[index])) fail("manifest.schema must exactly match payload metadata.schema");
if (JSON.stringify(payload.metadata) !== JSON.stringify(manifest)) fail("jobs payload metadata must exactly match dist/manifest.json");
if (payload.rows.some(row => !Array.isArray(row) || row.length !== schema.length)) fail("every compact row must match metadata.schema length");

const rowCount = payload.rows.length;
if (manifest.total_source_rows == null || !Number.isInteger(Number(manifest.total_source_rows)) || Number(manifest.total_source_rows) < 0) fail("manifest.total_source_rows is missing or invalid");
const declaredTotal = Number(manifest.total_source_rows);
if (declaredTotal !== rowCount) fail(`manifest total_source_rows is ${declaredTotal}, payload has ${rowCount}`);
if (!Array.isArray(manifest.raw_snapshots)) fail("manifest.raw_snapshots must be an array");

const breakdowns = {
  source_rows: "source",
  relevance_counts: "relevance",
  coverage_counts: "completeness",
  region_counts: "region",
  status_counts: "status_group",
  career_counts: "career_fit",
  employment_counts: "employment_group"
};
for (const [name, field] of Object.entries(breakdowns)) {
  const declared = manifest[name];
  assertBreakdown(`manifest.${name}`, declared, rowCount);
  const index = schema.indexOf(field);
  const actual = payload.rows.reduce((counts, row) => {
    const value = String(row[index] ?? "unknown") || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  const nonzeroDeclared = Object.fromEntries(Object.entries(declared).filter(([, count]) => Number(count) !== 0).map(([key, count]) => [key, Number(count)]));
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(nonzeroDeclared).sort())) fail(`manifest.${name} does not match payload ${field} buckets`);
}

const config = { ...defaultConfig, ...(manifest.build_config || {}) };
if (!Number.isInteger(config.page_size) || config.page_size < 1 || config.page_size > 100) fail("build_config.page_size must be an integer from 1 to 100");
if (!Number.isInteger(config.debounce_ms) || config.debounce_ms < 0 || config.debounce_ms > 5_000) fail("build_config.debounce_ms must be an integer from 0 to 5000");
if (!Array.isArray(config.facets) || defaultConfig.facets.some(facet => !config.facets.includes(facet))) fail(`build_config.facets must include ${defaultConfig.facets.join(", ")}`);
if (!Number.isInteger(config.max_payload_bytes) || config.max_payload_bytes < 1) fail("build_config.max_payload_bytes must be a positive integer");
if (!Number.isInteger(config.max_index_bytes) || config.max_index_bytes < 1 || config.max_index_bytes > 262_144) fail("build_config.max_index_bytes must be an integer no larger than 262144");
if (!Number.isInteger(config.max_local_load_ms) || config.max_local_load_ms < 1) fail("build_config.max_local_load_ms must be a positive integer");
if (!Number.isInteger(config.max_filter_ms) || config.max_filter_ms < 1) fail("build_config.max_filter_ms must be a positive integer");
const inputPayloadBytes = Buffer.byteLength(jobsSource);
if (manifest.build_config?.actual_payload_bytes != null && Number(manifest.build_config.actual_payload_bytes) !== inputPayloadBytes) fail("build_config.actual_payload_bytes does not match dist/jobs.js");
if (inputPayloadBytes > config.max_payload_bytes) fail(`dist/jobs.js is ${inputPayloadBytes} bytes, exceeding ${config.max_payload_bytes}`);
if (config.max_build_ms != null && config.actual_build_ms != null && Number(config.actual_build_ms) > Number(config.max_build_ms)) fail("build_config.actual_build_ms exceeds max_build_ms");

const build = {
  built_at: new Date().toISOString(),
  payload_file: path.basename(jobsPath),
  manifest_file: path.basename(manifestPath),
  payload_sha256: sha256(jobsSource),
  manifest_sha256: sha256(manifestSource)
};
const outputJobs = `${jobsSource.trim()}\nwindow.JOB_CENSUS_MANIFEST=${JSON.stringify(manifest)};\nwindow.JOB_CENSUS_BUILD=${JSON.stringify(build)};\nwindow.JOB_CENSUS_CONFIG=${JSON.stringify(config)};\n`;
const template = fs.readFileSync(templatePath, "utf8");
if (Buffer.byteLength(template) > config.max_index_bytes) fail(`dashboard index is over ${config.max_index_bytes} bytes`);
if (Buffer.byteLength(outputJobs) > config.max_payload_bytes) fail(`site/jobs.js exceeds ${config.max_payload_bytes} bytes after provenance metadata`);

const parent = path.dirname(out);
const stage = path.join(parent, `.site-staging-${process.pid}`);
const backup = path.join(parent, `.site-backup-${process.pid}`);
fs.mkdirSync(parent, { recursive: true });
if (fs.existsSync(stage) || fs.existsSync(backup)) fail("stale dashboard staging directory exists");
fs.mkdirSync(stage);
try {
  fs.writeFileSync(path.join(stage, "index.html"), template);
  fs.writeFileSync(path.join(stage, "jobs.js"), outputJobs);
  if (fs.existsSync(out)) fs.renameSync(out, backup);
  fs.renameSync(stage, out);
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true });
} catch (error) {
  if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
  if (fs.existsSync(backup) && !fs.existsSync(out)) fs.renameSync(backup, out);
  throw error;
}
console.log(JSON.stringify({ out, rows: rowCount, sources: Object.keys(manifest.source_rows || {}).length, config, build }, null, 2));
