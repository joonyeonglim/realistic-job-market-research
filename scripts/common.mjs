import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const now = () => new Date().toISOString();
export const COMPLETENESS = new Set(["complete_query", "complete_surface", "partial", "blocked", "failed"]);
export const unique = values => [...new Set(values.filter(value => value !== null && value !== undefined && value !== ""))];

export function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const key = token.slice(2, equals < 0 ? undefined : equals);
    const value = equals >= 0 ? token.slice(equals + 1) : (argv[index + 1]?.startsWith("--") ? true : argv[++index] ?? true);
    if (result[key] === undefined) result[key] = value;
    else result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
  }
  return result;
}

export function valuesOf(value) {
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]);
}

export function requireRunDir(args) {
  if (!args["run-dir"] || args["run-dir"] === true) throw new Error("--run-dir PATH is required");
  return path.resolve(String(args["run-dir"]));
}

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function hashValue(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function relativeFile(runDir, file) {
  const relative = path.relative(runDir, file);
  return relative.startsWith("..") ? path.resolve(file) : relative;
}

export function parseSnapshot(value) {
  const text = String(value);
  const equals = text.indexOf("=");
  if (equals <= 0) return { source: null, file: path.resolve(text) };
  return { source: text.slice(0, equals), file: path.resolve(text.slice(equals + 1)) };
}

export function isISODate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeSourceRefs(raw) {
  const refs = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = raw.source ? [String(raw.source)] : [];
  const urls = raw.url && /^https?:\/\//i.test(String(raw.url)) ? [String(raw.url)] : [];
  for (const ref of refs) {
    if (typeof ref === "string") {
      if (/^https?:\/\//i.test(ref)) urls.push(ref);
      else if (ref) sources.push(ref);
    } else if (ref && typeof ref === "object") {
      if (ref.source) sources.push(String(ref.source));
      if (ref.url && /^https?:\/\//i.test(String(ref.url))) urls.push(String(ref.url));
    }
  }
  return { sources: unique(sources), urls: unique(urls) };
}

export function normalizeStage(value) {
  if (value === "candidate") return "candidate";
  if (["excluded", "hard_exclusion"].includes(value)) return "excluded";
  return "unknown";
}

export function resolveStage(values) {
  const stages = unique(values.map(normalizeStage));
  if (stages.includes("candidate") && stages.includes("excluded")) return "unknown";
  if (stages.includes("candidate")) return "candidate";
  if (stages.includes("excluded")) return "excluded";
  return "unknown";
}

export function statusGroup(value) {
  const text = String(value ?? "").toLowerCase();
  if (/inactive|close|closed|disabled|expired|ended|마감/.test(text)) return "closed";
  if (/active|open|posting|live|hiring|in_progress|checked|recruit/.test(text)) return "active";
  return "unknown";
}

export function regionOf(value) {
  const text = String(value ?? "");
  if (/원격|remote/i.test(text)) return "remote";
  if (/서울|seoul/i.test(text)) return "seoul";
  if (/경기|성남|판교|분당|수원|용인|gyeonggi|seongnam|pangyo|bundang|suwon|yongin/i.test(text)) return "gyeonggi";
  if (/한국|대한민국|south korea|korea/i.test(text)) return "korea";
  return text.trim() ? "other" : "unknown";
}

export function normalizeJob(raw, fallbackSource = null) {
  const refs = Array.isArray(raw.sources) ? raw.sources : [];
  const objectRef = refs.find(ref => ref && typeof ref === "object" && ref.source && ref.source_id != null);
  const source = String(raw.source || objectRef?.source || fallbackSource || "").trim();
  const sourceId = raw.source_id ?? objectRef?.source_id;
  const matchTerms = Array.isArray(raw.match_terms) ? raw.match_terms : (raw.match_terms ? [raw.match_terms] : []);
  const capturedAt = raw.captured_at || null;
  const normalized = {
    ...raw,
    source,
    source_id: sourceId == null ? "" : String(sourceId),
    company: String(raw.company ?? "").trim(),
    title: String(raw.title ?? "").trim(),
    url: String(raw.url || objectRef?.url || "").trim(),
    location: raw.location == null ? null : String(raw.location).trim(),
    career_min: finiteOrNull(raw.career_min),
    career_max: finiteOrNull(raw.career_max),
    employment: raw.employment == null ? null : String(raw.employment).trim(),
    deadline: raw.deadline || null,
    status: raw.status || "unknown",
    match_terms: unique(matchTerms.map(String)),
    filter_stage: raw.filter_stage || "raw",
    exclusion_reason: raw.exclusion_reason || null,
    captured_at: capturedAt,
    posted_at: raw.posted_at || null,
    status_conflict: Boolean(raw.status_conflict),
    review_text: String(raw.review_text || ""),
    source_payload_hash: raw.source_payload_hash || "",
    content_fingerprint: raw.content_fingerprint || "",
    source_fields: raw.source_fields && typeof raw.source_fields === "object" ? raw.source_fields : {},
    evidence_level: raw.evidence_level || raw.evidence || (raw.detail_verified ? "detail_verified" : "search_card")
  };
  normalized.content_fingerprint ||= contentFingerprint(normalized);
  return normalized;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function validateLedger(payload, options = {}) {
  const label = options.label || "ledger";
  if (!payload || typeof payload !== "object" || !payload.metadata || !Array.isArray(payload.jobs)) {
    throw new Error(`${label}: expected {metadata,jobs}`);
  }
  const metadata = payload.metadata;
  const expectedSource = options.expectedSource || metadata.source || null;
  const requiredMetadata = ["schema_version", "source", "producer", "captured_at", "scope", "scope_kind", "completeness", "fetched_rows", "emitted_rows", "invalid_rows", "parse_errors", "duplicates_removed", "status_conflict_count", "snapshot_kind"];
  for (const key of requiredMetadata) if (metadata[key] === null || metadata[key] === undefined || metadata[key] === "") {
    throw new Error(`${label}: metadata.${key} is required`);
  }
  if (!COMPLETENESS.has(metadata.completeness)) throw new Error(`${label}: unsupported completeness ${metadata.completeness}`);
  if (!["public_surface", "query", "category", "board", "feed"].includes(metadata.scope_kind)) throw new Error(`${label}: unsupported scope_kind ${metadata.scope_kind}`);
  if (!isISODate(metadata.captured_at)) throw new Error(`${label}: metadata.captured_at must be an ISO timestamp`);
  if (!Array.isArray(metadata.queries) || !Array.isArray(metadata.limits) || !Array.isArray(metadata.inputs)) throw new Error(`${label}: metadata queries, limits, and inputs must be arrays`);
  if (!metadata.pagination || !Array.isArray(metadata.pagination.requests) || !metadata.pagination.termination) throw new Error(`${label}: metadata.pagination evidence is required`);
  if (!Array.isArray(metadata.normalization_warnings)) throw new Error(`${label}: metadata.normalization_warnings must be an array`);
  if (!['live', 'imported'].includes(metadata.snapshot_kind)) throw new Error(`${label}: snapshot_kind must be live or imported`);
  const counts = ["fetched_rows", "emitted_rows", "invalid_rows", "parse_errors", "duplicates_removed", "status_conflict_count"];
  for (const key of counts) if (!Number.isInteger(Number(metadata[key])) || Number(metadata[key]) < 0) throw new Error(`${label}: metadata.${key} must be a non-negative integer`);
  if (Number(metadata.emitted_rows) !== payload.jobs.length) throw new Error(`${label}: emitted_rows does not match jobs.length`);
  if (Number(metadata.duplicates_removed) !== Number(metadata.fetched_rows) - Number(metadata.invalid_rows) - payload.jobs.length) throw new Error(`${label}: duplicate accounting is inconsistent`);
  if (Number(metadata.status_conflict_count) !== payload.jobs.filter(job => Boolean(job.status_conflict)).length) throw new Error(`${label}: status_conflict_count is inconsistent`);
  if ((Number(metadata.invalid_rows) > 0 || Number(metadata.parse_errors) > 0) && metadata.completeness.startsWith("complete_")) throw new Error(`${label}: parser drops require partial/failed completeness`);
  if (["blocked", "failed"].includes(metadata.completeness) && payload.jobs.length) throw new Error(`${label}: blocked/failed snapshots cannot contain jobs`);
  if (!metadata.inputs.length) throw new Error(`${label}: metadata.inputs cannot be empty`);
  for (const [index, input] of metadata.inputs.entries()) {
    if (!input || !["live_http", "public_search", "main_chrome", "imported_snapshot", "named_targets"].includes(input.kind) || !isISODate(input.captured_at)) throw new Error(`${label}: metadata.inputs[${index}] is invalid`);
    if (!input.uri || typeof input.uri !== "string") throw new Error(`${label}: metadata.inputs[${index}].uri is required`);
    if (input.kind === "imported_snapshot" && (!/^[a-f0-9]{64}$/.test(String(input.sha256)) || !Number.isInteger(Number(input.bytes)) || Number(input.bytes) < 0)) throw new Error(`${label}: imported metadata.inputs[${index}] requires sha256 and bytes`);
  }
  const identities = new Set();
  payload.jobs.forEach((raw, index) => {
    const job = normalizeJob(raw, expectedSource);
    if (!job.source || !job.source_id || !job.company || !job.title || !/^https?:\/\//i.test(job.url) || !isISODate(job.captured_at) || !/^[a-f0-9]{64}$/.test(job.source_payload_hash) || !/^[a-f0-9]{64}$/.test(job.content_fingerprint)) {
      throw new Error(`${label}: jobs[${index}] is missing identity, URL, captured_at, source_payload_hash, or content_fingerprint`);
    }
    if (options.kind !== "reviewed" && job.filter_stage !== "raw") throw new Error(`${label}: jobs[${index}].filter_stage must be raw`);
    if (expectedSource && !options.allowMultipleSources && job.source !== expectedSource) {
      throw new Error(`${label}: jobs[${index}].source=${job.source} does not match ${expectedSource}`);
    }
    const identity = `${job.source}|${job.source_id}`;
    if (identities.has(identity)) throw new Error(`${label}: duplicate source identity ${identity}`);
    identities.add(identity);
  });
  return payload;
}

export function ledgerPayload(source, scope, jobs, details = {}) {
  const normalized = mergeSameSourceJobs(jobs.map(job => normalizeJob(job, source)));
  const fetchedRows = Number(details.fetched_rows ?? jobs.length);
  const invalidRows = Number(details.invalid_rows ?? 0);
  const duplicateRows = fetchedRows - invalidRows - normalized.length;
  const capturedAt = details.captured_at || now();
  const payload = {
    metadata: {
      schema_version: 1,
      source,
      producer: details.producer || "job-census-source-collector",
      captured_at: capturedAt,
      scope,
      scope_kind: details.scope_kind || "public_surface",
      queries: details.queries || [],
      pagination: details.pagination || { method: "snapshot", page_size: null, requests: [], termination: "declared snapshot boundary" },
      completeness: details.completeness || "partial",
      limits: details.limits || [],
      fetched_rows: fetchedRows,
      emitted_rows: normalized.length,
      invalid_rows: invalidRows,
      parse_errors: Number(details.parse_errors ?? 0),
      normalization_warnings: details.normalization_warnings || [],
      duplicates_removed: duplicateRows,
      status_conflict_count: normalized.filter(job => Boolean(job.status_conflict)).length,
      snapshot_kind: details.snapshot_kind || "live",
      inputs: details.inputs || [],
      ...details
    },
    jobs: normalized.map(job => {
      const next = { ...job, captured_at: job.captured_at || capturedAt, filter_stage: "raw" };
      next.content_fingerprint = contentFingerprint(next);
      return next;
    })
  };
  delete payload.metadata.pages;
  delete payload.metadata.unique;
  delete payload.metadata.collector;
  delete payload.metadata.unique_source_ids;
  validateLedger(payload, { expectedSource: source, label: source });
  return payload;
}

const evidenceRanks = {
  official_detail_verified: 600,
  official_detail: 550,
  detail_verified: 500,
  public_detail: 400,
  source_listing: 300,
  search_card: 200,
  snapshot: 100,
  unknown: 0
};

export function evidenceScore(job) {
  const explicit = Number(job.evidence_priority);
  return Number.isFinite(explicit) ? explicit * 1_000 : (evidenceRanks[job.evidence_level] ?? evidenceRanks.unknown);
}

export function compareEvidence(left, right) {
  const score = evidenceScore(right) - evidenceScore(left);
  if (score) return score;
  const captured = String(right.captured_at || "").localeCompare(String(left.captured_at || ""));
  return captured || hashValue(left).localeCompare(hashValue(right));
}

export function mergeSameSourceJobs(records) {
  const groups = new Map();
  for (const raw of records) {
    const job = normalizeJob(raw, raw.source);
    const key = `${job.source}|${job.source_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  return [...groups.values()].map(group => {
    const ordered = [...group].sort(compareEvidence);
    const primary = { ...ordered[0] };
    for (const field of ["location", "career_min", "career_max", "employment", "deadline", "posted_at", "review_text"]) {
      if (primary[field] === null || primary[field] === undefined || primary[field] === "") primary[field] = ordered.find(job => job[field] !== null && job[field] !== undefined && job[field] !== "")?.[field] ?? null;
    }
    primary.captured_at = group.map(job => job.captured_at).sort().at(-1) || primary.captured_at;
    primary.match_terms = unique(group.flatMap(job => job.match_terms));
    const statusGroups = unique(group.map(job => statusGroup(job.status)));
    primary.status_conflict = statusGroups.includes("active") && statusGroups.includes("closed");
    primary.conflict_types = unique([
      ...(primary.status_conflict ? ["listing_status"] : []),
      ...(unique(group.map(job => job.employment)).length > 1 ? ["employment"] : [])
    ]);
    primary.evidence_chain = ordered.map(job => ({ evidence_level: job.evidence_level, captured_at: job.captured_at, source_payload_hash: job.source_payload_hash }));
    primary.content_fingerprint = contentFingerprint(primary);
    return primary;
  });
}

export function snapshotProvenance(runDir, file, payload) {
  return {
    file: relativeFile(runDir, file),
    sha256: sha256(file),
    source: payload.metadata.source || "multi",
    producer: payload.metadata.producer,
    captured_at: payload.metadata.captured_at,
    completeness: payload.metadata.completeness,
    scope: payload.metadata.scope,
    scope_kind: payload.metadata.scope_kind,
    queries: payload.metadata.queries,
    pagination: payload.metadata.pagination,
    snapshot_kind: payload.metadata.snapshot_kind,
    inputs: payload.metadata.inputs,
    rows: payload.jobs.length,
    fetched_rows: Number(payload.metadata.fetched_rows),
    emitted_rows: Number(payload.metadata.emitted_rows),
    invalid_rows: Number(payload.metadata.invalid_rows),
    duplicates_removed: Number(payload.metadata.duplicates_removed),
    parse_errors: Number(payload.metadata.parse_errors),
    status_conflict_count: Number(payload.metadata.status_conflict_count),
    normalization_warnings: payload.metadata.normalization_warnings,
    pagination_requests: payload.metadata.pagination.requests.length,
    limits: payload.metadata.limits
  };
}

export function loadSourcePlan(runDir, file = path.join(runDir, "source-plan.json")) {
  if (!fs.existsSync(file)) throw new Error(`source plan not found: ${file}`);
  const plan = readJSON(file);
  if (!plan || plan.schema_version !== 1 || !plan.run_id || !isISODate(plan.started_at) || !Array.isArray(plan.sources) || !plan.sources.length) {
    throw new Error(`${file}: expected schema_version=1, run_id, started_at, and non-empty sources[]`);
  }
  const seen = new Set();
  for (const [index, entry] of plan.sources.entries()) {
    if (!entry?.source || seen.has(entry.source)) throw new Error(`${file}: invalid/duplicate sources[${index}].source`);
    seen.add(entry.source);
    for (const key of ["producer", "expected_inputs", "access_mode", "scope", "queries", "pagination", "output_path", "minimum_captured_at", "attempt_status"]) if (entry[key] === undefined) throw new Error(`${file}: sources[${index}].${key} is required`);
    if (!Array.isArray(entry.expected_inputs) || !entry.expected_inputs.length || entry.expected_inputs.some(input => !input?.kind || !input?.uri) || !Array.isArray(entry.queries) || !entry.pagination?.termination) throw new Error(`${file}: invalid input/query/pagination contract for ${entry.source}`);
    if (!isISODate(entry.minimum_captured_at)) throw new Error(`${file}: invalid minimum_captured_at for ${entry.source}`);
    const resolved = path.resolve(runDir, entry.output_path);
    const rawRoot = `${path.resolve(runDir, "raw")}${path.sep}`;
    if (!resolved.startsWith(rawRoot)) throw new Error(`${file}: ${entry.source} file must be under raw/`);
  }
  if (plan.reviewed_snapshots !== undefined && !Array.isArray(plan.reviewed_snapshots)) throw new Error(`${file}: reviewed_snapshots must be an array`);
  return { plan, file: path.resolve(file) };
}

export function assertFreshSnapshot(payload, entry, label = entry.source) {
  const captured = Date.parse(payload.metadata.captured_at);
  const minimum = Date.parse(entry.minimum_captured_at);
  if (!Number.isFinite(captured) || captured < minimum) throw new Error(`${label}: captured_at ${payload.metadata.captured_at} is older than ${entry.minimum_captured_at}`);
  if (payload.metadata.source !== entry.source || payload.metadata.producer !== entry.producer || payload.metadata.scope !== entry.scope) throw new Error(`${label}: source/producer/scope differs from source plan`);
  if (JSON.stringify(payload.metadata.queries) !== JSON.stringify(entry.queries)) throw new Error(`${label}: query list differs from source plan`);
  for (const field of ["method", "page_size"]) if ((payload.metadata.pagination[field] ?? null) !== (entry.pagination[field] ?? null)) throw new Error(`${label}: pagination.${field} differs from source plan`);
  for (const expected of entry.expected_inputs) if (!payload.metadata.inputs.some(input => input.kind === expected.kind && input.uri === expected.uri)) throw new Error(`${label}: missing exact expected input ${expected.kind}:${expected.uri}`);
  if (entry.allowed_completeness) {
    const allowed = Array.isArray(entry.allowed_completeness) ? entry.allowed_completeness : [entry.allowed_completeness];
    if (!allowed.includes(payload.metadata.completeness)) throw new Error(`${label}: completeness ${payload.metadata.completeness} not allowed by source plan`);
  }
}

export function parseSaraminCareer(value) {
  const text = String(value ?? "");
  const bounded = text.match(/(\d+)\s*~\s*(\d+)년/);
  if (bounded) return [Number(bounded[1]), Number(bounded[2])];
  const maximum = text.match(/경력\s*(\d+)년\s*(?:↓|이하)/);
  if (maximum) return [0, Number(maximum[1])];
  const minimum = text.match(/경력\s*(\d+)년\s*(?:↑|이상)/);
  if (minimum) return [Number(minimum[1]), null];
  if (/신입|경력무관/.test(text)) return [0, null];
  return [null, null];
}

export function hasConsecutiveEmptyPages(pageCounts, required = 3) {
  let empty = 0;
  for (const count of pageCounts) empty = Number(count) === 0 ? empty + 1 : 0;
  return empty >= required;
}

export function contentFingerprint(job) {
  const normalize = value => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : (value ?? null);
  return hashValue([job.source, job.source_id, job.company, job.title, job.location, job.career_min, job.career_max, job.employment, job.review_text].map(normalize));
}
