#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  decodeHTML,
  parseCareer,
  parseGojobsRows,
  parseJobAlioRows,
  parseNstRows,
  parseRssItems,
  parseSaraminCards,
  parseSeoulJobsRows,
  parseSeoulPublicRows,
  parseSitemap,
  parseWork24Rows,
  textOnly,
  titleFromJobUrl
} from "./source-parsers.mjs";

assert.equal(decodeHTML("A &amp; B"), "A & B");
assert.equal(textOnly("<b> AI&nbsp;Agent </b>"), "AI Agent");
assert.deepEqual(parseCareer("경력 3~7년"), [3, 7]);
assert.deepEqual(parseCareer("5년 이상"), [5, null]);
const html = '<div class="item_recruit" value="123"><strong class="corp_name"><a>Example Co</a></strong><h2 class="job_tit"><a title="AI Agent Engineer"></a></h2><div class="job_condition"><span>서울</span><span>경력3년↑</span><span>대졸</span><span>정규직</span></div><div class="job_sector"><span>Python</span></div><div class="job_date"><span class="date">2000-01-31</span></div></div>';
const parsed = parseSaraminCards(html, "AI", "2000-01-01T00:00:00Z");
assert.equal(parsed.invalid, 0);
assert.deepEqual(parsed.jobs[0], { ...parsed.jobs[0], source_id: "123", company: "Example Co", title: "AI Agent Engineer", career_min: 3, career_max: null, deadline: "2000-01-31" });
assert.deepEqual(parseSitemap("<urlset><url><loc>https://example.com/jobs/123-ai-engineer.html</loc><lastmod>2000-01-01</lastmod></url></urlset>"), [{ url: "https://example.com/jobs/123-ai-engineer.html", lastmod: "2000-01-01" }]);
assert.deepEqual(parseRssItems("<rss><channel><item><title>Example Co: AI Engineer</title><link>https://example.com/job/1</link><region>Remote</region><category>Programming</category><type>Full-Time</type><description>AI systems</description></item></channel></rss>"), [{ title: "Example Co: AI Engineer", link: "https://example.com/job/1", region: "Remote", category: "Programming", employment: "Full-Time", posted_at: "", description: "AI systems" }]);
assert.equal(titleFromJobUrl("https://example.com/jobs/123-ai-agent-engineer.html"), "ai agent engineer");
assert.equal(parseWork24Rows('<tr><td><input id="chkboxWantedAuthNo1" value="W1|VALIDATION|Example Co|AI Engineer"></td><td><a href="/wk/detail?wantedAuthNo=W1">AI Engineer</a></td></tr>')[0].company, "Example Co");
assert.deepEqual(parseJobAlioRows('<tr><td><input name="idxs" value="11"></td><td>1</td><td><a href="/recruitview.do?idx=11"/>AI Researcher</a></td><td>Agency</td><td>서울</td><td>정규직</td><td>2000.01.01</td><td>00.01.31 D-1</td><td>진행중</td></tr>')[0], { source_id: "11", title: "AI Researcher", company: "Agency", location: "서울", employment: "정규직", posted_at: "2000-01-01", deadline: "00-01-31", status: "진행중", url: "https://job.alio.go.kr/recruitview.do?idx=11" });
assert.equal(parseGojobsRows('<tr><td>1</td><td><a href="javascript:fn_apmView(\'020\', \'22\')">AI 공고</a></td><td>기관</td><td>2000.01.01</td><td>2000.01.31</td></tr>')[0].company, "기관");
assert.equal(parseNstRows('<tr><td>1</td><td>연구원</td><td><a href="./selectBbsNttView.do?key=61&amp;bbsNo=19&amp;nttNo=33">AI 채용</a></td><td></td><td>2000-01-01</td></tr>', { key: 61, bbsNo: 19, defaultCompany: "NST" })[0].company, "연구원");
assert.equal(parseSeoulPublicRows('<tr><td>1</td><td><a href="javascript:fnTbbsView(\'44\');">AI 채용</a></td><td>AI과</td><td>2000-01-01</td><td>2000-01-31</td></tr>')[0].source_id, "44");
assert.equal(parseSeoulJobsRows('<tr><td class="block">Example Co</td><td><a href="/hmpg/rmim/rsmg/rsmgDetail.do?wantedAuthNo=S1">AI Engineer</a><li>경력조건 : 경력 3년 이상</li></td><td>00-01-01</td><td>00-01-31</td></tr>')[0].title, "AI Engineer");
console.log("SOURCE_PARSERS_SELF_TEST_PASS");
