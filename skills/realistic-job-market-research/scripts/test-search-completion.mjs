#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSearchCompletion } from "./check-search-completion.mjs";
import { sha256 } from "./common.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-search-completion-"));
try {
  const intake = { items: [1, 2, 3, 4].map(id => ({ id: `test:${id}`, url: `https://jobs.example.test/${id}` })) };
  fs.writeFileSync(path.join(dir, "intake.json"), JSON.stringify(intake));
  fs.writeFileSync(path.join(dir, "sources.md"), "Synthetic mechanics fixture only; not real hiring evidence.\n");
  const report = rows => `${rows.map(row => row.url).join("\n")}\n[All decisions](research-state.json)\n`;
  fs.writeFileSync(path.join(dir, "REPORT.md"), report(intake.items));
  const make = () => ({ schema_version: 1, request: "Find relevant jobs in the requested region", mode: "search", intake_file: "intake.json", intake_sha256: sha256(path.join(dir, "intake.json")),
    passes: [{ source: "example", family: "region product", kind: "feed", status: "checked", evidence: ["sources.md"] }],
    items: intake.items.map(row => ({ id: row.id, state: "reviewed", decision: "conditional", novelty: "new_role", reason: "Actual condition retained", evidence: ["sources.md"] })),
    report_file: "REPORT.md", closure: { status: "complete", reason: "Declared bounded batch triaged" } });
  const run = state => {
    const stateFile = path.join(dir, "research-state.json");
    fs.writeFileSync(stateFile, JSON.stringify(state));
    return checkSearchCompletion(state, stateFile);
  };
  const fails = (change, code) => { const s = make(); change(s); const r = run(s); assert.equal(r.verdict, "HOLD"); assert.ok(r.issues.some(issue => issue.code === code), JSON.stringify(r)); };
  assert.equal(run(make()).verdict, "COMPLETE");
  fails(s => { delete s.request; }, "REQUEST");
  fails(s => { delete s.items[0].novelty; }, "NOVELTY");
  fails(s => { s.items = {}; }, "DECISIONS");
  fails(s => s.items.pop(), "DROPPED_ITEM");
  fails(s => { s.items[3].state = "pending"; }, "UNRESOLVED");
  fails(s => { s.items[3] = { id: "test:4", state: "excluded", reason: "Not my lane", basis: "worker_topic", evidence: ["sources.md"] }; }, "EXCLUSION");
  fails(s => { s.items[0].evidence = ["absent.md"]; }, "EVIDENCE");
  fails(s => { s.intake_sha256 = "0".repeat(64); }, "INTAKE_HASH");
  fails(s => { s.passes[0].kind = "employer_discovery"; }, "FEED");
  fails(s => { s.items.forEach(row => { row.novelty = "known_role"; }); }, "EXPANSION");
  fails(s => { s.items.forEach(row => { row.state = "excluded"; row.basis = "hard_requirement"; }); }, "EXPANSION");
  fails(s => { s.items[0].state = "duplicate"; s.items[0].duplicate_of = "test:2"; s.items[1].state = "duplicate"; s.items[1].duplicate_of = "test:1"; }, "DUPLICATE");
  fails(s => { s.items.push({ ...s.items[0], id: "not-observed" }); }, "INVENTED_ITEM");
  fails(s => { s.closure = { status: "limited", reason: "Only display three", limit_kind: "answer_length", limit_evidence: ["sources.md"] }; }, "LIMIT");
  fs.writeFileSync(path.join(dir, "REPORT.md"), report(intake.items.slice(0, 3)));
  fails(() => {}, "REPORT_OMISSION");
  fs.writeFileSync(path.join(dir, "REPORT.md"), intake.items.map(row => row.url).join("\n"));
  fails(() => {}, "LEDGER_LINK");
  fs.writeFileSync(path.join(dir, "REPORT.md"), `${report(intake.items).replace("[All decisions](research-state.json)", "research-state.json")}`);
  fails(() => {}, "LEDGER_LINK");
  fs.writeFileSync(path.join(dir, "REPORT.md"), report(intake.items));
  fs.mkdirSync(path.join(dir, "reports"));
  fs.writeFileSync(path.join(dir, "reports", "REPORT.md"), report(intake.items));
  fails(s => { s.report_file = "reports/REPORT.md"; }, "LEDGER_LINK");
  fs.writeFileSync(path.join(dir, "reports", "REPORT.md"), report(intake.items).replace("(research-state.json)", "(../research-state.json)"));
  const nestedReport = make(); nestedReport.report_file = "reports/REPORT.md";
  assert.equal(run(nestedReport).verdict, "COMPLETE");
  const expanded = make(); expanded.items.forEach(row => { row.novelty = "known_role"; });
  expanded.passes.push({ source: "another", family: "adjacent product", kind: "adjacent_roles", status: "checked", evidence: ["sources.md"] });
  assert.equal(run(expanded).verdict, "COMPLETE");
  const targeted = make(); targeted.mode = "targeted"; targeted.passes = []; assert.equal(run(targeted).verdict, "COMPLETE");
  const limited = make(); limited.items[3].state = "pending";
  limited.closure = { status: "limited", reason: "Explicit owner scope limit in saved request", limit_kind: "user_requested", limit_evidence: ["sources.md"] };
  assert.equal(run(limited).verdict, "LIMITED");
  const blocked = make(); blocked.items[3].state = "blocked"; blocked.items[3].recovery = "Saved access failure; authorized alternative unavailable";
  blocked.closure = { status: "limited", reason: "Exact role source inaccessible", limit_kind: "source_access", limit_evidence: ["sources.md"] };
  assert.equal(run(blocked).verdict, "LIMITED");
  console.log("SEARCH_COMPLETION_SELF_TEST_PASS");
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
