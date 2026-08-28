# Source Governance

[`assets/source-governance.json`](../assets/source-governance.json) is the machine-readable control surface. It is not a legal opinion or a grant of permission.

Before live collection:

1. Review the current source terms, robots policy, documented API or public-access conditions, permitted purpose, retention, and redistribution boundary.
2. Keep raw bodies in the private ignored run directory. Do not publish them under this repository's MIT license.
3. Prefer documented APIs and official feeds. Do not bypass login, CAPTCHA, paywalls, or other access controls.
4. Use the identified crawler user agent, bounded response size, public-network-only URL validation, host throttling, and `Retry-After` handling.
5. Pass `--acknowledge-source-policy` only after accepting each run's machine-readable rights state. Himalayas is an attribution-required public API; other sources remain `review_required` unless an override says otherwise.

`implemented` means a tested parser exists. It does not mean the source has granted permission. `authenticated_handoff` requires an owner-controlled browser and explicit action-time authorization; Jobplanet, RocketPunch, and Remember use this path. The registry currently has no probe-only source.

If source terms are unclear or prohibit automation, set the source to blocked and do not collect it. Record the review date and safe alternative before changing `rights_status` in a future policy version.

## 2026-08-28 route review for promoted sources

This table records the technical and robots boundary observed during implementation. It is not legal permission.

| Source | Current route | Enforced boundary |
|---|---|---|
| Catch | public JSON search endpoint | Declared queries and API totals only; no personal matching surface |
| Himalayas | documented public JSON API | Attribution and backlink required; 200 rows/query in this skill |
| Robert Walters Korea | `advert_links.xml` | Sitemap only; robots-disallowed query facets are not called |
| JAC Recruitment Korea | `/job/sitemap.xml` | Sitemap only; robots-disallowed API/query routes are not called |
| Jobplanet | owner browser export | Cloudflare/access controls are not bypassed |
| RocketPunch | owner browser export | `search=yes, ai-train=no, use=reference`; no training use |
| Work24 | public `/wk/` POST search | Declared title queries, bounded pages and bodies |
| JOB-ALIO | public in-progress title search | Listing facts and official detail URLs only |
| 나라일터 | `www.gojobs.go.kr` public board | Correct certificate host; declared title queries only |
| NST | council recruitment board | Declared title queries only |
| ONEST successor | NST institute recruitment board | Retired ONEST hostname is not retried; declared title queries only |
| 잡아바 | current AI-big-data theme page/API | CSRF and session cookie from the public page; no account action |
| Seoul Job Portal | public list paging endpoint | Declared keyword queries only |
| Seoul recruitment notices | official public board | Current-open title queries; each notice's reuse license still governs |
| Gyeonggi public jobs | current public JSON paging endpoint | Declared keyword queries only |
| Remember | owner browser export | Owner handles login; read-only declared searches |
