#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, readJSON, sha256, writeJSON } from "./common.mjs";

// Structural accounting only. This cannot certify source truth or hiring fit.
export function checkSearchCompletion(state, stateFile) {
  const base = path.dirname(path.resolve(stateFile));
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  const text = value => typeof value === "string" && value.trim().length > 0;
  const localFile = value => {
    if (!text(value) || /^https?:/i.test(value)) return null;
    const file = path.resolve(base, value.split("#", 1)[0]);
    try { return fs.statSync(file).isFile() && fs.statSync(file).size > 0 ? file : null; }
    catch { return null; }
  };
  const evidence = (value, label) => {
    if (!Array.isArray(value) || !value.length || value.some(item => !localFile(item))) {
      add("EVIDENCE", `${label}: nonempty saved evidence files are required`);
    }
  };
  if (state.schema_version !== 1) add("SCHEMA", "schema_version must be 1");
  if (!text(state.request)) add("REQUEST", "preserve the actual request so scope and limits can be reviewed");
  if (!["search", "targeted"].includes(state.mode)) add("MODE", "mode must match search or targeted request scope");
  const intakeFile = localFile(state.intake_file);
  let intake = [];
  if (!intakeFile) add("INTAKE", "saved observed intake is missing");
  else {
    if (!/^[a-f0-9]{64}$/.test(state.intake_sha256 || "") || sha256(intakeFile) !== state.intake_sha256) {
      add("INTAKE_HASH", "observed intake changed or its SHA256 was not frozen");
    }
    try {
      const raw = readJSON(intakeFile);
      intake = Array.isArray(raw) ? raw : raw.items;
      if (!Array.isArray(intake)) throw new Error("items array missing");
    } catch { intake = []; add("INTAKE", "intake must contain an items array"); }
  }
  const observed = new Map();
  for (const row of intake) {
    if (!row || typeof row !== "object") { add("IDENTITY", "intake rows must be objects"); continue; }
    let validUrl = false;
    try { validUrl = ["http:", "https:"].includes(new URL(row.url).protocol); } catch {}
    if (!text(row.id) || !validUrl) { add("IDENTITY", "each real intake observation needs an ID and HTTP(S) URL"); continue; }
    if (observed.has(row.id) && observed.get(row.id).url !== row.url) add("IDENTITY", `${row.id}: conflicting URLs need explicit source identities`);
    observed.set(row.id, row);
  }
  const decisions = new Map();
  if (!Array.isArray(state.items)) add("DECISIONS", "items decision array missing");
  for (const row of Array.isArray(state.items) ? state.items : []) {
    if (!row || typeof row !== "object") { add("DECISIONS", "decision rows must be objects"); continue; }
    if (!text(row.id) || decisions.has(row.id)) add("DECISIONS", "decision IDs must be present and unique");
    else decisions.set(row.id, row);
  }
  for (const id of observed.keys()) if (!decisions.has(id)) add("DROPPED_ITEM", `${id}: observed role has no disposition`);
  for (const id of decisions.keys()) if (!observed.has(id)) add("INVENTED_ITEM", `${id}: disposition is not in the frozen intake`);
  const allowedBases = new Set(["closed", "out_of_region", "hard_requirement", "owner_exclusion", "irrelevant_role"]);
  const states = new Set(["reviewed", "excluded", "duplicate", "blocked", "pending"]);
  for (const row of decisions.values()) {
    if (!states.has(row.state)) add("STATE", `${row.id}: unsupported disposition`);
    if (!text(row.reason)) add("REASON", `${row.id}: explain the actual disposition`);
    if (row.state !== "pending") evidence(row.evidence, row.id);
    if (row.state === "reviewed" && !["prepare", "conditional"].includes(row.decision)) add("DECISION", `${row.id}: reviewed decisions are prepare or conditional`);
    if (row.state === "reviewed" && !["new_role", "material_change", "known_role", "unknown"].includes(row.novelty)) add("NOVELTY", `${row.id}: record exact-role comparison or unknown, not an assumed new posting`);
    if (row.state === "excluded" && !allowedBases.has(row.basis)) add("EXCLUSION", `${row.id}: topic, answer length and unreviewed are not exclusion grounds`);
    if (row.state === "blocked" && !text(row.recovery)) add("RECOVERY", `${row.id}: save the attempted alternative or real access limit`);
    if (row.state === "duplicate") {
      const seen = new Set([row.id]);
      let target = row.duplicate_of;
      while (decisions.has(target) && decisions.get(target).state === "duplicate" && !seen.has(target)) {
        seen.add(target); target = decisions.get(target).duplicate_of;
      }
      if (!decisions.has(target) || seen.has(target)) add("DUPLICATE", `${row.id}: duplicate target is missing or cyclic`);
    }
  }
  const reportFile = localFile(state.report_file);
  const report = reportFile ? fs.readFileSync(reportFile, "utf8") : "";
  if (!reportFile) add("REPORT", "persistent full report is missing");
  if (reportFile && [intakeFile, path.resolve(stateFile)].includes(reportFile)) add("REPORT_TARGET", "the intake/state cannot stand in for the readable result report");
  const savedState = localFile(path.resolve(stateFile));
  const links = [...report.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^"'\n]*["'])?\s*\)/g)];
  const exposesState = savedState && reportFile && links.some(match => {
    try {
      const target = decodeURIComponent((match[1] || match[2]).split("#", 1)[0]);
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return false;
      return fs.realpathSync(path.resolve(path.dirname(reportFile), target)) === fs.realpathSync(savedState);
    } catch { return false; }
  });
  if (!exposesState) add("LEDGER_LINK", "the report must link to its saved decision ledger, resolved from the report directory");
  for (const row of observed.values()) if (!report.includes(row.url)) add("REPORT_OMISSION", `${row.id}: URL is absent from the full persistent report`);
  const passes = Array.isArray(state.passes) ? state.passes : [];
  for (const pass of passes) {
    if (!pass || typeof pass !== "object") { add("COVERAGE", "pass rows must be objects"); continue; }
    if (!text(pass.source) || !text(pass.family) || !["feed", "employer_discovery", "adjacent_roles", "verification"].includes(pass.kind)
      || !["checked", "blocked"].includes(pass.status)) add("COVERAGE", "passes need source, query family, kind and observed status");
    evidence(pass.evidence, `pass ${pass.source || "unknown"}`);
  }
  const closure = state.closure || {};
  if (!["complete", "limited"].includes(closure.status) || !text(closure.reason)) add("CLOSURE", "closure needs status and a scope-specific reason");
  if (closure.status === "limited") {
    if (!["user_requested", "source_access", "runtime_budget"].includes(closure.limit_kind)) add("LIMIT", "a display cap or lane quota is not an actual research limit");
    evidence(closure.limit_evidence, "actual limit");
  }
  const unresolved = [...decisions.values()].filter(row => ["pending", "blocked"].includes(row.state));
  if (closure.status === "complete" && unresolved.length) add("UNRESOLVED", "known pending/blocked work cannot be claimed complete; resolve it or disclose a real limit");
  const candidates = [...decisions.values()].filter(row => row.state === "reviewed" && ["prepare", "conditional"].includes(row.decision));
  if (state.mode === "targeted" && !observed.size) add("TARGET_SCOPE", "a targeted check must account for its supplied role/company");
  if (state.mode === "search" && closure.status === "complete") {
    if (!passes.some(pass => pass?.kind === "feed" && pass.status === "checked")) add("FEED", "broad discovery needs an observed current listing feed or a documented limited result");
    if (!candidates.length || candidates.every(row => row.novelty === "known_role")) {
      const families = new Set(passes.filter(pass => pass?.status === "checked" && pass.kind !== "verification").map(pass => `${pass.source}|${pass.family}`));
      if (families.size < 2) add("EXPANSION", "sparse/repeat-only results need a distinct discovery pass before stopping");
    }
  }
  return {
    schema_version: 1,
    verdict: issues.length ? "HOLD" : closure.status === "limited" ? "LIMITED" : "COMPLETE",
    issues,
    counts: { observations: intake.length, distinct_intake_ids: observed.size, dispositions: decisions.size, candidates: candidates.length, unresolved: unresolved.length },
    evidence_boundary: "Structural batch accounting, not market exhaustiveness, factual eligibility, employer safety or behavioral validation."
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) console.log("Usage: check-search-completion.mjs --state STATE.json [--output RECEIPT.json]");
  else {
    try {
      if (!args.state) throw new Error("--state is required; the agent prepares the private work record");
      const file = path.resolve(String(args.state));
      const result = checkSearchCompletion(readJSON(file), file);
      if (args.output) writeJSON(path.resolve(String(args.output)), result);
      console.log(JSON.stringify(result, null, 2));
      if (result.verdict === "HOLD") process.exitCode = 2;
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
