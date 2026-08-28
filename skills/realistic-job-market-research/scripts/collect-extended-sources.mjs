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
  sha256,
  unique,
  validateLedger,
  writeJSON
} from "./common.mjs";
import { matchesDomain, safeRequest, validatePublicUrl } from "./safe-http.mjs";
import {
  decodeHTML as decode,
  parseCareer,
  parseGojobsRows,
  parseJobAlioRows,
  parseNstRows,
  parseRssItems,
  parseSeoulJobsRows,
  parseSeoulPublicRows,
  parseSitemap,
  parseWork24Rows,
  textOnly,
  titleFromJobUrl
} from "./source-parsers.mjs";
import { AUTHENTICATED_HANDOFF, EXTENDED_ADAPTERS, validateAdapterContract } from "./adapter-contract.mjs";

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
const maxPages = Number(args["max-pages"] || 1_000);
if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("--max-pages must be an integer >= 1");

const request = (url, options = {}) => safeRequest(url, options);

async function requestJSON(url, options = {}) {
  const { response, text, finalUrl } = await request(url, options);
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return { response, payload: JSON.parse(text), text, finalUrl };
}

function addJob(map, job) {
  const previous = map.get(job.source_id);
  if (previous) previous.match_terms = unique([...(previous.match_terms || []), ...(job.match_terms || [])]);
  else map.set(job.source_id, job);
}

const postForm = params => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
  body: new URLSearchParams(params).toString()
});
const JOB_GG_HEADERS = { accept: "*/*", "user-agent": "curl/8.7.1 realistic-job-market-research/1.2" };

function rawJob(source, sourceId, company, title, url, fields = {}, payload = fields) {
  return {
    source,
    source_id: String(sourceId),
    company: company || "UNKNOWN",
    title: title || "UNKNOWN",
    url,
    captured_at: fields.captured_at || capturedAt,
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
  let limited = false;
  for (const query of entry.queries) {
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, maxPages); page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      url.searchParams.set("keyword", query);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", "10");
      let response, text;
      try {
        ({ response, text } = await request(url, { maxBytes: 20 * 1024 * 1024 }));
      } catch (error) {
        requests.push({ query, page, error: error.message });
        limited = true;
        break;
      }
      if (!response.ok) throw new Error(`career ${query}: HTTP ${response.status}`);
      const payload = JSON.parse(text);
      const rows = payload.list || [];
      const total = Number(payload.Total || rows.length);
      pages = Math.max(1, Math.ceil(total / 10));
      requests.push({ query, page, reported_total: total, count: rows.length, pages });
      fetched += rows.length;
      for (const row of rows) {
        const [careerMin, careerMax] = parseCareer(row.career_name);
        jobs.push(rawJob(source, row.regno, row.company_name, textOnly(row.subject), `https://job.career.co.kr/recruit/view/${row.regno}`, {
          location: [row.area_name, row.area_name2].filter(Boolean).join(" ") || null,
          career_min: careerMin,
          career_max: careerMax,
          employment: row.work_type_name || null,
          deadline: row.register_end_date || row.apply_end_dateString || null,
          status: "active_search_result",
          posted_at: row.register_date || null,
          match_terms: [query],
          review_text: [row.school_name, row.career_name, row.jc_code_nm, textOnly(row.content)].filter(Boolean).join(" · "),
          source_fields: { company_id: row.company_id || null, apply_end: row.apply_end ?? null }
        }, row));
      }
      if (!rows.length) break;
    }
    limited ||= pages > maxPages;
  }
  save(source, jobs, {
    completeness: limited ? "partial" : "complete_query",
    fetched_rows: fetched,
    requests,
    limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : []
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
  const { response, text } = await request(entry.expected_inputs[0].uri, { headers: { accept: "application/rss+xml,application/xml,text/xml" } });
  if (!response.ok) return terminal(source, response.status === 403 ? "blocked" : "failed", `HTTP ${response.status}`, { status: response.status });
  const items = parseRssItems(text);
  const jobs = items.filter(item => entry.queries.some(query => `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(query.toLowerCase()))).map(item => {
    const [company, ...titleParts] = item.title.split(":");
    const title = titleParts.join(":").trim() || item.title;
    return rawJob(source, item.link, titleParts.length ? company.trim() : "UNKNOWN", title, item.link, {
      location: item.region || "Remote",
      employment: item.employment || null,
      posted_at: item.posted_at || null,
      status: "active_public_feed",
      match_terms: entry.queries.filter(query => `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(query.toLowerCase())),
      review_text: item.description
    }, item);
  });
  save(source, jobs, {
    completeness: "partial",
    scope_kind: "feed",
    fetched_rows: jobs.length,
    requests: [{ status: response.status, feed_items: items.length, matched: jobs.length }],
    limits: ["Public RSS is a recent feed, not the full historical search surface", "Korea payroll eligibility is unknown"]
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

async function collectCatch() {
  const source = "catch";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let total = null;
    let fetched = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      for (const [key, value] of Object.entries({ curpage: page, pageSize: 100, onRecruitYN: "Y", Keyword: query })) url.searchParams.set(key, String(value));
      const { payload } = await requestJSON(url, { headers: { referer: "https://www.catch.co.kr/NCS/RecruitInformation" } });
      const rows = payload?.recruitData || [];
      total ??= Number(payload?.intTotalRecordCount || 0);
      requests.push({ query, page, count: rows.length, reported_total: total });
      fetched += rows.length;
      for (const row of rows) addJob(jobs, rawJob(source, row.RecruitID, row.CompName, row.RecruitTitle, `https://www.catch.co.kr/NCS/RecruitInfoDetails/${row.RecruitID}`, {
        location: row.WorkArea || null,
        employment: row.GubunCode || null,
        deadline: row.ApplyEndDatetime?.slice(0, 10) || null,
        posted_at: row.ApplyStartDatetime?.slice(0, 10) || null,
        status: "active_search_result",
        match_terms: [query, ...(row.Depth || "").split(",").map(value => value.trim()).filter(Boolean)],
        review_text: [row.ExperienceText, row.AssignedTaskNameListString, row.SalaryText].filter(Boolean).join(" · "),
        source_fields: { company_id: row.CompID || null, education_code: row.EduLevelCode || null }
      }, row));
      if (fetched >= total || !rows.length) break;
    }
    if (fetched < total) requests.push({ query, limit: `hit max-pages=${maxPages}`, fetched, reported_total: total });
  }
  const limited = requests.some(item => item.limit);
  save(source, [...jobs.values()], {
    completeness: limited ? "partial" : "complete_query",
    fetched_rows: requests.reduce((sum, item) => sum + (item.count || 0), 0),
    requests,
    limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : []
  });
}

