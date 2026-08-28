# Remediation Audit — 2026-08-28

## Verdict

**READY for the declared v1.2 contract: 26 automated collectors and 3 owner-browser handoffs cover all 29 registered sources.**

**HOLD** for four broader claims that the repository cannot honestly make:

1. current terms or redistribution rights are approved for every non-Himalayas source;
2. Jobplanet, RocketPunch, and Remember can be collected without an owner-controlled browser;
3. the matching score predicts application, interview, or offer probability;
4. the external `skills` CLI updates an installed skill atomically.

The public promise, machine registry, runtime, examples, README, plugin manifest, and audit output now use the same capability boundary. The registry has no probe-only source.

## Measured contract

| Measure | Current result | Source of truth |
|---|---:|---|
| Registered sources | 29 | `assets/source-registry.json` |
| Automated collectors/parsers | 26 | `adapter_inventory.implemented` + dispatch self-test |
| Access probes | 0 | `adapter_inventory.probe_only` |
| Owner-browser handoffs | 3 | Jobplanet, RocketPunch, Remember |
| Ledger audit gates | 14 | `scripts/audit-run.mjs` |
| Dashboard audit gates | 8 | `scripts/audit-run.mjs` |
| Public synthetic rows | 26 | one rights-safe row per automated adapter |
| Robustness perturbations | 10,000 | scoring policy `2026-08-v3` |
| Generated input schemas | 3 | profile, review, and QA evidence |
| Private historical replay | 29,469 rows | owner attestation; raw bodies are not redistributed |

The machine-readable owners are:

- capability: [`source-registry.json`](skills/realistic-job-market-research/assets/source-registry.json);
- collection control: [`source-governance.json`](skills/realistic-job-market-research/assets/source-governance.json);
- matching math: [`scoring-policy.default.json`](skills/realistic-job-market-research/assets/scoring-policy.default.json);
- privacy patterns: [`privacy-patterns.json`](skills/realistic-job-market-research/assets/privacy-patterns.json);
- generated schemas: [`schemas/`](skills/realistic-job-market-research/schemas/);
- human explanation: links to those files rather than independent constants.

### Live promotion proof

Current public endpoints were exercised on 2026-08-28 with the repository rate, body, redirect, MIME, and SSRF controls. Counts are observations, not permanent market totals.

| Newly automated source | Rows | Verdict | Boundary |
|---|---:|---|---|
| Catch | 508 | `complete_query` | API-reported totals matched |
| Himalayas | 1,003 | `partial` | 200 rows/query, attribution and backlink required |
| Robert Walters Korea | 5 | `partial` | AI-relevant public sitemap URLs; detail identity still reviewed |
| JAC Recruitment Korea | 1 | `partial` | AI-relevant English public sitemap URLs |
| Work24 | 113 | `complete_query` | declared title queries exhausted |
| JOB-ALIO | 4 | `complete_query` | current in-progress title queries exhausted |
| 나라일터 | 372 | `complete_query` | provider-reported pages exhausted |
| NST council board | 3 | `complete_query` | five title queries exhausted |
| NST institute board / ONEST successor | 0 | `complete_query` | valid zero result, not a failed collector |
| 잡아바 AI-big-data theme | 30 | `complete_surface` | provider-reported theme count matched |
| Seoul Job Portal | 95 | `complete_query` | six keyword queries exhausted |
| Seoul recruitment notices | 1 | `complete_query` | current-open queries exhausted |
| Gyeonggi public jobs | 6 | `complete_query` | provider-reported query counts matched |

Jobplanet, RocketPunch, and Remember are tested `main_chrome` imports. Absence of an owner export yields an explicit zero-row `blocked` artifact rather than a fake success.

The first all-source run exposed two pre-existing adapters: Career exceeded the 10 MiB page limit and WWR search HTML returned 403. The corrected paths recovered Career 141 rows as `complete_query` with 10-row bounded pages and WWR 88 rows as `partial` from its official RSS feed. No access control was bypassed.

Final all-source integration after those fixes: 32,286 rows, 29 attempted, 25 row-producing, 16 complete, 10 partial, 3 owner-browser blocked, and **0 failed**. Ledger and dashboard audits PASS; Chromium loaded the full dashboard in 635 ms, reported zero console errors, and had zero horizontal overflow at 390 px.

## Remediation status

### P0 — truth, privacy, network, QA, and distribution

