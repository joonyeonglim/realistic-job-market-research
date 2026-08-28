# Remediation Audit — 2026-08-28

## Verdict

**READY for the declared v1.1 contract: 13 implemented collectors, 15 access probes, and one authenticated handoff.**

**HOLD** for four broader claims that the repository cannot honestly make:

1. all 29 registered sources produced collected postings;
2. current terms or redistribution rights are approved for every source;
3. the matching score predicts application, interview, or offer probability;
4. the external `skills` CLI updates an installed skill atomically.

The public promise, machine registry, runtime, examples, README, plugin manifest, and audit output now use the same capability boundary. A probe is an access attempt, not a parser and not a recovered posting.

## Measured contract

| Measure | Current result | Source of truth |
|---|---:|---|
| Registered sources | 29 | `assets/source-registry.json` |
| Implemented collectors/parsers | 13 | `adapter_inventory.implemented` + dispatch self-test |
| Access probes | 15 | `adapter_inventory.probe_only` |
| Authenticated handoff | 1 | `adapter_inventory.authenticated_handoff` |
| Ledger audit gates | 14 | `scripts/audit-run.mjs` |
| Dashboard audit gates | 8 | `scripts/audit-run.mjs` |
| Public synthetic rows | 13 | one rights-safe row per implemented adapter |
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

## Remediation status

### P0 — truth, privacy, network, QA, and distribution

| Original gap | Status | Implemented boundary |
|---|---|---|
| 29-source promise exceeded implementation | **DONE** | Registry and dispatcher agree on `13 / 15 / 1`; README and manifest expose the split. |
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
| Every source lacked a legally shareable fixture/canary | **RIGHTS HOLD** | Synthetic transformation fixtures and parser self-tests ship. Live/sanitized per-source fixtures wait for current permission and captured rights-safe samples. |
| Network recovery and concurrent writers were unsafe | **DONE FOR CURRENT THROUGHPUT** | Per-host throttle/retry, immutable per-source outputs, partial-state preservation, and exclusive run lock. No distributed lease is claimed. |
| Registry was hard-coded to exactly 29 | **DONE** | Unique semantic registry validation replaces the magic count; current count is derived. |
| Score had no outcome validation | **INSTRUMENTATION DONE / EVIDENCE HOLD** | Frozen outcome evaluator refuses calibration claims below 30 outcomes and five positive outcomes. Scores remain decision policy, not probability. |

### P2 — product and public packaging

| Item | Status |
|---|---|
| OpenAI plugin manifest | **DONE** — `.codex-plugin/plugin.json` validates and points to `skills/`. |
| Codex/Claude metadata parity | **DONE** — one canonical `SKILL.md`; icons, brand color, prompt, license, and compatibility are wired. |
| Version and changelog | **DONE** — repository and skill package are `1.1.0`. |
| English entrypoint | **DONE** — `README.en.md`. |
| Runtime install size | **DONE** — documentation imagery lives in root `media/`; only runtime icons install with the skill. |
| Governance files | **DONE** — security, contribution, issue/PR templates, Dependabot, and CODEOWNERS. |
| Public share image | **DONE** — 1280×640 custom repository preview with live Open Graph readback. |
| GitHub Wiki duplication | **REMOVED** — versioned repository documentation is canonical. |
| npm wording | **DONE** — docs state that `npx skills add` invokes the Skills CLI; this repository is not an npm-published runtime package. |

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
| AEO | **IMPLEMENTATION PASS** | The first screen directly states what the skill is, for whom, what it produces, and the `13 / 15 / 1` boundary; formulas, evidence rules, dates, and limitations are adjacent to claims. |
| GEO | **IMPLEMENTATION PASS / PLATFORM BOUNDARY** | GitHub's public route is crawlable under its host policy and exposes server-rendered README text. This repository does not claim control over GitHub WAF or crawler policy. |
| LLMO | **IMPLEMENTATION PASS / OUTCOME UNKNOWN** | Canonical English entity description is synchronized across README, repository metadata, plugin metadata, and skill entrypoint. Model recall is not yet evidence. |
| NEO | **PLATFORM HOLD** | GitHub controls Yeti access, sitemap, canonical, and IndexNow. No Search Advisor property or Naver citation evidence is claimed. |

No `llms.txt` was added. `SKILL.md` is already the maintained agent entrypoint, and duplicating it would create another drift surface. Google explicitly says `llms.txt` is unnecessary for Google Search or its generative AI features.

Search ranking, index inclusion, and AI citation are not guaranteed by implementation. Earliest useful follow-up is 2026-09-11; a comparable 28-day outcome read is 2026-09-25. No hook, cron, or external submission was wired.

## Remaining HOLDs and the evidence that closes each

1. **Source rights:** record current terms, robots check, permitted purpose, rate, retained fields, and redistribution rule for a source. Only then change its `rights_status`.
2. **Probe promotion:** implement the parser, add a rights-safe fixture and drift test, and prove row accounting. Only then move the source from `probe_only` to `implemented` in the registry SSOT.
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