async function collectHimalayas() {
  const source = "himalayas";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  const pageLimit = Math.min(maxPages, 10);
  for (const query of entry.queries) {
    let total = 0;
    for (let page = 1; page <= pageLimit; page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      url.searchParams.set("q", query);
      url.searchParams.set("page", String(page));
      const { payload } = await requestJSON(url);
      const rows = payload.jobs || [];
      total = Number(payload.totalCount || rows.length);
      requests.push({ query, page, count: rows.length, reported_total: total });
      for (const row of rows) {
        const sourceId = row.guid || row.applicationLink;
        if (!sourceId || !row.companyName || !row.title) continue;
        addJob(jobs, rawJob(source, sourceId, row.companyName, row.title, row.applicationLink || row.guid, {
          location: (row.locationRestrictions || []).join(", ") || "Remote",
          employment: row.employmentType || null,
          deadline: row.expiryDate ? new Date(Number(row.expiryDate) * 1_000).toISOString().slice(0, 10) : null,
          posted_at: row.pubDate ? new Date(Number(row.pubDate) * 1_000).toISOString().slice(0, 10) : null,
          status: "active_public_api",
          match_terms: [query, ...(row.categories || []), ...(row.seniority || [])],
          review_text: textOnly(row.description || row.excerpt || ""),
          source_fields: { currency: row.currency || null, salary_min: row.minSalary ?? null, salary_max: row.maxSalary ?? null, attribution: "Himalayas" }
        }, row));
      }
      if (!rows.length || page * Number(payload.limit || 20) >= total) break;
    }
  }
  const capped = requests.some(item => item.page === pageLimit && item.page * 20 < item.reported_total);
  save(source, [...jobs.values()], {
    completeness: "partial",
    fetched_rows: requests.reduce((sum, item) => sum + item.count, 0),
    requests,
    limits: ["Himalayas requires source attribution and backlink", ...(capped ? [`each query is capped at ${pageLimit * 20} API rows`] : []), "Korea payroll eligibility is not established"]
  });
}

