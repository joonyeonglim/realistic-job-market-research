#!/usr/bin/env node
import assert from "node:assert/strict";
import { decodeHTML, parseCareer, parseSaraminCards, textOnly } from "./source-parsers.mjs";

assert.equal(decodeHTML("A &amp; B"), "A & B");
assert.equal(textOnly("<b> AI&nbsp;Agent </b>"), "AI Agent");
assert.deepEqual(parseCareer("경력 3~7년"), [3, 7]);
assert.deepEqual(parseCareer("5년 이상"), [5, null]);
const html = '<div class="item_recruit" value="123"><strong class="corp_name"><a>Example Co</a></strong><h2 class="job_tit"><a title="AI Agent Engineer"></a></h2><div class="job_condition"><span>서울</span><span>경력3년↑</span><span>대졸</span><span>정규직</span></div><div class="job_sector"><span>Python</span></div><div class="job_date"><span class="date">2030-01-31</span></div></div>';
const parsed = parseSaraminCards(html, "AI", "2030-01-01T00:00:00Z");
assert.equal(parsed.invalid, 0);
assert.deepEqual(parsed.jobs[0], { ...parsed.jobs[0], source_id: "123", company: "Example Co", title: "AI Agent Engineer", career_min: 3, career_max: null, deadline: "2030-01-31" });
console.log("SOURCE_PARSERS_SELF_TEST_PASS");
