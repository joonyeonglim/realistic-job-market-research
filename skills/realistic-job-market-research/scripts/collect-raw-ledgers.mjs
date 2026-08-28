#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  assertFreshSnapshot,
  hashValue,
  hasConsecutiveEmptyPages,
  ledgerPayload,
  loadSourcePlan,
  now,
  parseArgs,
  parseSnapshot,
  readJSON,
  requireRunDir,
  sha256,
  unique,
  validateLedger,
  valuesOf,
  writeJSON
} from "./common.mjs";
import { safeRequest } from "./safe-http.mjs";
import { parseSaraminCards } from "./source-parsers.mjs";
import { CORE_ADAPTERS, validateAdapterContract } from "./adapter-contract.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: collect-raw-ledgers.mjs --run-dir RUN --phase all|wanted|saramin|jumpit|rallit|snapshot|SOURCE [--snapshot source=FILE]\n'all' runs all supported live adapters declared in source-plan.json; the orchestrator must still produce every other planned source.");
  process.exit(0);
}
const runDir = requireRunDir(args);
const { plan, file: planFile } = loadSourcePlan(runDir, args["source-plan"] ? path.resolve(String(args["source-plan"])) : undefined);
const planBySource = new Map(plan.sources.map(entry => [entry.source, entry]));
const rawDir = path.join(runDir, "raw");
const collectedAt = now();
const phaseValues = valuesOf(args.phase || "all").flatMap(value => String(value).split(","));
const phases = new Set(phaseValues.map(value => value.trim()).filter(Boolean));
validateAdapterContract();
const stableSources = CORE_ADAPTERS;
const selected = phases.has("all")
  ? new Set(stableSources.filter(source => planBySource.get(source)?.expected_inputs.some(input => ["live_http", "public_search"].includes(input.kind))))
  : new Set([...phases].filter(phase => stableSources.includes(phase)));
const timeoutMs = numberOption("timeout-ms", 30_000, 1_000);
const maxPages = numberOption("max-pages", 1_000, 1);

fs.mkdirSync(rawDir, { recursive: true });

function numberOption(name, fallback, minimum) {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return value;
}

async function fetchText(url, options = {}) {
  const { response, text } = await safeRequest(url, { ...options, timeoutMs, retries: 3 });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return text;
}

const fetchJSON = async (url, options) => JSON.parse(await fetchText(url, options));
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }));
  return results;
}

function save(source, payload) {
  const entry = planBySource.get(source);
  if (!entry) throw new Error(`${source}: not declared in ${planFile}`);
  validateLedger(payload, { expectedSource: source, label: source });
  assertFreshSnapshot(payload, entry);
  const file = path.resolve(runDir, entry.output_path);
  if (fs.existsSync(file)) throw new Error(`${source}: immutable raw snapshot already exists: ${file}`);
  const staging = path.join(rawDir, ".staging", `${source}.${plan.run_id}.json`);
  writeJSON(staging, payload);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.renameSync(staging, file);
  console.error(`${source}: ${payload.jobs.length.toLocaleString("en-US")} unique rows -> ${file}`);
}

async function attempt(source, collector) {
  try {
    await collector();
  } catch (error) {
    const entry = planBySource.get(source);
    const file = path.resolve(runDir, entry.output_path);
    if (fs.existsSync(file)) throw error;
    save(source, ledgerPayload(source, entry.scope, [], {
      captured_at: collectedAt,
      fetched_rows: 0,
      completeness: "failed",
      scope_kind: entry.queries.length ? "query" : "public_surface",
      pagination: { method: entry.pagination.method, page_size: entry.pagination.page_size, requests: [{ error: error.message }], termination: entry.pagination.termination },
      inputs: entry.expected_inputs.map(input => ({ ...input, captured_at: collectedAt })),
      limits: [`collector failed: ${error.message}`]
    }));
  }
}

