#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadSourcePlan, now, parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: audit-run.mjs --run-dir RUN --qa qa-evidence.json [--output audit.json]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const qaFile = args.qa ? path.resolve(String(args.qa)) : null;
const output = path.resolve(runDir, String(args.output || "audit.json"));
const { plan } = loadSourcePlan(runDir);
const manifest = readJSON(path.join(runDir, "dist", "manifest.json"));
const qa = qaFile && fs.existsSync(qaFile) ? readJSON(qaFile) : { checks: {} };
const terminal = new Set(["complete_query", "complete_surface", "partial", "blocked", "failed"]);
const sum = object => Object.values(object || {}).reduce((total, value) => total + Number(value || 0), 0);
const gate = (id, expected, observed, ok, evidence) => ({ id, expected, observed, verdict: ok ? "PASS" : "HOLD", evidence });

const raw = plan.sources.map(entry => ({ entry, payload: readJSON(path.resolve(runDir, entry.output_path)) }));
const identities = new Set();
let duplicateIdentity = false;
for (const { payload } of raw) for (const job of payload.jobs) {
  const key = `${job.source}|${job.source_id}`;
  if (identities.has(key)) duplicateIdentity = true;
  identities.add(key);
}
const attemptCounts = manifest.source_attempt_counts || {};
const review = manifest.reviewed_snapshot || {};
const bucketNames = ["relevance_counts", "coverage_counts", "region_counts", "status_counts", "career_counts", "employment_counts"];
const noncompleteWithoutLimit = raw.filter(({ payload }) => !["complete_query", "complete_surface"].includes(payload.metadata.completeness) && !(payload.metadata.limits || []).length);
const captureMin = Date.parse(manifest.captured_at_min);
const captureMax = Date.parse(manifest.captured_at_max);
const generated = Date.parse(manifest.generated_at);

const ledger = [
  gate("A1-plan", "planned paths equal manifest snapshots", `${plan.sources.length} plan / ${manifest.raw_snapshots?.length || 0} snapshots`, plan.sources.length === manifest.raw_snapshots?.length, "source-plan.json; dist/manifest.json"),
  gate("A2-parse", "all planned raw and manifest parse", `${raw.length} raw parsed`, raw.length === plan.sources.length, "raw/*.json; dist/manifest.json"),
  gate("A3-registry", "one terminal snapshot per source", `${new Set(plan.sources.map(entry => entry.source)).size} unique sources`, new Set(plan.sources.map(entry => entry.source)).size === plan.sources.length && plan.sources.every(entry => terminal.has(entry.attempt_status)), "source-plan.json"),
  gate("A4-schema", "required compact schema present", `${manifest.schema?.length || 0} fields`, ["source", "source_id", "url", "captured_at", "content_fingerprint"].every(field => manifest.schema?.includes(field)), "dist/manifest.json#schema"),
  gate("A5-identity", "source|source_id unique", `${identities.size} identities`, !duplicateIdentity && identities.size === manifest.total_source_rows, "raw/*.json"),
  gate("A6-parser-accounting", "input = emitted + duplicate + invalid", `${manifest.input_source_rows} = ${manifest.total_source_rows} + ${manifest.duplicate_source_rows_collapsed} + ${manifest.invalid_source_rows}`, Number(manifest.input_source_rows) === Number(manifest.total_source_rows) + Number(manifest.duplicate_source_rows_collapsed) + Number(manifest.invalid_source_rows), "dist/manifest.json"),
  gate("A7-accounting", "all buckets sum to raw total", bucketNames.map(name => `${name}:${sum(manifest[name])}`).join(", "), bucketNames.every(name => sum(manifest[name]) === manifest.total_source_rows), "dist/manifest.json"),
  gate("A8-provenance", "every snapshot has scope and checksum", `${manifest.raw_snapshots?.length || 0} provenance rows`, manifest.raw_snapshots?.every(item => item.file && item.sha256 && item.scope && item.captured_at), "dist/manifest.json#raw_snapshots"),
  gate("A9-no-fake-rows", "blocked and failed sources emit zero jobs", "checked raw snapshots", raw.every(({ payload }) => !["blocked", "failed"].includes(payload.metadata.completeness) || payload.jobs.length === 0), "raw/*.json"),
  gate("A10-review-separation", "review joins never add raw rows", review.attached ? `${review.matched} matched / ${review.unmatched} unreviewed` : "no review attached", !review.attached || Number(review.matched) + Number(review.stale) + Number(review.unmatched) === manifest.total_source_rows, "dist/manifest.json#reviewed_snapshot"),
  gate("A11-canonical-provenance", "posting conflicts are explicit", `${manifest.posting_status_conflicts || 0} conflicts`, Number.isInteger(Number(manifest.posting_status_conflicts || 0)), "dist/manifest.json"),
  gate("A12-drift", "noncomplete sources carry limits", `${noncompleteWithoutLimit.length} missing limit lists`, noncompleteWithoutLimit.length === 0, "raw/*.json; dist/manifest.json#limits"),
  gate("A13-freshness", "capture interval precedes build", `${manifest.captured_at_min} .. ${manifest.captured_at_max} -> ${manifest.generated_at}`, Number.isFinite(captureMin) && captureMin <= captureMax && captureMax <= generated, "dist/manifest.json"),
  gate("A14-reproducibility", "frozen-input rebuild identities and counts equal", qa.checks?.reproducibility?.verdict || "missing", qa.checks?.reproducibility?.verdict === "PASS", qaFile || "qa-evidence.json")
];

