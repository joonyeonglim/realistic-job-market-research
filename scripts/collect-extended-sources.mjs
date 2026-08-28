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

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: collect-extended-sources.mjs --run-dir RUN [--phase all|SOURCE,...] [--official-targets FILE]");
  process.exit(0);
}
const runDir = requireRunDir(args);
const { plan } = loadSourcePlan(runDir);
const entries = new Map(plan.sources.map(entry => [entry.source, entry]));
const capturedAt = now();
const userAgent = "Mozilla/5.0";
const phases = new Set(String(args.phase || "all").split(",").map(value => value.trim()).filter(Boolean));
const selected = source => phases.has("all") || phases.has(source);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, options = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "user-agent": userAgent, ...(options.headers || {}) },
        signal: AbortSignal.timeout(30_000)
      });
      const text = await response.text();
      return { response, text };
    } catch (error) {
      last = error;
      if (attempt < 2) await sleep(300 * (2 ** attempt));
    }
  }
  throw last;
}

const decode = value => String(value ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[name]);
const textOnly = value => decode(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const parseCareer = value => {
  const text = String(value ?? "");
  const range = text.match(/(\d+)\s*[~–-]\s*(\d+)\s*년/);
  if (range) return [Number(range[1]), Number(range[2])];
  const minimum = text.match(/(?:경력\s*)?(\d+)\s*년\s*(?:이상|↑|\+)/);
  if (minimum) return [Number(minimum[1]), null];
  const maximum = text.match(/(?:경력\s*)?(\d+)\s*년\s*(?:이하|↓)/);
  if (maximum) return [0, Number(maximum[1])];
  return [null, null];
};

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

const fallbackOfficialJobs = [
  ["OpenAI", "Applied AI Engineer", "https://jobs.ashbyhq.com/openai/04435c05-7a05-4802-894d-c173327fbac8/", "Seoul", null, null, "Full-time"],
  ["FuriosaAI", "Software Engineer, Agent System Developer", "https://jobs.ashbyhq.com/furiosa-ai/962c5ed8-fe86-4873-983a-32c5b0323d5d/", "Seoul", null, null, "Full-time"],
  ["FuriosaAI", "Software Engineer, AI Application", "https://furiosa.ai/career/software-engineer-ai-application-4005374201?gh_jid=4005374201", "Seoul", null, null, "Full-time"],
  ["FriendliAI", "Software Engineer – AI Agents", "https://friendli.ai/careers", "Seoul", 3, null, "Full-time"],
  ["DEEPX", "[SW] AI Agent-Based Workflow Automation Engineer", "https://deepx.career.greetinghr.com/ko/o/166870", "Pangyo", 2, null, "Full-time"],
  ["Channel Corp.", "Applied AI Engineer", "https://jobs.lever.co/zoyi/9ae3038a-70e9-40da-85dd-c7c854bb4527", "Seoul Gangnam", null, null, "Full-time"],
  ["FINDA", "AI Agent 개발자", "https://finda.career.greetinghr.com/ko/o/187418", "Seoul Gangnam", 5, 8, "Full-time"],
  ["Doers", "AI Product Engineer", "https://doers.career.greetinghr.com/ko/o/175322", "Seoul Seocho", 3, null, "Full-time"],
  ["Upstage", "Applied AI Engineer - Agent GYM", "https://careers.upstage.ai/ko/o/194880", "Gyeonggi Yongin", null, null, "Full-time"],
  ["Wrtn Technologies", "Internal Agent Developer", "https://wrtn.career.greetinghr.com/ko/o/158349", "Seoul", 3, null, "Full-time"],
  ["MadUp", "시니어 AI Engineer", "https://recruit.madup.com/22514e4c-e76a-8012-8b5d-f639bdff74ad", "Seoul Gangnam", 5, null, "Full-time"],
  ["Nexon", "[메이플스토리] AI 엔지니어", "https://careers.nexon.com/recruit/9245?jobCategories=1", "Pangyo", null, null, "Full-time"],
  ["BeautySelection", "AI Product Engineer", "https://www.beautyselection.co.kr/job_posting/OklRPHI2", "Seoul Gangnam", null, null, "Full-time"],
  ["IYUNO", "AI Agent Engineer", "https://iyuno.wd3.myworkdayjobs.com/en-US/Careers/job/AI-Agent-Engineer_JR101122", "Seoul Hybrid", null, null, "Full-time"],
  ["Hyundai AutoEver", "[Tech] AI Engineer - AI Agent 엔지니어", "https://career.hyundai-autoever.com/apply", "Seoul Gangnam", 5, null, "Full-time"],
  ["42dot", "Senior AI Agent Engineer (Gleo Interactor)", "https://42dot.ai/en/careers/open-roles/464eb98e-07e6-4cd4-af5d-2d9e9322a3cc", "Pangyo", 8, null, "Full-time"],
  ["Bjak", "Applied AI Engineer", "https://jobs.ashbyhq.com/bjakcareer/efa63933-b5b1-4b41-8b78-a196363833b7", "Korea Remote", null, null, "Full-time"],
  ["Mistral AI", "Applied AI Engineer", "https://jobs.ashbyhq.com/mistral.ai/771c4006-5be5-42b2-b37a-5fee9fd960b4", "Seoul", 2, null, "Full-time"],
  ["Liner", "AX Engineer (Enterprise)", "https://liner.com/ko/careers/jobs", "Seoul", null, null, "Full-time"]
];

const officialTargetsFile = path.resolve(String(args["official-targets"] || path.join(runDir, "official-targets.json")));
const officialTargets = fs.existsSync(officialTargetsFile) ? readJSON(officialTargetsFile) : { jobs: [] };
if (!Array.isArray(officialTargets.jobs)) throw new Error(`${officialTargetsFile}: expected jobs[]`);
const officialJobs = officialTargets.jobs.length
  ? officialTargets.jobs.map(job => [
      job.company,
      job.title,
      job.url,
      job.location || null,
      job.career_min ?? null,
      job.career_max ?? null,
      job.employment || null
    ])
  : fallbackOfficialJobs;

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
    limits: [`Named official surfaces only; ${failed} of ${officialJobs.length} did not expose a parseable title`]
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

if (selected("groupby")) await collectGroupby();
if (selected("career")) await collectCareer();
if (selected("remoteok")) await collectRemoteOK();
if (selected("weworkremotely")) await collectWWR();
if (selected("linkedin")) await collectLinkedIn();
if (selected("jobkorea")) await collectJobKorea();
if (selected("incruit")) await collectIncruit();
if (selected("official_ats")) await collectOfficialATS();
if (selected("peoplenjob")) await collectPeoplenjob();

for (const source of [
  "catch", "himalayas", "robert_walters", "jac_korea", "jobplanet", "rocketpunch",
  "work24", "job_alio", "gojobs", "nst", "onest", "jobaba", "seoul_jobs",
  "seoul_public", "gyeonggi_public"
].filter(selected)) await attemptUnsupported(source);

if (selected("remember") && entries.has("remember") && !fs.existsSync(path.join(runDir, entries.get("remember").output_path))) {
  terminal("remember", "blocked", "Authenticated personalized collection requires an owner-controlled browser session; no browser collection was performed", { mode: "main_browser_required" });
}

console.log(JSON.stringify({ captured_at: capturedAt, completed: fs.readdirSync(path.join(runDir, "raw")).filter(name => name.endsWith(".json")).sort() }, null, 2));
