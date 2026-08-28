#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  assertFreshSnapshot,
  hashValue,
  ledgerPayload,
  loadSourcePlan,
  now,
  parseArgs,
  readJSON,
  requireRunDir,
  unique,
  validateLedger,
  writeJSON
} from "./common.mjs";
import { safeRequest, validatePublicUrl } from "./safe-http.mjs";
import { decodeHTML as decode, parseCareer, textOnly } from "./source-parsers.mjs";
import { AUTHENTICATED_HANDOFF, EXTENDED_ADAPTERS, PROBE_ONLY, validateAdapterContract } from "./adapter-contract.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: collect-extended-sources.mjs --run-dir RUN [--phase all|SOURCE,...] [--official-targets FILE]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const { plan } = loadSourcePlan(runDir);
const entries = new Map(plan.sources.map(entry => [entry.source, entry]));
const capturedAt = now();
const phases = new Set(String(args.phase || "all").split(",").map(value => value.trim()).filter(Boolean));
const selected = source => phases.has("all") || phases.has(source);

const request = (url, options = {}) => safeRequest(url, options);

function rawJob(source, sourceId, company, title, url, fields = {}, payload = fields) {
  return {
    source,
    source_id: String(sourceId),
    company: company || "UNKNOWN",
    title: title || "UNKNOWN",
    url,
    captured_at: capturedAt,
    posted_at: fields.posted_at || null,
    location: fields.location || null,
    career_min: fields.career_min ?? null,
    career_max: fields.career_max ?? null,
    employment: fields.employment || null,
    deadline: fields.deadline || null,
    status: fields.status || "unknown",
    status_conflict: Boolean(fields.status_conflict),
    filter_stage: "raw",
    match_terms: unique(fields.match_terms || []),
    review_text: String(fields.review_text || "").slice(0, 12_000),
    source_payload_hash: hashValue(payload),
    source_fields: fields.source_fields || {},
    evidence_level: fields.evidence_level || "source_listing"
  };
}

function save(source, jobs, details) {
  const entry = entries.get(source);
  if (!entry) throw new Error(`missing source plan entry: ${source}`);
  const payload = ledgerPayload(source, entry.scope, jobs, {
    producer: entry.producer,
    captured_at: capturedAt,
    fetched_rows: details.fetched_rows ?? jobs.length,
    invalid_rows: details.invalid_rows ?? 0,
    parse_errors: details.parse_errors ?? 0,
    scope_kind: details.scope_kind || "query",
    queries: entry.queries,
    pagination: {
      method: entry.pagination.method,
      page_size: entry.pagination.page_size,
      requests: details.requests || [],
      termination: details.termination || entry.pagination.termination
    },
    completeness: details.completeness,
    inputs: details.inputs || entry.expected_inputs.map(input => ({ ...input, captured_at: capturedAt })),
    limits: details.limits || [],
    normalization_warnings: details.normalization_warnings || []
  });
  const file = path.join(runDir, entry.output_path);
  if (fs.existsSync(file)) throw new Error(`${source}: immutable snapshot exists`);
  validateLedger(payload, { expectedSource: source, label: source });
  assertFreshSnapshot(payload, entry, source);
  const staging = path.join(runDir, "raw", ".staging", `${source}.${process.pid}.json`);
  writeJSON(staging, payload);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.renameSync(staging, file);
  console.error(`${source}: ${payload.jobs.length} rows (${payload.metadata.completeness})`);
}

function terminal(source, completeness, limit, requestEvidence = {}) {
  save(source, [], {
    completeness,
    scope_kind: "public_surface",
    fetched_rows: 0,
    requests: [requestEvidence],
    limits: [limit]
  });
}