async function collectWanted() {
  const headers = { "wanted-user-country": "KR", "wanted-user-language": "ko", "user-agent": "Mozilla/5.0" };
  const pages = [];
  let consecutiveEmpty = 0;
  for (let offset = 0; consecutiveEmpty < 3; offset += 100) {
    if (pages.length >= maxPages) throw new Error(`wanted: hit --max-pages=${maxPages} before three terminal empty pages`);
    const url = new URL("https://www.wanted.co.kr/api/v4/jobs");
    for (const [key, value] of Object.entries({ country: "kr", locations: "all", years: "-1", limit: "100", offset: String(offset), job_sort: "job.latest_order" })) url.searchParams.set(key, value);
    const payload = await fetchJSON(url, { headers });
    const data = Array.isArray(payload.data) ? payload.data : [];
    pages.push({ offset, count: data.length, data });
    consecutiveEmpty = data.length === 0 ? consecutiveEmpty + 1 : 0;
  }
  const jobs = new Map();
  let rawRows = 0;
  let invalidRows = 0;
  for (const page of pages) for (const item of page.data) {
    rawRows += 1;
    if (item.id == null || !item.company?.name || !item.position) {
      invalidRows += 1;
      continue;
    }
    const address = item.address || {};
    const tags = Array.isArray(item.category_tags) ? item.category_tags : [];
    jobs.set(String(item.id), {
      source: "wanted",
      source_id: String(item.id),
      company: item.company?.name || "UNKNOWN",
      title: item.position || "UNKNOWN",
      url: `https://www.wanted.co.kr/wd/${item.id}`,
      location: address.full_location || [address.location, address.district].filter(Boolean).join(" ") || null,
      career_min: item.annual_from ?? null,
      career_max: item.annual_to ?? null,
      employment: null,
      deadline: item.due_time ? String(item.due_time).slice(0, 10) : null,
      status: item.status || "unknown",
      industry: item.company?.industry_name || null,
      category_parent_ids: unique(tags.map(tag => tag.parent_id)),
      category_tag_ids: unique(tags.map(tag => tag.id)),
      match_terms: [],
      review_text: JSON.stringify({ industry: item.company?.industry_name || null, categories: tags.map(tag => [tag.parent_id, tag.id]) }),
      filter_stage: "raw",
      exclusion_reason: null,
      captured_at: collectedAt,
      evidence_level: "source_listing",
      source_payload_hash: hashValue(item)
    });
  }
  const seenWantedIds = new Set();
  const wantedRequests = pages.map(page => {
    const ids = page.data.map(item => item.id).filter(id => id !== null && id !== undefined).map(String);
    const pageUnique = new Set(ids);
    const repeated = ids.filter(id => seenWantedIds.has(id)).length;
    ids.forEach(id => seenWantedIds.add(id));
    return { offset: page.offset, count: page.count, unique_ids: pageUnique.size, duplicate_ids: ids.length - pageUnique.size, repeated_from_prior_pages: repeated };
  });
  const duplicateRows = rawRows - invalidRows - jobs.size;
  if (!hasConsecutiveEmptyPages(pages.map(page => page.count), 3)) throw new Error("wanted: missing three consecutive terminal empty pages");
  save("wanted", ledgerPayload("wanted", planBySource.get("wanted").scope, [...jobs.values()], {
    captured_at: collectedAt,
    fetched_rows: rawRows,
    invalid_rows: invalidRows,
    completeness: invalidRows || duplicateRows ? "partial" : "complete_surface",
    scope_kind: "public_surface",
    pagination: { method: "offset", page_size: 100, requests: wantedRequests, termination: "three consecutive empty pages" },
    inputs: [{ kind: "live_http", uri: "https://www.wanted.co.kr/api/v4/jobs", captured_at: collectedAt }],
    terminal_empty_pages: consecutiveEmpty,
    limits: [...(invalidRows ? [`${invalidRows} API rows missed required fields`] : []), ...(duplicateRows ? [`${duplicateRows} source IDs repeated across the moving pagination boundary`] : [])],
    normalization_warnings: [...(invalidRows ? ["required-field rows omitted"] : []), ...(duplicateRows ? ["duplicate source IDs merged; completeness downgraded"] : [])]
  }));
}