async function collectSitemapJobs(source, company, filter) {
  const entry = entries.get(source);
  const { response, text } = await request(entry.expected_inputs[0].uri, { headers: { accept: "application/xml,text/xml" } });
  if (!response.ok) return terminal(source, response.status === 403 ? "blocked" : "failed", `HTTP ${response.status}`, { status: response.status });
  const all = parseSitemap(text);
  const matched = all.filter(item => filter(decodeURIComponent(item.url)));
  const jobs = matched.map(item => {
    const sourceId = item.url.match(/(\d{6,})(?:-[^/]*)?(?:\.html)?$/)?.[1] || `url:${hashValue(item.url)}`;
    return rawJob(source, sourceId, company, titleFromJobUrl(item.url), item.url, {
      posted_at: item.lastmod,
      status: "public_sitemap_visible",
      match_terms: entries.get(source).queries,
      review_text: titleFromJobUrl(item.url),
      evidence_level: "source_sitemap"
    }, item);
  });
  save(source, jobs, {
    completeness: "partial",
    scope_kind: "public_surface",
    fetched_rows: matched.length,
    requests: [{ urls: all.length, matched: matched.length }],
    limits: ["Sitemap title and freshness only; employer identity and current detail status require review"]
  });
}

const aiUrl = value => /(?:^|[^a-z])(ai|llm|rag|agent|machine[- ]?learning|deep[- ]?learning|data[- ]?(?:scientist|engineer|analyst)|인공지능|머신러닝|딥러닝)(?:[^a-z]|$)/i.test(value);
const collectRobertWalters = () => collectSitemapJobs("robert_walters", "Robert Walters Korea", aiUrl);
const collectJacKorea = () => collectSitemapJobs("jac_korea", "JAC Recruitment Korea", value => value.includes("/en/job/") && aiUrl(value));

async function collectWork24() {
  const source = "work24";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let total = null;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = { pageIndex: page, resultCnt: 100, sortOrderBy: "DESC", sortField: "DATE", siteClcd: "all", empTpGbcd: "1", srcKeyword: query, keywordWantedTitle: "Y" };
      const { response, text } = await request(entry.expected_inputs[0].uri, postForm(body));
      if (!response.ok) throw new Error(`work24 ${query}: HTTP ${response.status}`);
      total ??= Number(text.match(/totalRecordCount\s*:\s*(\d+)/)?.[1] || 0);
      const rows = parseWork24Rows(text);
      requests.push({ query, page, count: rows.length, reported_total: total });
      for (const row of rows) addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { status: "active_search_result", match_terms: [query], review_text: row.review_text }, row));
      if (!rows.length || page * 100 >= total) break;
    }
  }
  const limited = requests.some(item => item.page === maxPages && item.page * 100 < item.reported_total);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

async function collectJobAlio() {
  const source = "job_alio";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  let limited = false;
  for (const query of entry.queries) {
    let lastPageCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      for (const [key, value] of Object.entries({ search_type: "title", keyword: query, ing: "2", pageNo: page, pageSet: 50 })) url.searchParams.set(key, String(value));
      const { response, text } = await request(url);
      if (!response.ok) throw new Error(`job_alio ${query}: HTTP ${response.status}`);
      const rows = parseJobAlioRows(text);
      lastPageCount = rows.length;
      requests.push({ query, page, count: rows.length });
      for (const row of rows) addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { location: row.location, employment: row.employment, deadline: row.deadline, posted_at: row.posted_at, status: row.status, match_terms: [query], review_text: [row.location, row.employment, row.status].filter(Boolean).join(" · ") }, row));
      if (rows.length < 50) break;
    }
    limited ||= lastPageCount === 50;
  }
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