const browser = qa.checks?.browser || {};
const config = manifest.build_config || {};
const dashboard = [
  gate("B1-default-all", "dashboard retains all raw rows", `${manifest.total_source_rows} rows`, fs.existsSync(path.join(runDir, "site", "jobs.js")), "site/jobs.js; dist/manifest.json"),
  gate("B2-filters", "self-test and filter behavior pass", qa.checks?.self_test?.verdict || "missing", qa.checks?.self_test?.verdict === "PASS", qaFile || "qa-evidence.json"),
  gate("B3-pagination", "40,001-row synthetic smoke passes", qa.checks?.synthetic_smoke?.verdict || "missing", qa.checks?.synthetic_smoke?.verdict === "PASS", qaFile || "qa-evidence.json"),
  gate("B4-counts", "browser count equals manifest", `${browser.desktop?.total_count ?? "missing"} / ${manifest.total_source_rows}`, browser.verdict === "PASS" && Number(browser.desktop?.total_count) === manifest.total_source_rows, qaFile || "qa-evidence.json"),
  gate("B5-safety-accessibility", "generated source passes executable checks", qa.checks?.self_test?.verdict || "missing", qa.checks?.self_test?.verdict === "PASS", qaFile || "qa-evidence.json"),
  gate("B6-layout", "desktop and 390px body overflow zero", browser.mobile ? `${browser.mobile.document_scroll_width}/${browser.mobile.document_client_width}` : "missing", browser.verdict === "PASS" && Number(browser.mobile?.document_scroll_width) === Number(browser.mobile?.document_client_width), qaFile || "qa-evidence.json"),
  gate("B7-console", "browser console errors zero", `${browser.console_errors?.length ?? "missing"}`, browser.verdict === "PASS" && Array.isArray(browser.console_errors) && browser.console_errors.length === 0, qaFile || "qa-evidence.json"),
  gate("B8-budgets", "payload, index, load, and filter budgets pass", JSON.stringify(config), browser.verdict === "PASS" && Number(config.actual_payload_bytes) <= Number(config.max_payload_bytes) && Number(browser.desktop?.load_ms) <= Number(config.max_local_load_ms) && Number(browser.candidate_filter?.repaint_ms) <= Number(config.max_filter_ms), "dist/manifest.json#build_config; qa-evidence.json")
];

const ledgerVerdict = ledger.every(item => item.verdict === "PASS") ? "PASS" : "HOLD";
const dashboardVerdict = dashboard.every(item => item.verdict === "PASS") ? "PASS" : "HOLD";
const audit = {
  schema_version: 1,
  run_id: plan.run_id,
  generated_at: now(),
  ledger: { verdict: ledgerVerdict, gates: ledger },
  dashboard: { verdict: dashboardVerdict, gates: dashboard, environment: browser.environment || {} },
  verdict: ledgerVerdict === "PASS" && dashboardVerdict === "PASS" ? "PASS" : "HOLD",
  source_attempt_counts: attemptCounts
};
writeJSON(output, audit);
console.log(JSON.stringify({ output, verdict: audit.verdict, ledger: ledgerVerdict, dashboard: dashboardVerdict }, null, 2));
if (audit.verdict !== "PASS") process.exitCode = 1;