async function collectSaramin() {
  const defaultQueries = ["AI", "Python", "AI 서비스 개발", "AI 엔지니어", "생성형 AI", "생성형AI", "AI 백엔드", "Agent", "AI Agent", "AI Product", "LLM", "RAG", "FastAPI", "MCP", "Agentic", "LangGraph", "vLLM", "GenAI"];
  const queries = valuesOf(args["saramin-query"]).map(String);
  if (!queries.length) queries.push(...defaultQueries);
  const headers = { "user-agent": "Mozilla/5.0", "x-requested-with": "XMLHttpRequest" };
  const jobs = new Map();
  const queryDetails = [];
  let rawRows = 0;
  let invalidRows = 0;
  let parseErrors = 0;
  let driftedQueries = 0;
  let duplicateIdsWithinQueries = 0;
  const fetchPage = async (query, page) => {
    const url = new URL("https://www.saramin.co.kr/zf_user/search/get-recruit-list");
    for (const [key, value] of Object.entries({ searchword: query, recruitPage: String(page), recruitSort: "relation", recruitPageCount: "100", inner_com_type: "", company_cd: "", show_applied: "", quick_apply: "", except_read: "", mainSearch: "n" })) url.searchParams.set(key, value);
    return await fetchJSON(url, { headers: { ...headers, referer: `https://www.saramin.co.kr/zf_user/search/recruit?searchword=${encodeURIComponent(query)}` } });
  };
  for (const query of queries) {
    const first = await fetchPage(query, 1);
    const startCount = Number(String(first.count ?? 0).replace(/,/g, ""));
    let expectedPages = Math.max(1, Math.ceil(startCount / 100));
    if (expectedPages > maxPages) throw new Error(`saramin ${query}: ${expectedPages} pages exceeds --max-pages=${maxPages}`);
    const pageNumbers = Array.from({ length: expectedPages - 1 }, (_, index) => index + 2);
    const payloads = [first, ...(await mapLimit(pageNumbers, 6, page => fetchPage(query, page)))];
    const end = await fetchPage(query, 1);
    const endCount = Number(String(end.count ?? 0).replace(/,/g, ""));
    const endPages = Math.max(1, Math.ceil(endCount / 100));
    if (endPages > expectedPages) {
      const extra = Array.from({ length: endPages - expectedPages }, (_, index) => expectedPages + index + 1);
      payloads.push(...(await mapLimit(extra, 6, page => fetchPage(query, page))));
      expectedPages = endPages;
    }
    const terminalCards = parseSaraminCards((await fetchPage(query, expectedPages + 1)).innerHTML || "", query);
    if (terminalCards.jobs.length || terminalCards.invalid) throw new Error(`saramin ${query}: terminal page was not empty`);
    let queryRows = 0;
    let queryInvalid = 0;
    const queryIds = new Set();
    const pageDetails = [];
    for (const [pageIndex, payload] of payloads.entries()) {
      const parsed = parseSaraminCards(payload.innerHTML || "", query, collectedAt);
      invalidRows += parsed.invalid;
      queryInvalid += parsed.invalid;
      rawRows += parsed.invalid;
      const pageIds = parsed.jobs.map(job => job.source_id);
      const pageUnique = new Set(pageIds);
      const repeated = pageIds.filter(id => queryIds.has(id)).length;
      pageIds.forEach(id => queryIds.add(id));
      pageDetails.push({ page: pageIndex + 1, cards: pageIds.length + parsed.invalid, unique_ids: pageUnique.size, duplicate_ids: pageIds.length - pageUnique.size, repeated_from_prior_pages: repeated, invalid_rows: parsed.invalid });
      for (const job of parsed.jobs) {
        queryRows += 1;
        rawRows += 1;
        const existing = jobs.get(job.source_id);
        if (existing) existing.match_terms = unique([...existing.match_terms, query]);
        else jobs.set(job.source_id, job);
      }
    }
    const queryDuplicates = queryRows - queryIds.size;
    duplicateIdsWithinQueries += queryDuplicates;
    queryDetails.push({ query, start_count: startCount, end_count: endCount, pages: payloads.length, fetched_cards: queryRows + queryInvalid, unique_ids: queryIds.size, duplicate_ids: queryDuplicates, invalid_rows: queryInvalid, page_details: pageDetails, terminal_request: { page: expectedPages + 1, cards: 0 }, terminal_empty: true });
    if (startCount > 0 && queryRows === 0) parseErrors += 1;
    if (startCount !== endCount || queryRows + queryInvalid !== endCount || queryDuplicates) driftedQueries += 1;
    console.error(`saramin ${query}: ${queryRows.toLocaleString("en-US")} cards`);
  }
  save("saramin", ledgerPayload("saramin", planBySource.get("saramin").scope, [...jobs.values()], {
    captured_at: collectedAt,
    fetched_rows: rawRows,
    invalid_rows: invalidRows,
    parse_errors: parseErrors,
    completeness: invalidRows || parseErrors || driftedQueries || duplicateIdsWithinQueries ? "partial" : "complete_query",
    scope_kind: "query",
    queries,
    query_details: queryDetails,
    pagination: { method: "page", page_size: 100, requests: queryDetails, termination: "reported final page plus empty terminal page per query" },
    inputs: [{ kind: "public_search", uri: "https://www.saramin.co.kr/zf_user/search/get-recruit-list", captured_at: collectedAt }],
    limits: [
      ...(invalidRows ? [`${invalidRows} cards failed required-field parsing`] : []),
      ...(parseErrors ? [`${parseErrors} queries returned a positive provider count but parsed zero cards`] : []),
      ...(driftedQueries ? [`${driftedQueries} queries had count drift or fetched/provider count mismatch`] : [])
      ,...(duplicateIdsWithinQueries ? [`${duplicateIdsWithinQueries} source IDs repeated within query pagination`] : [])
    ],
    normalization_warnings: [...(invalidRows ? ["required-field cards omitted"] : []), ...(duplicateIdsWithinQueries ? ["duplicate query IDs merged; completeness downgraded"] : [])]
  }));
}