| Original gap | Status | Implemented boundary |
|---|---|---|
| 29-source promise exceeded implementation | **DONE** | Registry and dispatcher agree on `26 automated / 3 browser`; README and manifest expose the split. |
| Census required a private profile | **DONE** | Raw census is profile-free; `init-profile.mjs` creates current private configuration only for review/score. |
| Installed `SKILL.md` could briefly disappear during update | **MITIGATED** | `doctor.mjs`, clean-install tests, and update-outside-active-session instructions ship. Atomic replacement remains upstream. |
| Free-text profile could leak PII or secrets | **DONE** | Typed allowlists, shared privacy patterns, `0600` files, private run defaults, `.gitignore`, and sanitized export gate. |
| Official target URLs exposed SSRF/body risks | **DONE** | Shared `safe-http.mjs` validates public addresses before and after redirects, MIME, bytes, redirects, rate, and `Retry-After`. |
| Source permission and retention were absent | **CONTROL DONE / RIGHTS HOLD** | Governance SSOT, explicit acknowledgement, private-only raw retention, and no raw redistribution. Every source remains `review_required`. |
| Mutable executable main lacked supply-chain gates | **DONE IN REPOSITORY** | CI matrix, dependency update, CODEOWNERS, changelog, release checksums, and versioned package metadata. Live branch/release state is verified at closeout. |
| Hand-authored QA claims could create false PASS | **DONE** | Playwright recorder binds commands, screenshots, console, environment, manifest, and hashes; audit rejects schema or hash drift. |
| 29,469-row claim was not publicly reproducible | **DONE WITH BOUNDARY** | Public 29-source synthetic fixture is exact and rights-safe; the private historical replay is labeled owner attestation. |

### P1 — decision quality and reliability

| Original gap | Status | Implemented boundary |
|---|---|---|
| Coverage was called confidence | **DONE** | Separate `Evidence Coverage`, `Evidence Quality`, and freshness; old field is compatibility-only. |
| Weights lacked swing elicitation | **TOOLING DONE / OWNER HOLD** | Swing-weight worksheet and deterministic derivation script ship; default weights remain explicitly provisional until owner-confirmed. |
| Requirement splitting inflated Match | **DONE** | Mandatory aggregation is the minimum; duplicate role and identity fields are rejected. |
| Evidence schemas accepted weak identity/finance facts | **DONE** | Distinct 2-of-4 identity, strict dates, facts, steps, evidence, uniqueness, and privacy checks. |
| Score maps could be inverted or non-finite | **DONE** | Monotonic ordering, fixed anchors, finite numbers, and Decimal half-up boundary tests. |
| Mandatory gaps could enter the primary ranking | **DONE** | Only `PREPARE` with no mandatory missing/unknown, sufficient coverage, and usable evidence quality receives rank. |
| Hard exclusions were manually copied | **DONE** | Structured policy flags plus profile finance and hard-exclusion rules derive the gate; reasons remain visible. |
| Sensitivity was three hand-authored profiles only | **DONE** | Named profiles plus 10,000 deterministic perturbations, top frequency, and rank range. |
| Ledger-to-review handoff was manual and lossy | **DONE** | Deterministic queue carries source identity and fingerprint and refuses unresolved facts. |
| Profile/review/QA contracts were prose-only | **DONE FOR AUTHOR INPUTS** | Generated schemas and drift test cover the three author-supplied trust boundaries; generated outputs stay owned by executable builders/auditors rather than duplicate schemas. |
| Source parsers duplicated common decoding | **DONE FOR SHARED PATH** | Common decoding, text normalization, career parsing, and Saramin parsing live in `source-parsers.mjs`. |
| Every source lacked a legally shareable fixture/canary | **DONE FOR STRUCTURE / RIGHTS HOLD FOR RAW** | Source-specific synthetic parser tests ship. Third-party raw bodies remain private. |
| Network recovery and concurrent writers were unsafe | **DONE FOR CURRENT THROUGHPUT** | Per-host throttle/retry, immutable per-source outputs, partial-state preservation, and exclusive run lock. No distributed lease is claimed. |
| Registry was hard-coded to exactly 29 | **DONE** | Unique semantic registry validation replaces the magic count; current count is derived. |
| Score had no outcome validation | **INSTRUMENTATION DONE / EVIDENCE HOLD** | Frozen outcome evaluator refuses calibration claims below 30 outcomes and five positive outcomes. Scores remain decision policy, not probability. |

### P2 — product and public packaging

| Item | Status |
|---|---|
| OpenAI plugin manifest | **DONE** — `.codex-plugin/plugin.json` validates and points to `skills/`. |
| Codex/Claude metadata parity | **DONE** — one canonical `SKILL.md`; icons, brand color, prompt, license, and compatibility are wired. |
| Version and changelog | **DONE** — repository and skill package are `1.2.0`. |
| English entrypoint | **DONE** — `README.en.md`. |
| Runtime install size | **DONE** — documentation imagery lives in root `media/`; only runtime icons install with the skill. |
| Governance files | **DONE** — security, contribution, issue/PR templates, Dependabot, and CODEOWNERS. |
| Public share image | **DONE** — 1280×640 custom repository preview with live Open Graph readback. |
| GitHub Wiki duplication | **REMOVED** — versioned repository documentation is canonical. |
| npm wording | **DONE** — docs state that `npx skills add` invokes the Skills CLI; this repository is not an npm-published runtime package. |

