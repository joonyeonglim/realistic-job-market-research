import { hashValue, parseSaraminCareer } from "./common.mjs";

export const decodeHTML = value => String(value ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[name]);

export const textOnly = value => decodeHTML(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export const parseCareer = value => {
  const text = String(value ?? "");
  const range = text.match(/(\d+)\s*[~–-]\s*(\d+)\s*년/);
  if (range) return [Number(range[1]), Number(range[2])];
  const minimum = text.match(/(?:경력\s*)?(\d+)\s*년\s*(?:이상|↑|\+)/);
  if (minimum) return [Number(minimum[1]), null];
  const maximum = text.match(/(?:경력\s*)?(\d+)\s*년\s*(?:이하|↓)/);
  if (maximum) return [0, Number(maximum[1])];
  return [null, null];
};

export const htmlRows = html => [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
export const htmlCells = row => [...String(row).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => textOnly(match[1]));

export function parseSitemap(xml) {
  return [...String(xml).matchAll(/<url>\s*<loc>([\s\S]*?)<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/gi)]
    .map(match => ({ url: decodeHTML(match[1]).trim(), lastmod: match[2]?.trim() || null }));
}

export function parseRssItems(xml) {
  const field = (item, name) => decodeHTML(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, "i"))?.[1] || "").trim();
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    return {
      title: field(item, "title"),
      link: field(item, "link") || field(item, "guid"),
      region: field(item, "region") || field(item, "country"),
      category: field(item, "category"),
      employment: field(item, "type"),
      posted_at: field(item, "pubDate"),
      description: textOnly(field(item, "description"))
    };
  }).filter(item => item.title && item.link);
}

export function titleFromJobUrl(url) {
  const slug = decodeURIComponent(new URL(url).pathname.split("/").pop() || "")
    .replace(/\.html$/i, "")
    .replace(/^\d+-/, "")
    .replace(/-\d{6,}$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return slug || "UNKNOWN";
}

export function parseWork24Rows(html) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const encoded = row.match(/name="idxs"[^>]*value="([^"]+)"/i)?.[1]
      || row.match(/id="chkboxWantedAuthNo\d+"[^>]*value="([^"]+)"/i)?.[1];
    const href = decodeHTML(row.match(/href="([^"]*wantedAuthNo=[^"]+)"/i)?.[1]);
    if (!encoded || !href) continue;
    const [sourceId, , company, title] = decodeHTML(encoded).split("|");
    if (sourceId && company && title) jobs.push({ source_id: sourceId, company, title: textOnly(title), url: new URL(href, "https://www.work24.go.kr").href, review_text: textOnly(row) });
  }
  return jobs;
}

export function parseJobAlioRows(html) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const sourceId = row.match(/name="idxs"[^>]*value="(\d+)"/i)?.[1];
    const title = textOnly(row.match(/href="\/recruitview\.do\?idx=\d+"[^>]*\/?>([\s\S]*?)<\/a>/i)?.[1]);
    const cells = htmlCells(row);
    if (!sourceId || !title || cells.length < 8) continue;
    jobs.push({ source_id: sourceId, title, company: cells[3] || "UNKNOWN", location: cells[4] || null, employment: cells[5] || null, posted_at: cells[6]?.replace(/\./g, "-") || null, deadline: cells[7]?.match(/\d{2}\.\d{2}\.\d{2}/)?.[0]?.replace(/\./g, "-") || null, status: cells[8] || "unknown", url: `https://job.alio.go.kr/recruitview.do?idx=${sourceId}` });
  }
  return jobs;
}

export function parseGojobsRows(html) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const match = row.match(/<a[^>]+fn_apmView\('([^']+)',\s*'(\d+)'\)[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const title = textOnly(match[3]);
    const cells = htmlCells(row);
    if (!title) continue;
    jobs.push({ source_id: match[2], title, company: cells[2] || "UNKNOWN", posted_at: cells[3]?.replace(/\./g, "-") || null, deadline: cells[4]?.replace(/\./g, "-") || null, url: `https://www.gojobs.go.kr/apmView.do?searchJobsecode=${match[1]}&empmnsn=${match[2]}` });
  }
  return jobs;
}

