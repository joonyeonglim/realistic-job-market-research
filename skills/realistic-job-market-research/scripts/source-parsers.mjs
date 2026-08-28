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