async function collectGroupby() {
  const source = "groupby";
  const jobs = [];
  const requests = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const url = new URL("https://api.groupby.kr/startup-positions");
    for (const [key, value] of Object.entries({ positionTypes: "7", offset: String(offset), limit: "10" })) url.searchParams.set(key, value);
    const { response, text } = await request(url, { headers: { origin: "https://groupby.kr", referer: "https://groupby.kr/jobs/ai" } });
    if (!response.ok) throw new Error(`groupby ${response.status}`);
    const payload = JSON.parse(text).data;
    total = Number(payload.total || 0);
    const items = payload.items || [];
    requests.push({ offset, count: items.length, reported_total: total });
    for (const item of items) {
      jobs.push(rawJob(source, item.id, item.startup?.name, item.name, `https://groupby.kr/positions/${item.id}`, {
        location: item.startup?.address || item.startup?.location || null,
        career_min: item.experienceRange?.min ?? null,
        career_max: item.experienceRange?.max ?? null,
        status: item.userApplication?.isPossibleApply === false ? "closed" : "active",
        posted_at: item.publishedAt || null,
        match_terms: [...(item.techStacks || []), ...(item.positionTypes || []).map(type => type.name)],
        review_text: JSON.stringify({
          tech: item.techStacks || [], member_count: item.startup?.memberCount ?? null,
          funding: item.startup?.fundingRound || null, areas: item.startup?.serviceAreas || [],
          remote: item.remoteWorkPreference || null
        }),
        source_fields: { startup_id: item.startup?.id ?? null, updated_at: item.updatedAt || null }
      }, item));
    }
    offset += items.length;
    if (!items.length) break;
  }
  save(source, jobs, {
    completeness: jobs.length === total ? "complete_surface" : "partial",
    scope_kind: "category",
    fetched_rows: jobs.length,
    requests,
    limits: jobs.length === total ? [] : [`API reported ${total}, fetched ${jobs.length}`]
  });
}

async function collectCareer() {
  const source = "career";
  const entry = entries.get(source);
  const jobs = [];
  const requests = [];
  let fetched = 0;
  let failed = 0;
  for (const query of entry.queries) {
    const url = new URL("https://search.career.co.kr/keyword/auto_jobs");
    url.searchParams.set("keyword", query);
    url.searchParams.set("page", "1");
    url.searchParams.set("pageSize", "100");
    const { response, text } = await request(url);
    if (!response.ok) { failed += 1; requests.push({ query, status: response.status }); continue; }
    const payload = JSON.parse(text);
    const rows = payload.list || [];
    requests.push({ query, reported_total: Number(payload.Total || rows.length), count: rows.length });
    fetched += rows.length;
    for (const row of rows) {
      const [careerMin, careerMax] = parseCareer(row.career_name);
      jobs.push(rawJob(source, row.regno, row.company_name, textOnly(row.subject), `https://job.career.co.kr/recruit/view/${row.regno}`, {
        location: [row.area_name, row.area_name2].filter(Boolean).join(" ") || null,
        career_min: careerMin,
        career_max: careerMax,
        employment: row.work_type_name || null,
        deadline: row.register_end_date || null,
        status: "active_search_result",
        posted_at: row.register_date || null,
        match_terms: [query],
        review_text: [row.school_name, row.career_name, row.jc_code_nm, textOnly(row.content)].filter(Boolean).join(" · "),
        source_fields: { company_id: row.company_id || null, apply_end: row.apply_end ?? null }
      }, row));
    }
  }
  save(source, jobs, {
    completeness: failed ? "partial" : "complete_query",
    fetched_rows: fetched,
    requests,
    limits: failed ? [`${failed} query requests failed`] : []
  });
}

async function collectRemoteOK() {
  const source = "remoteok";
  const url = "https://remoteok.com/api?tag=ai";
  const { response, text } = await request(url);
  if (!response.ok) return terminal(source, "failed", `HTTP ${response.status}`, { status: response.status });
  const payload = JSON.parse(text);
  const rows = payload.filter(item => item && item.id && item.position);
  const jobs = rows.map(item => rawJob(source, item.id, item.company, item.position, item.url || `https://remoteok.com/remote-jobs/${item.id}`, {
    location: item.location || "Remote",
    employment: "Full-time",
    status: "active_feed",
    posted_at: item.date || null,
    match_terms: item.tags || [],
    review_text: textOnly(item.description || ""),
    source_fields: { salary_min: item.salary_min ?? null, salary_max: item.salary_max ?? null }
  }, item));
  save(source, jobs, {
    completeness: "complete_surface",
    scope_kind: "feed",
    fetched_rows: rows.length,
    requests: [{ entries: payload.length, jobs: rows.length }],
    limits: ["AI-tag feed only; Korea payroll eligibility is not established"]
  });
}