async function collectJumpit() {
  const defaultTags = ["AI/인공지능", "MachineLearning", "NLP", "FastAPI", "Python", "LangChain"];
  const tags = valuesOf(args["jumpit-tag"]).map(String);
  if (!tags.length) tags.push(...defaultTags);
  const jobs = new Map();
  const queryDetails = [];
  let rawRows = 0;
  let invalidRows = 0;
  let duplicateIdsWithinTags = 0;
  const fetchPage = async (tag, page) => {
    const url = new URL("https://jumpit-api.saramin.co.kr/api/positions");
    for (const [key, value] of Object.entries({ sort: "reg", page: String(page), techStack: tag })) url.searchParams.set(key, value);
    return await fetchJSON(url, { headers: { "user-agent": "Mozilla/5.0" } });
  };
  for (const tag of tags) {
    const first = await fetchPage(tag, 1);
    const total = Number(first.result?.totalCount || 0);
    const pageSize = Math.max(1, first.result?.positions?.length || 16);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages > maxPages) throw new Error(`jumpit ${tag}: ${pages} pages exceeds --max-pages=${maxPages}`);
    const payloads = [first, ...(await mapLimit(Array.from({ length: pages - 1 }, (_, index) => index + 2), 4, page => fetchPage(tag, page)))];
    let queryRows = 0;
    let queryInvalid = 0;
    const queryIds = new Set();
    const pageDetails = [];
    for (const [pageIndex, payload] of payloads.entries()) {
      const items = payload.result?.positions || [];
      const validIds = items.filter(item => item.id != null && item.companyName && item.title).map(item => String(item.id));
      const pageUnique = new Set(validIds);
      const repeated = validIds.filter(id => queryIds.has(id)).length;
      validIds.forEach(id => queryIds.add(id));
      pageDetails.push({ page: pageIndex + 1, cards: items.length, unique_ids: pageUnique.size, duplicate_ids: validIds.length - pageUnique.size, repeated_from_prior_pages: repeated });
      for (const item of items) {
        queryRows += 1;
        rawRows += 1;
        if (item.id == null || !item.companyName || !item.title) {
          invalidRows += 1;
          queryInvalid += 1;
          continue;
        }
        const sourceId = String(item.id);
        const existing = jobs.get(sourceId);
        if (existing) existing.match_terms = unique([...existing.match_terms, tag, ...(item.techStacks || [])]);
        else jobs.set(sourceId, {
        source: "jumpit",
        source_id: sourceId,
        company: item.companyName || "UNKNOWN",
        title: item.title || "UNKNOWN",
        url: `https://jumpit.saramin.co.kr/position/${sourceId}`,
        location: (item.locations || []).join(", ") || null,
        career_min: item.minCareer ?? null,
        career_max: item.maxCareer ?? null,
        employment: null,
        deadline: item.alwaysOpen ? null : (item.closedAt ? String(item.closedAt).slice(0, 10) : null),
        status: "active",
        match_terms: unique([tag, ...(item.techStacks || [])]),
        review_text: JSON.stringify({ tech_stacks: item.techStacks || [], job_category: item.jobCategory || null }),
        filter_stage: "raw",
        exclusion_reason: null,
        captured_at: collectedAt,
        evidence_level: "source_listing",
        source_payload_hash: hashValue(item)
        });
      }
    }
    if (queryRows !== total) throw new Error(`jumpit ${tag}: fetched ${queryRows}, API reported ${total}`);
    const queryDuplicates = queryRows - queryInvalid - queryIds.size;
    duplicateIdsWithinTags += queryDuplicates;
    queryDetails.push({ tag, total, pages, fetched_cards: queryRows, unique_ids: queryIds.size, duplicate_ids: queryDuplicates, invalid_rows: queryInvalid, page_details: pageDetails });
  }
  save("jumpit", ledgerPayload("jumpit", planBySource.get("jumpit").scope, [...jobs.values()], {
    captured_at: collectedAt,
    fetched_rows: rawRows,
    invalid_rows: invalidRows,
    completeness: invalidRows || duplicateIdsWithinTags ? "partial" : "complete_query",
    scope_kind: "query",
    tags,
    queries: tags,
    query_details: queryDetails,
    pagination: { method: "page", page_size: 16, requests: queryDetails, termination: "every API-reported page fetched and row count matched" },
    inputs: [{ kind: "public_search", uri: "https://jumpit-api.saramin.co.kr/api/positions", captured_at: collectedAt }],
    limits: [...(invalidRows ? [`${invalidRows} API rows missed required fields`] : []), ...(duplicateIdsWithinTags ? [`${duplicateIdsWithinTags} source IDs repeated within tag pagination`] : [])],
    normalization_warnings: [...(invalidRows ? ["required-field rows omitted"] : []), ...(duplicateIdsWithinTags ? ["duplicate tag IDs merged; completeness downgraded"] : [])]
  }));
}

