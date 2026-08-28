import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_ADAPTERS = ["wanted", "saramin", "jumpit", "rallit"];
export const EXTENDED_ADAPTERS = [
  "groupby", "career", "remoteok", "weworkremotely", "linkedin", "jobkorea", "incruit", "official_ats", "peoplenjob",
  "catch", "himalayas", "robert_walters", "jac_korea", "work24", "job_alio", "gojobs", "nst", "onest", "jobaba", "seoul_jobs", "seoul_public", "gyeonggi_public"
];
export const PROBE_ONLY = [];
export const AUTHENTICATED_HANDOFF = ["jobplanet", "rocketpunch", "remember"];

export function validateAdapterContract() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const registry = JSON.parse(fs.readFileSync(path.join(root, "assets", "source-registry.json"), "utf8"));
  const expected = registry.adapter_inventory;
  const same = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  if (!same([...CORE_ADAPTERS, ...EXTENDED_ADAPTERS], expected.implemented) || !same(PROBE_ONLY, expected.probe_only) || !same(AUTHENTICATED_HANDOFF, expected.authenticated_handoff)) {
    throw new Error("adapter dispatch code differs from source-registry adapter_inventory SSOT");
  }
  return true;
}