async function collectWWR() {
  const source = "weworkremotely";
  const entry = entries.get(source);
  const jobs = [];
  const requests = [];
  let fetched = 0;
  for (const query of entry.queries) {
    const url = `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(query)}`;
    const { response, text } = await request(url);
    if (!response.ok) { requests.push({ query, status: response.status, count: 0 }); continue; }
    const cards = [...text.matchAll(/<li[^>]*class="[^"]*(?:feature|new-listing-container)[^"]*"[\s\S]*?<\/li>/gi)].map(match => match[0]);
    requests.push({ query, status: response.status, count: cards.length });
    fetched += cards.length;
    for (const card of cards) {
      const href = decode(card.match(/href="(\/remote-jobs\/[^"]+)"/)?.[1]);
      if (!href) continue;
      const spans = [...card.matchAll(/<span[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi)];
      const company = textOnly(spans.find(match => /company/i.test(match[1]))?.[2]) || "UNKNOWN";
      const title = textOnly(spans.find(match => /title/i.test(match[1]))?.[2]) || textOnly(card.match(/<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
      if (!title) continue;
      jobs.push(rawJob(source, href, company, title, new URL(href, "https://weworkremotely.com").href, {
        location: "Remote",
        status: "public_search_visible",
        match_terms: [query],
        review_text: textOnly(card)
      }, card));
    }
  }
  save(source, jobs, {
    completeness: "partial",
    scope_kind: "query",
    fetched_rows: fetched,
    requests,
    limits: ["Search pages are unpaginated HTML and provider UI totals may exceed exposed listing anchors", "Korea payroll eligibility is unknown"]
  });
}

async function collectLinkedIn() {
  const source = "linkedin";
  const entry = entries.get(source);
  const jobs = [];
  const requests = [];
  let fetched = 0;
  for (const query of entry.queries) {
    for (let start = 0; start < 60; start += 10) {
      const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
      for (const [key, value] of Object.entries({ keywords: query, location: "South Korea", start: String(start) })) url.searchParams.set(key, value);
      const { response, text } = await request(url, { headers: { referer: "https://www.linkedin.com/jobs/search" } });
      if (!response.ok) { requests.push({ query, start, status: response.status, count: 0 }); break; }
      const cards = [...text.matchAll(/<li>[\s\S]*?<\/li>/gi)].map(match => match[0]);
      requests.push({ query, start, status: response.status, count: cards.length });
      fetched += cards.length;
      for (const card of cards) {
        const sourceId = card.match(/jobPosting:(\d+)/)?.[1] || card.match(/\/jobs\/view\/(\d+)/)?.[1];
        const title = textOnly(card.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
        const company = textOnly(card.match(/base-search-card__subtitle[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
        if (!sourceId || !title || !company) continue;
        const location = textOnly(card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
        const postedAt = card.match(/datetime="([^"]+)"/)?.[1] || null;
        jobs.push(rawJob(source, sourceId, company, title, `https://www.linkedin.com/jobs/view/${sourceId}`, {
          location: location || null,
          status: "public_card_visible_unverified",
          posted_at: postedAt,
          match_terms: [query],
          review_text: textOnly(card)
        }, card));
      }
      if (!cards.length) break;
    }
  }
  save(source, jobs, {
    completeness: "partial",
    fetched_rows: fetched,
    requests,
    limits: ["Public guest search is capped at 60 cards per declared query", "Card visibility does not prove final ATS status"]
  });
}

async function collectJobKorea() {
  const source = "jobkorea";
  const entry = entries.get(source);
  const jobs = [];
  const requests = [];
  let fetched = 0;
  for (const query of entry.queries) {
    const url = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(query)}`;
    const { response, text } = await request(url, { headers: { referer: "https://www.jobkorea.co.kr/" } });
    if (!response.ok) { requests.push({ query, status: response.status, count: 0 }); continue; }
    const cards = text.split('data-sentry-component="CardJob"').slice(1);
    requests.push({ query, status: response.status, count: cards.length });
    fetched += cards.length;
    for (const card of cards) {
      const sourceId = card.match(/\/Recruit\/GI_Read\/(\d+)/)?.[1];
      const title = textOnly(card.match(/data-sentry-component="Title"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1]);
      const company = textOnly(card.match(/text-gray700 text-typo-b2-16[^>]*>([\s\S]*?)<\/span>/)?.[1]);
      if (!sourceId || !title || !company) continue;
      const [careerMin, careerMax] = parseCareer(textOnly(card));
      jobs.push(rawJob(source, sourceId, company, title, `https://www.jobkorea.co.kr/Recruit/GI_Read/${sourceId}`, {
        career_min: careerMin,
        career_max: careerMax,
        status: "active_search_result",
        match_terms: [query],
        review_text: textOnly(card).slice(0, 4_000)
      }, card));
    }
  }
  save(source, jobs, {
    completeness: "partial",
    fetched_rows: fetched,
    requests,
    limits: ["Only the server-rendered first search page per declared query was recovered", "Detail status and full pagination remain unverified"]
  });
}

async function collectIncruit() {
  const source = "incruit";
  const entry = entries.get(source);
  const jobs = [];
  const requests = [];
  let fetched = 0;
  for (const query of entry.queries) {
    const url = `https://search.incruit.com/list/search.asp?col=job&kw=${encodeURIComponent(query)}`;
    const { response, text } = await request(url);
    const cards = [...text.matchAll(/<a[^>]+href="([^"]*jobdb_info\/jobpost\.asp\?job=([^"&]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
    requests.push({ query, status: response.status, count: cards.length });
    fetched += cards.length;
    for (const card of cards) {
      const title = textOnly(card[3]);
      if (!title) continue;
      const href = new URL(decode(card[1]), "https://job.incruit.com").href;
      jobs.push(rawJob(source, card[2], "UNKNOWN", title, href, {
        status: "public_search_visible",
        match_terms: [query],
        review_text: title
      }, card[0]));
    }
  }
  save(source, jobs, {
    completeness: jobs.length ? "partial" : "failed",
    fetched_rows: fetched,
    requests,
    limits: jobs.length ? ["First public search page only; company fields may be absent"] : ["Current public search HTML exposed no parseable job rows"]
  });
}

const officialTargetsFile = path.resolve(String(args["official-targets"] || path.join(runDir, "official-targets.json")));
const officialTargets = fs.existsSync(officialTargetsFile) ? readJSON(officialTargetsFile) : { jobs: [] };
if (!Array.isArray(officialTargets.jobs)) throw new Error(`${officialTargetsFile}: expected jobs[]`);
const allowedOfficialFields = new Set(["company", "title", "url", "location", "career_min", "career_max", "employment"]);
for (const [index, job] of officialTargets.jobs.entries()) {
  if (!job || !job.company || !job.title || !job.url || Object.keys(job).some(key => !allowedOfficialFields.has(key))) throw new Error(`${officialTargetsFile}: jobs[${index}] has missing or unsupported fields`);
  validatePublicUrl(job.url);
}
const officialJobs = officialTargets.jobs.map(job => [
      job.company,
      job.title,
      job.url,
      job.location || null,
      job.career_min ?? null,
      job.career_max ?? null,
      job.employment || null
    ]);

async function collectOfficialATS() {
  const source = "official_ats";
  const jobs = [];
  const requests = [];
  const inputs = entries.get(source).expected_inputs.map(input => ({ ...input, captured_at: capturedAt }));
  let failed = 0;
  for (const [company, title, url, location, careerMin, careerMax, employment] of officialJobs) {
    const { response, text } = await request(url);
    const visible = response.ok && (text.toLowerCase().includes(title.toLowerCase().slice(0, 16)) || textOnly(text).toLowerCase().includes(title.toLowerCase().slice(0, 16)));
    requests.push({ url, status: response.status, title_visible: visible });
    inputs.push({ kind: "public_search", uri: url, captured_at: capturedAt });
    if (!visible) { failed += 1; continue; }
    const closed = /job posting closed|채용공고 마감됨|no longer available|position has been filled/i.test(text);
    jobs.push(rawJob(source, `url:${hashValue(url)}`, company, title, url, {
      location,
      career_min: careerMin,
      career_max: careerMax,
      employment,
      status: closed ? "closed" : "public_official_page_visible",
      match_terms: entries.get(source).queries,
      review_text: textOnly(text).slice(0, 12_000),
      evidence_level: "official_detail"
    }, text));
  }
  save(source, jobs, {
    completeness: "partial",
    scope_kind: "query",
    fetched_rows: officialJobs.length,
    invalid_rows: failed,
    requests,
    inputs,
    limits: officialJobs.length
      ? [`Named official surfaces only; ${failed} of ${officialJobs.length} did not expose a parseable title`]
      : ["No owner-declared official targets were supplied"]
  });
}

async function collectPeoplenjob() {
  const source = "peoplenjob";
  const url = entries.get(source).expected_inputs[0].uri;
  const { response, text } = await request(url);
  if (!response.ok) return terminal(source, "blocked", `HTTP ${response.status}`, { status: response.status });
  const jobs = [];
  const anchors = [...text.matchAll(/<a[^>]+href="([^"]*\/jobs\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const anchor of anchors) {
    const title = textOnly(anchor[3]);
    if (!title) continue;
    jobs.push(rawJob(source, anchor[2], "UNKNOWN", title, new URL(decode(anchor[1]), "https://www.peoplenjob.com").href, {
      status: "public_first_page_visible",
      match_terms: ["AI"],
      review_text: title
    }, anchor[0]));
  }
  save(source, jobs, {
    completeness: "partial",
    fetched_rows: anchors.length,
    requests: [{ status: response.status, anchors: anchors.length }],
    limits: ["Only publicly exposed first-page and featured rows; company and full pagination are not verified"]
  });
}

async function attemptUnsupported(source, blockedStatuses = [401, 403, 429]) {
  const entry = entries.get(source);
  const expected = entry.expected_inputs[0];
  try {
    const { response, text } = await request(expected.uri);
    const blocked = blockedStatuses.includes(response.status);
    terminal(source, blocked ? "blocked" : "failed", blocked
      ? `HTTP ${response.status} access control prevented collection`
      : `HTTP ${response.status}; current producer has no verified parser for ${text.length} response bytes`,
    { status: response.status, bytes: text.length });
  } catch (error) {
    terminal(source, "failed", `request failed: ${error.message}`, { error: error.message });
  }
}

validateAdapterContract();
const collectors = { groupby: collectGroupby, career: collectCareer, remoteok: collectRemoteOK, weworkremotely: collectWWR, linkedin: collectLinkedIn, jobkorea: collectJobKorea, incruit: collectIncruit, official_ats: collectOfficialATS, peoplenjob: collectPeoplenjob };
for (const source of EXTENDED_ADAPTERS.filter(selected)) await collectors[source]();
for (const source of PROBE_ONLY.filter(selected)) await attemptUnsupported(source);

for (const source of AUTHENTICATED_HANDOFF.filter(selected)) if (entries.has(source) && !fs.existsSync(path.join(runDir, entries.get(source).output_path))) {
  terminal(source, "blocked", "Authenticated personalized collection requires an owner-controlled browser session; no browser collection was performed", { mode: "main_browser_required" });
}

console.log(JSON.stringify({ captured_at: capturedAt, completed: fs.readdirSync(path.join(runDir, "raw")).filter(name => name.endsWith(".json")).sort() }, null, 2));