async function collectGojobs() {
  const source = "gojobs";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, maxPages); page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      for (const [key, value] of Object.entries({ menuNo: 401, selMenuNo: 400, searchJobsecode: "020", searchKeyword: query, pageIndex: page })) url.searchParams.set(key, String(value));
      const { response, text } = await request(url);
      if (!response.ok) throw new Error(`gojobs ${query}: HTTP ${response.status}`);
      pages = Math.max(...[...text.matchAll(/fn_egov_link_page\((\d+)\)/g)].map(match => Number(match[1])), 1);
      const rows = parseGojobsRows(text);
      requests.push({ query, page, count: rows.length, pages });
      for (const row of rows) addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { deadline: row.deadline, posted_at: row.posted_at, status: "public_notice_visible", match_terms: [query], review_text: [row.company, row.posted_at, row.deadline].filter(Boolean).join(" · ") }, row));
      if (!rows.length) break;
    }
  }
  const limited = requests.some(item => item.page === maxPages && item.page < item.pages);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

async function collectNstBoard(source, { bbsNo, key, company }) {
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  let limited = false;
  for (const query of entry.queries.length ? entry.queries : [""]) {
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, maxPages); page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      url.searchParams.set("pageIndex", String(page));
      url.searchParams.set("searchCnd", "SJ");
      if (query) url.searchParams.set("searchKrwd", query);
      const { response, text } = await request(url);
      if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
      pages = Number(text.match(/\/\s*(\d+)\s*페이지/)?.[1] || 1);
      const rows = parseNstRows(text, { bbsNo, key, defaultCompany: company });
      requests.push({ query, page, count: rows.length, pages });
      for (const row of rows) addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { posted_at: row.posted_at, status: /종료|합격|결과|연기|취소/.test(row.title) ? "notice_nonopening" : "public_notice_visible", match_terms: query ? [query] : [], review_text: row.title }, row));
      if (!rows.length) break;
    }
    limited ||= pages > maxPages;
  }
  save(source, [...jobs.values()], { completeness: limited ? "partial" : (entry.queries.length ? "complete_query" : "complete_surface"), scope_kind: "board", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more board queries hit --max-pages=${maxPages}`] : [] });
}

const collectNst = () => collectNstBoard("nst", { bbsNo: 15, key: 56, company: "국가과학기술연구회" });
const collectOnest = () => collectNstBoard("onest", { bbsNo: 19, key: 61, company: "NST 소관 연구기관" });

async function collectJobaba() {
  const source = "jobaba";
  const entry = entries.get(source);
  const first = await request(entry.expected_inputs[0].uri, { headers: JOB_GG_HEADERS });
  if (!first.response.ok) return terminal(source, "failed", `HTTP ${first.response.status}`, { status: first.response.status });
  const token = first.text.match(/id="CSRFToken"[^>]*value="([^"]+)"/)?.[1];
  const cookieValues = first.response.headers.getSetCookie?.() || [first.response.headers.get("set-cookie")].filter(Boolean);
  const cookie = cookieValues.map(value => value.split(";", 1)[0]).join("; ");
  if (!token) return terminal(source, "failed", "CSRF token missing from public theme page", { status: first.response.status });
  const jobs = new Map();
  const requests = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const options = postForm({ CSRFToken: token, currentPageNo: page, recordCountPerPage: 20, schTxt: "", schClCd: "", gubunCd: 9, exhbType: "A", seq: 122 });
    options.headers = { ...options.headers, ...JOB_GG_HEADERS, cookie };
    const { payload } = await requestJSON("https://job.gg.go.kr/entCntnts/exhb/exhbEntEmpListAjax.do", options);
    const rows = payload.LIST || [];
    total = Number(payload.COUNT || rows.length);
    requests.push({ page, count: rows.length, reported_total: total });
    for (const row of rows) {
      const url = row.jkUrl || row.jkUrlMobile;
      if (!url || !row.giSubject) continue;
      const sourceId = url.match(/GI_Read\/(\d+)/)?.[1] || `url:${hashValue(url)}`;
      addJob(jobs, rawJob(source, sourceId, row.companyName || "UNKNOWN", row.giSubject, url, { location: row.giAreaNm || null, career_min: parseCareer(row.giCareerNm)[0], career_max: parseCareer(row.giCareerNm)[1], employment: row.giEmploymentTypeNm || null, deadline: row.giEndDate || null, status: "theme_listing_visible", match_terms: ["AI·빅데이터", row.giPartNoNm].filter(Boolean), review_text: [row.giPayTermNm, row.giCareerNm, row.giPartNoNm].filter(Boolean).join(" · ") }, row));
    }
    if (!rows.length || page * 20 >= total) break;
  }
  const limited = requests.some(item => item.page === maxPages && item.page * 20 < item.reported_total);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_surface", scope_kind: "category", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`hit --max-pages=${maxPages}`] : [] });
}

async function collectSeoulJobs() {
  const source = "seoul_jobs";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let total = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const { response, text } = await request(entry.expected_inputs[0].uri, postForm({ keyword: query, miv_pageNo: page, miv_pageSize: 200 }));
      if (!response.ok) throw new Error(`seoul_jobs ${query}: HTTP ${response.status}`);
      total ||= Number(text.match(/<div class="all">전체\s*<span>([\d,]+)<\/span>건/)?.[1]?.replace(/,/g, "") || 0);
      const rows = parseSeoulJobsRows(text);
      requests.push({ query, page, count: rows.length, reported_total: total });
      for (const row of rows) {
        const [careerMin, careerMax] = parseCareer(row.career_text);
        addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { location: row.location, career_min: careerMin, career_max: careerMax, deadline: row.deadline, posted_at: row.posted_at, status: "active_search_result", match_terms: [query], review_text: row.career_text || "" }, row));
      }
      if (!rows.length || page * 200 >= total) break;
    }
  }
  const limited = requests.some(item => item.page === maxPages && item.page * 200 < item.reported_total);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

async function collectSeoulPublic() {
  const source = "seoul_public";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, maxPages); page += 1) {
      const url = new URL(entry.expected_inputs[0].uri);
      for (const [key, value] of Object.entries({ bbsNo: 166, srchText: query, srchMore: "Y", cntPerPage: 100, curPage: page })) url.searchParams.set(key, String(value));
      const { response, text } = await request(url);
      if (!response.ok) throw new Error(`seoul_public ${query}: HTTP ${response.status}`);
      pages = Number(text.match(/전체페이지:<\/em>(\d+)/)?.[1] || text.match(/전체페이지:<\/em>\s*(\d+)/)?.[1] || 1);
      const rows = parseSeoulPublicRows(text);
      requests.push({ query, page, count: rows.length, pages });
      for (const row of rows) addJob(jobs, rawJob(source, row.source_id, row.company, row.title, row.url, { deadline: row.deadline, posted_at: row.posted_at, status: "active_public_notice", match_terms: [query], review_text: row.title }, row));
      if (!rows.length) break;
    }
  }
  const limited = requests.some(item => item.page === maxPages && item.page < item.pages);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

async function collectGyeonggiPublic() {
  const source = "gyeonggi_public";
  const entry = entries.get(source);
  const jobs = new Map();
  const requests = [];
  for (const query of entry.queries) {
    let total = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const options = postForm({ srchTxt: query, srchWorkRgnCds: "", srchWorkRgnDtlCds: "", srchRcrutFldCds: "", srchEmpFrCds: "", srchRcrutSeCds: "", srchType: "NEW", currentPageNo: page, fromDetailYn: "N", recordCountPerPage: 16 });
      options.headers = { ...options.headers, ...JOB_GG_HEADERS, referer: "https://job.gg.go.kr/pblcEmpmn/list.do", "x-requested-with": "XMLHttpRequest" };
      const { payload } = await requestJSON(entry.expected_inputs[0].uri, options);
      const rows = payload.PUBLIC_JOB_LIST || [];
      total = Number(payload.PUBLIC_JOB_CNT || rows.length);
      requests.push({ query, page, count: rows.length, reported_total: total });
      for (const row of rows) {
        const url = /^https?:\/\//.test(row.dtlUrl || "") ? row.dtlUrl : `https://job.gg.go.kr/pblcEmpmn/publicJobDetail.do?seq=${row.seq}`;
        addJob(jobs, rawJob(source, row.seq, row.instNm, row.title, url, { location: [row.workRgnCdsNm, row.workRgnDtlCdsNm].filter(Boolean).join(" ") || null, deadline: row.endDt || null, posted_at: row.bgnDt || row.regDt || null, status: row.diffDay >= 0 ? "active_public_notice" : "closed", match_terms: [query, row.rcrutFldCdsNm].filter(Boolean), review_text: [row.rcrutFldCdsNm, row.empFrCdsNm, row.rcrutSeCdsNm].filter(Boolean).join(" · ") }, row));
      }
      if (!rows.length || page * 16 >= total) break;
    }
  }
  const limited = requests.some(item => item.page === maxPages && item.page * 16 < item.reported_total);
  save(source, [...jobs.values()], { completeness: limited ? "partial" : "complete_query", fetched_rows: requests.reduce((sum, item) => sum + item.count, 0), requests, limits: limited ? [`one or more queries hit --max-pages=${maxPages}`] : [] });
}

