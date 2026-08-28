#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, readJSON, requireRunDir, writeJSON } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: record-qa.mjs --run-dir RUN [--output FILE]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const output = path.resolve(String(args.output || path.join(runDir, "qa-evidence.json")));
if (fs.existsSync(output)) throw new Error(`${output} already exists`);
const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = file => sha256(fs.readFileSync(file));
const run = (script, scriptArgs = []) => {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { encoding: "utf8" });
  return { verdict: result.status === 0 ? "PASS" : "HOLD", command: `node scripts/${script} ${scriptArgs.join(" ")}`.trim(), exit_code: result.status, stdout_sha256: sha256(result.stdout || ""), stderr_sha256: sha256(result.stderr || "") };
};
const manifestFile = path.join(runDir, "dist", "manifest.json");
const manifest = readJSON(manifestFile);
const selfTest = run("self-test.mjs");
const smoke = run("smoke-dashboard.mjs");

const replay = fs.mkdtempSync(path.join(os.tmpdir(), "job-census-replay-"));
for (const file of ["source-plan.json", "profile.json", "official-targets.json"]) if (fs.existsSync(path.join(runDir, file))) fs.copyFileSync(path.join(runDir, file), path.join(replay, file));
fs.cpSync(path.join(runDir, "raw"), path.join(replay, "raw"), { recursive: true, filter: source => !source.includes(`${path.sep}.staging`) });
const buildArgs = ["--run-dir", replay];
if (manifest.reviewed_snapshot?.attached) {
  const reviewSource = path.join(runDir, manifest.reviewed_snapshot.path);
  const reviewTarget = path.join(replay, manifest.reviewed_snapshot.path);
  fs.mkdirSync(path.dirname(reviewTarget), { recursive: true });
  fs.copyFileSync(reviewSource, reviewTarget);
  buildArgs.push("--snapshot", reviewTarget);
}
const rebuild = run("build-census.mjs", buildArgs);
let reproducibility = { ...rebuild, identities_equal: false, manifest_counts_equal: false };
if (rebuild.exit_code === 0) {
  const identities = file => {
    const source = fs.readFileSync(file, "utf8").trim();
    const payload = JSON.parse(source.slice("window.JOB_CENSUS=".length, -1));
    const field = Object.fromEntries(payload.metadata.schema.map((name, index) => [name, index]));
    return payload.rows.map(row => `${row[field.source]}|${row[field.source_id]}|${row[field.content_fingerprint]}`).sort();
  };
  const originalIds = identities(path.join(runDir, "dist", "jobs.js"));
  const replayIds = identities(path.join(replay, "dist", "jobs.js"));
  const replayManifest = readJSON(path.join(replay, "dist", "manifest.json"));
  reproducibility = {
    ...rebuild,
    verdict: JSON.stringify(originalIds) === JSON.stringify(replayIds) && manifest.total_source_rows === replayManifest.total_source_rows ? "PASS" : "HOLD",
    identities_equal: JSON.stringify(originalIds) === JSON.stringify(replayIds),
    manifest_counts_equal: manifest.total_source_rows === replayManifest.total_source_rows,
    identity_sha256: sha256(JSON.stringify(originalIds))
  };
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  throw new Error("Playwright is required for browser QA; run npm install and npx playwright install chromium in the skill directory");
}
const qaDir = path.join(runDir, "qa");
fs.mkdirSync(qaDir, { recursive: true });
const siteRoot = path.join(runDir, "site");
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(siteRoot, relative);
  if (!file.startsWith(`${path.resolve(siteRoot)}${path.sep}`) || !fs.existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("content-type", file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const consoleErrors = [];
let browserEvidence;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", error => consoleErrors.push(error.message));
  const started = performance.now();
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
  const loadMs = performance.now() - started;
  const totalCount = await page.evaluate(() => window.JOB_CENSUS?.rows?.length ?? -1);
  const accessibility = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    skip_link: Boolean(document.querySelector("a.skip")),
    unlabeled_controls: [...document.querySelectorAll("input,select,button")].filter(element => !element.labels?.length && !element.getAttribute("aria-label") && !element.textContent?.trim()).length
  }));
  const desktopScreenshot = path.join(qaDir, "desktop.png");
  await page.screenshot({ path: desktopScreenshot, fullPage: true });
  const candidateMeasurement = await page.evaluate(async () => {
    const select = document.querySelector('select[name="relevance"]');
    if (!select || ![...select.options].some(option => option.value === "candidate")) return { count: 0, repaint_ms: 0 };
    const started = performance.now();
    select.value = "candidate";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { count: window.JOB_CENSUS.rows.filter(row => row[window.JOB_CENSUS.metadata.schema.indexOf("relevance")] === "candidate").length, repaint_ms: performance.now() - started };
  });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await mobile.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
  const mobileLayout = await mobile.evaluate(() => ({ viewport_width: innerWidth, document_scroll_width: document.documentElement.scrollWidth, document_client_width: document.documentElement.clientWidth }));
  const mobileScreenshot = path.join(qaDir, "mobile.png");
  await mobile.screenshot({ path: mobileScreenshot, fullPage: true });
  browserEvidence = {
    verdict: totalCount === manifest.total_source_rows && consoleErrors.length === 0 && accessibility.h1 === 1 && accessibility.skip_link && accessibility.unlabeled_controls === 0 && mobileLayout.document_scroll_width === mobileLayout.document_client_width ? "PASS" : "HOLD",
    environment: { os: `${os.platform()} ${os.release()}`, node: process.version, browser: await browser.version(), transport: `http://127.0.0.1:${address.port}` },
    desktop: { total_count: totalCount, load_ms: Math.round(loadMs), screenshot: path.relative(runDir, desktopScreenshot), screenshot_sha256: sha256File(desktopScreenshot) },
    candidate_filter: { total_count: candidateMeasurement.count, repaint_ms: Math.round(candidateMeasurement.repaint_ms) },
    mobile: { ...mobileLayout, screenshot: path.relative(runDir, mobileScreenshot), screenshot_sha256: sha256File(mobileScreenshot) },
    accessibility,
    console_errors: consoleErrors
  };
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(replay, { recursive: true, force: true });
}

const qa = {
  schema_version: 2,
  run_id: manifest.run_id,
  recorded_at: new Date().toISOString(),
  manifest_sha256: sha256File(manifestFile),
  checks: { self_test: selfTest, synthetic_smoke: smoke, reproducibility, browser: browserEvidence }
};
writeJSON(output, qa);
console.log(JSON.stringify({ output, verdict: Object.values(qa.checks).every(check => check.verdict === "PASS") ? "PASS" : "HOLD" }, null, 2));
if (Object.values(qa.checks).some(check => check.verdict !== "PASS")) process.exitCode = 1;
