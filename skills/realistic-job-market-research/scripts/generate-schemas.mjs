#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(root, "assets", "scoring-policy.default.json"), "utf8"));
const outputDir = path.join(root, "schemas");
const string = { type: "string", minLength: 1 };
const url = { type: "string", format: "uri", pattern: "^https?://" };
const weights = keys => ({ type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map(key => [key, { type: "number", minimum: 0, maximum: 100 }])) });
const matchItem = {
  type: "object", additionalProperties: false, required: ["requirement", "candidate_evidence", "match"],
  properties: { requirement: string, candidate_evidence: string, match: { enum: ["confirmed", "transferable", "missing", "unknown"] } }
};
const evidenceBlock = (gradeValues, extraRequired = []) => ({
  type: "object", additionalProperties: false, required: ["grade", ...extraRequired, "facts", "evidence"],
  properties: { grade: { enum: gradeValues }, as_of: string, facts: { type: "array", items: string }, evidence: { type: "array", items: url } }
});

const profile = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://github.com/joonyeonglim/realistic-job-market-research/profile.schema.json", title: "Candidate profile", type: "object", additionalProperties: false,
  required: ["schema_version", "profile_version", "captured_at", "career_years", "candidate", "scoring", "preferences", "resume"],
  properties: {
    schema_version: { const: 1 }, profile_version: string, captured_at: { type: "string", format: "date-time" }, career_years: { type: "number", exclusiveMinimum: 0 },
    candidate: { type: "object", required: ["target_roles", "defensible_level", "degree", "proven_strengths", "known_gaps"], properties: { target_roles: { type: "array", minItems: 1, items: string }, defensible_level: string, degree: string, proven_strengths: { type: "array", minItems: 1, items: string }, known_gaps: { type: "array", minItems: 1, items: string } } },
    scoring: { type: "object", required: ["model_version", "policy_source", "weight_method", "elicited_at", "rationale", "match_weights", "opportunity_weights", "match_values", "axis_values", "confidence_threshold", "sensitivity_profiles"], properties: { model_version: { const: policy.model_version }, policy_source: string, weight_method: string, elicited_at: { type: "string", format: "date" }, rationale: string, match_weights: weights(Object.keys(policy.match_weights)), opportunity_weights: weights(Object.keys(policy.opportunity_weights)), match_values: weights(Object.keys(policy.match_values)), axis_values: { type: "object" }, confidence_threshold: { type: "number", minimum: 0, maximum: 100 }, sensitivity_profiles: { type: "object", minProperties: 1, additionalProperties: weights(Object.keys(policy.opportunity_weights)) } } },
    preferences: { type: "object" }, resume: { type: "object" }
  }
};

const review = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://github.com/joonyeonglim/realistic-job-market-research/review.schema.json", title: "Realistic role review", type: "object", additionalProperties: false,
  required: ["schema_version", "as_of", "candidate_profile_version", "scope", "roles"],
  properties: {
    schema_version: { const: 1 }, as_of: { type: "string", format: "date" }, candidate_profile_version: string,
    scope: { type: "object", required: ["kind", "statement", "coverage_limits"], properties: { kind: { enum: ["named_shortlist", "audited_ledger", "update_correction"] }, statement: string, coverage_limits: { type: "array", items: string } } },
    roles: { type: "array", minItems: 1, items: { type: "object", required: ["company", "title", "url", "current_status", "requirements", "fit", "gates", "policy_flags", "evidence_quality", "company_identity", "finance", "location_work_policy", "hiring_process", "compensation", "application_stage", "offer_stage", "decision_reason", "unknowns", "resume_actions", "evidence"], properties: {
      company: string, title: string, url, current_status: { enum: ["active", "closed", "ambiguous", "reposted"] },
      requirements: { type: "object", required: ["must_have", "preferred"], properties: { must_have: { type: "array", minItems: 1, items: matchItem }, preferred: { type: "array", items: matchItem } } },
      fit: { type: "object" }, gates: { type: "object" }, policy_flags: { type: "array", items: string }, evidence_quality: { type: "object", required: ["grade", "freshness", "reason"], properties: { grade: { enum: ["high", "medium", "low", "unverified"] }, freshness: { enum: ["current", "mixed", "stale", "unknown"] }, reason: string } },
      company_identity: { type: "object" }, finance: evidenceBlock(["A", "B", "C", "D", "UNVERIFIED"], ["as_of"]), location_work_policy: { type: "object" }, hiring_process: { type: "object" }, compensation: { type: "object" },
      application_stage: { enum: ["PREPARE", "CONDITIONAL", "DROP"] }, offer_stage: { enum: ["PASS", "HOLD", "NO_GO"] }, decision_reason: string, unknowns: { type: "array", items: string }, resume_actions: { type: "array", items: string }, evidence: { type: "array", minItems: 1, items: url }
    } } }
  }
};

const qa = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://github.com/joonyeonglim/realistic-job-market-research/qa-evidence.schema.json", title: "Generated QA evidence", type: "object", additionalProperties: false,
  required: ["schema_version", "run_id", "recorded_at", "manifest_sha256", "checks"],
  properties: { schema_version: { const: 2 }, run_id: string, recorded_at: { type: "string", format: "date-time" }, manifest_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }, checks: { type: "object", required: ["self_test", "synthetic_smoke", "reproducibility", "browser"], properties: { self_test: { type: "object" }, synthetic_smoke: { type: "object" }, reproducibility: { type: "object" }, browser: { type: "object" } } } }
};

const schemas = { "profile.schema.json": profile, "review.schema.json": review, "qa-evidence.schema.json": qa };
let drift = false;
for (const [name, schema] of Object.entries(schemas)) {
  const rendered = `${JSON.stringify(schema, null, 2)}\n`;
  const file = path.join(outputDir, name);
  if (process.argv.includes("--write")) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(file, rendered);
  } else if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== rendered) {
    console.error(`SCHEMA_DRIFT: ${name}`);
    drift = true;
  }
}
if (drift) process.exit(1);
console.log(process.argv.includes("--write") ? "SCHEMAS_WRITTEN" : "SCHEMAS_IN_SYNC");
