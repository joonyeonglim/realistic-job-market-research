#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillFile = path.join(root, "SKILL.md");
const errors = [];
const text = fs.existsSync(skillFile) ? fs.readFileSync(skillFile, "utf8").replace(/\r\n/g, "\n") : "";
if (!/^---\n[\s\S]*?\n---\n/.test(text)) errors.push("SKILL.md frontmatter is missing");
if (!/^name: realistic-job-market-research$/m.test(text)) errors.push("SKILL.md name is invalid");
if (!/^description: .+/m.test(text)) errors.push("SKILL.md description is missing");
for (const match of text.matchAll(/\]\(((?:references|scripts|assets)\/[^)#]+)\)/g)) {
  if (!fs.existsSync(path.join(root, match[1]))) errors.push(`missing reference: ${match[1]}`);
}

if (process.argv.includes("--global")) {
  const canonical = path.join(os.homedir(), ".agents", "skills", "realistic-job-market-research");
  const installedSkill = path.join(canonical, "SKILL.md");
  if (!fs.existsSync(installedSkill)) errors.push(`installed SKILL.md missing: ${installedSkill}`);
  const claude = path.join(os.homedir(), ".claude", "skills", "realistic-job-market-research");
  if (!fs.existsSync(claude)) errors.push(`Claude skill missing: ${claude}`);
  if (fs.existsSync(installedSkill) && root !== canonical) {
    const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash(skillFile) !== hash(installedSkill)) errors.push("installed SKILL.md differs from this source checkout");
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("SKILL_DOCTOR_PASS");