export function parseNstRows(html, { key, bbsNo, defaultCompany }) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const sourceId = row.match(/nttNo=(\d+)/)?.[1];
    const title = textOnly(row.match(/<a[^>]+nttNo=\d+[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    const cells = htmlCells(row);
    if (!sourceId || !title) continue;
    jobs.push({ source_id: sourceId, title, company: bbsNo === 19 ? (cells[1] || defaultCompany) : defaultCompany, posted_at: cells.at(-1) || null, url: `https://www.nst.re.kr/www/selectBbsNttView.do?key=${key}&bbsNo=${bbsNo}&nttNo=${sourceId}` });
  }
  return jobs;
}

export function parseSeoulPublicRows(html) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const sourceId = row.match(/fnTbbsView\('(\d+)'\)/)?.[1];
    const title = textOnly(row.match(/fnTbbsView\('\d+'\);"[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    const cells = htmlCells(row);
    if (!sourceId || !title || cells.length < 5) continue;
    jobs.push({ source_id: sourceId, title, company: cells[2] || "서울특별시", posted_at: cells[3] || null, deadline: cells[4] || null, url: `https://www.seoul.go.kr/news/news_employ.do?bbsNo=166&nttNo=${sourceId}` });
  }
  return jobs;
}

export function parseSeoulJobsRows(html) {
  const jobs = [];
  for (const row of htmlRows(html)) {
    const sourceId = row.match(/wantedAuthNo=([A-Za-z0-9]+)/)?.[1];
    const href = decodeHTML(row.match(/href="([^"]*wantedAuthNo=[^"]+)"/i)?.[1]);
    const title = textOnly(row.match(/wantedAuthNo=[^>]+>([\s\S]*?)<\/a>/i)?.[1]);
    const cells = htmlCells(row);
    if (!sourceId || !href || !title || cells.length < 4) continue;
    const detail = textOnly(row);
    jobs.push({ source_id: sourceId, title, company: cells[0] || "UNKNOWN", location: detail.match(/\(\d{5}\)\s*([^·]+?)(?=경력조건|등록일|마감일)/)?.[1]?.trim() || null, career_text: detail.match(/경력조건\s*:\s*([^·]+?)(?=등록일|마감일|$)/)?.[1]?.trim() || null, posted_at: cells[2] || null, deadline: cells[3]?.match(/\d{2}-\d{2}-\d{2}/)?.[0] || null, url: new URL(href, "https://job.seoul.go.kr").href });
  }
  return jobs;
}

export function parseSaraminCards(html, query, capturedAt) {
  const parsed = [...String(html).matchAll(/<div class="item_recruit"[\s\S]*?(?=<div class="item_recruit"|$)/g)].map(match => {
    const card = match[0];
    const sourceId = card.match(/<div class="item_recruit"\s+value="(\d+)"/)?.[1];
    const title = decodeHTML(card.match(/<h2 class="job_tit">[\s\S]*?<a[^>]*title="([^"]+)"/)?.[1]);
    const companyBlock = card.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/)?.[1] || "";
    const conditionBlock = card.match(/<div class="job_condition">([\s\S]*?)<\/div>/)?.[1] || "";
    const conditions = [...conditionBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(item => textOnly(item[1]));
    const [careerMin, careerMax] = parseSaraminCareer(conditions[1]);
    const sectorBlock = card.match(/<div class="job_sector">([\s\S]*?)<\/div>/)?.[1] || "";
    const deadlineLabel = textOnly(card.match(/<div class="job_date">[\s\S]*?<span class="date">([\s\S]*?)<\/span>/)?.[1]);
    return {
      source: "saramin",
      source_id: sourceId,
      company: textOnly(companyBlock),
      title,
      url: `https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=${sourceId}`,
      location: conditions[0] || null,
      career_min: careerMin,
      career_max: careerMax,
      career_text: conditions[1] || null,
      education: conditions[2] || null,
      employment: conditions[3] || null,
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadlineLabel) ? deadlineLabel : null,
      status: "active_search_result",
      match_terms: [query],
      filter_stage: "raw",
      exclusion_reason: null,
      sector: textOnly(sectorBlock.replace(/<span class="job_day">[\s\S]*?<\/span>/, "")) || null,
      review_text: [conditions.join(" · "), textOnly(sectorBlock)].filter(Boolean).join(" · "),
      captured_at: capturedAt,
      evidence_level: "source_listing",
      source_payload_hash: hashValue(card),
      source_fields: { deadline_label: deadlineLabel || null }
    };
  });
  return { jobs: parsed.filter(job => job.source_id && job.company && job.title), invalid: parsed.filter(job => !job.source_id || !job.company || !job.title).length };
}