async function collectRallit() {
  const fetchPage = page => fetchJSON(`https://www.rallit.com/api/v1/position?pageNumber=${page}&pageSize=20`, { headers: { "user-agent": "Mozilla/5.0" } });
  const first = await fetchPage(1);
  const pages = Number(first.data?.totalPage || 0);
  if (pages > maxPages) throw new Error(`rallit: ${pages} pages exceeds --max-pages=${maxPages}`);
  const payloads = pages === 0 ? [first] : [first, ...(await mapLimit(Array.from({ length: pages - 1 }, (_, index) => index + 2), 4, fetchPage))];
  const regions = { PANGYO: "경기 성남시 판교", GANGNAM: "서울 강남", SEOUL: "서울", GYEONGGI: "경기", REMOTE: "원격" };
  const fetched = payloads.flatMap(payload => payload.data?.items || []);
  const invalidRows = fetched.filter(item => item.id == null || !item.companyName || !item.title).length;
  const byId = new Map();
  for (const item of fetched.filter(item => item.id != null && item.companyName && item.title)) {
    const job = {
    source: "rallit",
    source_id: String(item.id),
    company: item.companyName || "UNKNOWN",
    title: item.title || "UNKNOWN",
    url: item.url || `https://www.rallit.com/positions/${item.id}`,
    location: regions[item.addressRegion] || item.addressRegion || null,
    career_min: null,
    career_max: null,
    employment: null,
    deadline: item.endedAt?.startsWith("9999-") ? null : (item.endedAt || null),
    status: item.status?.code || "unknown",
    match_terms: unique(item.jobSkillKeywords || []),
    review_text: JSON.stringify({ skills: item.jobSkillKeywords || [], levels: item.jobLevels || [] }),
    filter_stage: "raw",
    exclusion_reason: null,
    captured_at: collectedAt,
      evidence_level: "source_listing",
      source_payload_hash: hashValue(item)
    };
    const existing = byId.get(job.source_id);
    if (existing) existing.match_terms = unique([...existing.match_terms, ...job.match_terms]);
    else byId.set(job.source_id, job);
  }
  const jobs = [...byId.values()];
  const duplicateRows = fetched.length - invalidRows - jobs.length;
  const reportedRows = Number(first.data?.totalCount ?? first.data?.totalElements ?? fetched.length);
  const countMismatch = Number.isFinite(reportedRows) && reportedRows !== fetched.length;
  const seenRallitIds = new Set();
  const rallitRequests = payloads.map((payload, index) => {
    const ids = (payload.data?.items || []).map(item => item.id).filter(id => id !== null && id !== undefined).map(String);
    const pageUnique = new Set(ids);
    const repeated = ids.filter(id => seenRallitIds.has(id)).length;
    ids.forEach(id => seenRallitIds.add(id));
    return { page: index + 1, count: (payload.data?.items || []).length, unique_ids: pageUnique.size, duplicate_ids: ids.length - pageUnique.size, repeated_from_prior_pages: repeated };
  });
  save("rallit", ledgerPayload("rallit", planBySource.get("rallit").scope, jobs, {
    captured_at: collectedAt,
    fetched_rows: fetched.length,
    invalid_rows: invalidRows,
    completeness: invalidRows || countMismatch || duplicateRows ? "partial" : "complete_surface",
    scope_kind: "public_surface",
    pagination: { method: "page", page_size: 20, requests: rallitRequests, termination: "every API-reported page fetched" },
    inputs: [{ kind: "live_http", uri: "https://www.rallit.com/api/v1/position", captured_at: collectedAt }],
    limits: [
      ...(invalidRows ? [`${invalidRows} API rows missed required fields`] : []),
      ...(countMismatch ? [`provider reported ${reportedRows} rows but ${fetched.length} were fetched`] : []),
      ...(duplicateRows ? [`${duplicateRows} source IDs repeated across listing pages`] : [])
    ],
    normalization_warnings: [...(invalidRows ? ["required-field rows omitted"] : []), ...(duplicateRows ? ["duplicate listing IDs merged; completeness downgraded"] : [])]
  }));
}