function browserImport(source) {
  const entry = entries.get(source);
  const file = path.join(runDir, "imports", `${source}.json`);
  if (!fs.existsSync(file)) return terminal(source, "blocked", `Browser export required at ${file}`, { mode: "browser_export_required" });
  const payload = readJSON(file);
  const browserCapturedAt = String(payload.captured_at || "");
  if (payload.schema_version !== 1 || payload.source !== source || !Array.isArray(payload.jobs) || !Number.isFinite(Date.parse(browserCapturedAt)) || Date.parse(browserCapturedAt) > Date.now() + 300_000) throw new Error(`${file}: invalid browser export envelope`);
  const domains = { jobplanet: "jobplanet.co.kr", rocketpunch: "rocketpunch.com", remember: "rememberapp.co.kr" };
  const allowed = new Set(["source_id", "company", "title", "url", "location", "career_min", "career_max", "employment", "deadline", "posted_at", "status", "match_terms", "review_text"]);
  const jobs = payload.jobs.map((row, index) => {
    if (!row || Object.keys(row).some(key => !allowed.has(key)) || !row.source_id || !row.company || !row.title || !row.url) throw new Error(`${file}: jobs[${index}] is invalid`);
    const url = validatePublicUrl(row.url);
    if (!matchesDomain(url.hostname, domains[source])) throw new Error(`${file}: jobs[${index}] URL host does not match ${domains[source]}`);
    return rawJob(source, row.source_id, row.company, row.title, url.href, { ...row, captured_at: browserCapturedAt, status: row.status || "browser_verified", evidence_level: "browser_detail" }, row);
  });
  save(source, jobs, {
    completeness: "partial",
    scope_kind: "query",
    fetched_rows: jobs.length,
    requests: [{ mode: "owner_browser_export", jobs: jobs.length }],
    inputs: [...entry.expected_inputs.map(input => ({ ...input, captured_at: browserCapturedAt })), { kind: "imported_snapshot", uri: file, captured_at: browserCapturedAt, sha256: sha256(file), bytes: fs.statSync(file).size }],
    limits: ["Browser-visible declared queries only; login and challenge controls were not bypassed"]
  });
}

