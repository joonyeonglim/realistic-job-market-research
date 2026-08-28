#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "realistic-job-market-public-reference-"));
const result = spawnSync(process.execPath, [path.join(here, "create-public-fixture.mjs"), "--run-dir", runDir], { encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const actual = JSON.parse(fs.readFileSync(path.join(runDir, "fixture-summary.json"), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(root, "assets", "public-reference.expected.json"), "utf8"));
assert.deepEqual(actual, expected);
fs.rmSync(runDir, { recursive: true, force: true });
console.log("PUBLIC_REFERENCE_PASS");