function importSnapshots() {
  const imported = [];
  for (const value of valuesOf(args.snapshot)) {
    const ref = parseSnapshot(value);
    if (!fs.existsSync(ref.file)) throw new Error(`snapshot not found: ${ref.file}`);
    const parsed = readJSON(ref.file);
    if (Array.isArray(parsed)) {
      throw new Error(`${ref.file}: raw arrays are unsafe; wrap as canonical {metadata,jobs} with captured_at, pagination, counters, hashes, and completeness`);
    }
    const source = ref.source || parsed.metadata?.source;
    if (!source) throw new Error(`${ref.file}: snapshot source is required (use --snapshot source=FILE)`);
    if (!planBySource.has(source)) throw new Error(`${source}: snapshot source is not declared in ${planFile}`);
    const sourceSelected = phases.has("all") || phases.has("snapshot") || phases.has(source);
    if (!sourceSelected) continue;
    const originalCapturedAt = parsed.metadata?.captured_at;
    parsed.metadata = {
      ...parsed.metadata,
      source,
      snapshot_kind: "imported",
      inputs: [
        ...(parsed.metadata?.inputs || []),
        { kind: "imported_snapshot", uri: path.resolve(ref.file), captured_at: originalCapturedAt, sha256: sha256(ref.file), bytes: fs.statSync(ref.file).size }
      ],
      imported_from: path.resolve(ref.file)
    };
    validateLedger(parsed, { expectedSource: source, label: ref.file });
    save(source, parsed);
    imported.push(source);
  }
  return imported;
}

const allowed = new Set([...planBySource.keys(), ...stableSources, "all", "snapshot"]);
for (const phase of phases) if (!allowed.has(phase)) throw new Error(`unknown --phase ${phase}`);

if (selected.has("wanted")) await attempt("wanted", collectWanted);
if (selected.has("saramin")) await attempt("saramin", collectSaramin);
if (selected.has("jumpit")) await attempt("jumpit", collectJumpit);
if (selected.has("rallit")) await attempt("rallit", collectRallit);
const imported = importSnapshots();
const requiredSnapshotSources = plan.sources
  .filter(entry => entry.expected_inputs.some(input => input.kind === "imported_snapshot") && (phases.has("all") || phases.has("snapshot") || phases.has(entry.source)))
  .map(entry => entry.source);
for (const source of requiredSnapshotSources) if (!imported.includes(source)) {
  throw new Error(`${source}: declared snapshot input is required; pass --snapshot ${source}=FILE`);
}

console.log(JSON.stringify({ run_dir: runDir, collected: [...selected].filter(source => stableSources.includes(source)), imported }, null, 2));