validateAdapterContract();
const collectors = {
  groupby: collectGroupby,
  career: collectCareer,
  remoteok: collectRemoteOK,
  weworkremotely: collectWWR,
  linkedin: collectLinkedIn,
  jobkorea: collectJobKorea,
  incruit: collectIncruit,
  official_ats: collectOfficialATS,
  peoplenjob: collectPeoplenjob,
  catch: collectCatch,
  himalayas: collectHimalayas,
  robert_walters: collectRobertWalters,
  jac_korea: collectJacKorea,
  work24: collectWork24,
  job_alio: collectJobAlio,
  gojobs: collectGojobs,
  nst: collectNst,
  onest: collectOnest,
  jobaba: collectJobaba,
  seoul_jobs: collectSeoulJobs,
  seoul_public: collectSeoulPublic,
  gyeonggi_public: collectGyeonggiPublic
};
for (const source of EXTENDED_ADAPTERS.filter(selected)) {
  try {
    await collectors[source]();
  } catch (error) {
    const file = path.join(runDir, entries.get(source).output_path);
    if (fs.existsSync(file)) throw error;
    terminal(source, "failed", `collector failed: ${error.message}`, { error: error.message });
  }
}

for (const source of AUTHENTICATED_HANDOFF.filter(selected)) if (entries.has(source) && !fs.existsSync(path.join(runDir, entries.get(source).output_path))) {
  browserImport(source);
}

console.log(JSON.stringify({ captured_at: capturedAt, completed: fs.readdirSync(path.join(runDir, "raw")).filter(name => name.endsWith(".json")).sort() }, null, 2));