## Runtime bootstrap boundary

- Existing Node.js 20+ users keep the standard `npx skills add` path.
- `install.sh` and `install.ps1` provision the official Node v24 archive in the user cache, verify its SHA-256, and run the same Skills CLI command without changing the system PATH.
- Python commands route through `python-runner.mjs`. It uses an existing Python 3.10+ or installs pinned `uv` plus managed Python 3.12 in the user cache.
- The collectors and score model keep their existing language implementations; runtime automation does not duplicate the scoring formula.

## Installation warning — exact boundary

Observed warning:

```text
Skipped loading 1 skill(s) due to invalid SKILL.md files.
.../.agents/skills/realistic-job-market-research/SKILL.md: No such file or directory
```

The skill manifest itself was valid. The external installer can remove the canonical directory before copying its replacement, and an active agent scan can observe that gap. This repository mitigates the problem but cannot make another CLI atomic.

Safe update sequence:

```bash
# Run in a normal terminal after closing active Codex/Claude sessions.
npx skills update -g realistic-job-market-research -y
node ~/.agents/skills/realistic-job-market-research/scripts/doctor.mjs --global
npx -y skills-ref validate ~/.agents/skills/realistic-job-market-research
```

If the warning persists after that sequence, reinstall once and restart the agent. Do not loop reinstall inside the session reporting the warning.

## SEO · AEO · GEO · LLMO · NEO audit

Target: `https://github.com/joonyeonglim/realistic-job-market-research`

Primary conversion: understand the boundary, then copy the Codex/Claude install command.

Languages: Korean primary README plus English quickstart.

| Lens | Status | Evidence and boundary |
|---|---|---|
| SEO | **IMPLEMENTATION PASS** | Public GitHub route returns 200; repository name, description, topics, first-screen answer, headings, internal links, and share image are aligned. GitHub owns canonical, robots, sitemap, and HTML metadata. |
| AEO | **IMPLEMENTATION PASS** | The first screen directly states what the skill is, for whom, what it produces, and the `26 automated / 3 browser` boundary; formulas, evidence rules, dates, and limitations are adjacent to claims. |
| GEO | **IMPLEMENTATION PASS / PLATFORM BOUNDARY** | GitHub's public route is crawlable under its host policy and exposes server-rendered README text. This repository does not claim control over GitHub WAF or crawler policy. |
| LLMO | **IMPLEMENTATION PASS / OUTCOME UNKNOWN** | Canonical English entity description is synchronized across README, repository metadata, plugin metadata, and skill entrypoint. Model recall is not yet evidence. |
| NEO | **PLATFORM HOLD** | GitHub controls Yeti access, sitemap, canonical, and IndexNow. No Search Advisor property or Naver citation evidence is claimed. |

No `llms.txt` was added. `SKILL.md` is already the maintained agent entrypoint, and duplicating it would create another drift surface. Google explicitly says `llms.txt` is unnecessary for Google Search or its generative AI features.

Search ranking, index inclusion, and AI citation are not guaranteed by implementation. Earliest useful follow-up is 2026-09-11; a comparable 28-day outcome read is 2026-09-25. No hook, cron, or external submission was wired.

## Remaining HOLDs and the evidence that closes each

1. **Source rights:** record current terms, robots check, permitted purpose, rate, retained fields, and redistribution rule for a source. Only then change its `rights_status`.
2. **Browser handoff:** Jobplanet, RocketPunch, and Remember require an owner-controlled browser export. Access controls are never bypassed or relabeled as automated collection.
3. **Owner weights:** complete swing elicitation and version the reason. Until then keep `owner_policy_provisional` visible.
4. **Outcome validity:** collect at least 30 frozen pre-application outcomes with at least five positives, then report discrimination/association and error analysis. Do not convert this to a hiring probability without stronger evidence.
5. **Search outcome:** use actual Search Console/Search Advisor/referral/clickable-source data after the follow-up windows. A one-off `site:` query or model recall is not proof.

## Verification commands

```bash
npm test
npm audit
npx -y skills-ref validate skills/realistic-job-market-research
node skills/realistic-job-market-research/scripts/doctor.mjs
node skills/realistic-job-market-research/scripts/generate-schemas.mjs --check
```

The public synthetic reference is reproducible with:

```bash
npm run reference --workspace realistic-job-market-research-skill
```

## Standards used

- [GitHub topics and repository discovery](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- [Google Search: generative AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [OpenAI publisher and crawler guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Agent Skills specification](https://agentskills.io/specification)
- [OPM assessment strategy](https://www.opm.gov/policy-data-oversight/assessment-and-selection/assessment-strategy/)
- [UK MCDA swing-weighting guidance](https://www.gov.uk/government/publications/green-book-supplementary-guidance-multi-criteria-decision-analysis/use-of-multi-criteria-decision-analysis-in-options-appraisal-of-economic-cases)
- [NIST AI RMF Measure](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
