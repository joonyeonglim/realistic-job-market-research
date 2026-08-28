# Gap Audit — 2026-08-28

## Verdict

**HOLD for “complete, public-stable v1”; strong internal beta.**

The repository has a valid cross-agent skill, deterministic ledger transformations, explicit failure accounting,
transparent score formulas, and a working Codex/Claude installation. It does not yet deliver all 29 source
adapters, a privacy-safe public workflow, calibrated scoring, independently generated QA evidence, or a protected
release supply chain.

This audit separates what is implemented from what is only declared. It does not treat a documented limitation as
an implemented capability.

## Measured baseline

| Measure | Current result | Meaning |
|---|---:|---|
| Registered sources | 29 | Fixed registry size |
| Implemented collectors/parsers | 13 / 29 (44.8%) | Four core + nine extended adapters |
| No verified parser | 15 / 29 (51.7%) | Only HTTP terminal evidence is written |
| Authenticated browser handoff | 1 / 29 (3.4%) | Remember is not collected by the public CLI |
| Reference-run complete sources | 6 / 29 (20.7%) | `complete_query` or `complete_surface` |
| Reference-run row-producing sources | 12 / 29 (41.4%) | Remaining sources produced zero rows |
| Reference-run reviewed rows | 25 / 29,469 (0.0848%) | 19 candidate + 6 excluded |
| Reference-run unreviewed rows | 29,444 / 29,469 (99.9152%) | Not negative decisions |
| GitHub Actions workflows | 0 | No remote test gate |
| Protected default branch | No | Main can change without a required check |
| Tags / releases | 0 / 0 | Installs track mutable main |
| Agent Skills reference validation | PASS | Frontmatter and layout are valid |
| Fresh Codex + Claude install | PASS | `skills@1.5.23` installs canonical + symlink correctly |
| Node 20 package self-test | PASS | Declared minimum Node version works |

Source counts come from [`assets/source-registry.json`](assets/source-registry.json), the collector dispatch tables,
and [`assets/reference-run-2026-08-28.json`](assets/reference-run-2026-08-28.json).

## Installation error — root cause and current state

Observed warning:

```text
Skipped loading 1 skill(s) due to invalid SKILL.md files.
.../.agents/skills/realistic-job-market-research/SKILL.md: No such file or directory
```

Current installed state is healthy:

- `~/.agents/skills/realistic-job-market-research/SKILL.md` exists and is readable;
- its SHA-256 matches the repository copy;
- the Agent Skills validator passes;
- `~/.claude/skills/realistic-job-market-research` resolves to the canonical directory;
- a clean temporary-home installation for Codex and Claude Code passes.

The warning was an update race, not an invalid manifest. `skills@1.5.23` removes the canonical directory before
recreating and copying it. An active Codex scan can land in that gap. See the exact
[`rm → mkdir`](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/installer.ts#L155-L170)
and subsequent [copy sequence](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/installer.ts#L358-L360).
OpenAI documents `$HOME/.agents/skills` and symlinked skill folders as supported, and recommends restarting Codex
when an update is not detected. Claude Code also supports symlinked skills and live change detection.

Until the installer performs an atomic replacement, update outside an active agent session, verify the installed
file, then start or restart the agent. Do not repeatedly reinstall inside a live session to clear a transient log.

## P0 — required before claiming complete public-stable v1

### P0-1. The 29-source promise exceeds the implemented collection surface

`collect-raw-ledgers.mjs` implements Wanted, Saramin, Jumpit, and Rallit. `collect-extended-sources.mjs` implements
GroupBy, Career, RemoteOK, We Work Remotely, LinkedIn guest, JobKorea, Incruit, named official ATS, and Peoplenjob.
Fifteen registry entries call `attemptUnsupported()`, which records status/bytes but never parses jobs. Remember is
a browser handoff.

Impact: “all declared sources were attempted” is true; “all 29 sources were collected” is false.

Acceptance condition:

- every source is labeled `adapter`, `probe-only`, or `authenticated-handoff` in machine-readable metadata;
- public copy never describes probe-only sources as collected;
- implement and fixture-test the fifteen missing adapters, or reduce the advertised collection set.

### P0-2. A census-only first run requires a private profile and the copyable example is future-dated

`init-run.mjs` always throws when `~/.config/realistic-job-market-research/profile.json` is absent, even though the
runbook describes the profile as optional until review. README says a local profile is required only for personalized
use, then shows a census command that cannot initialize without it.

The copyable profile uses `captured_at: 2030-01-15T00:00:00Z`. Before that date, a later build rejects it as a future
profile. Package tests initialize the run but do not execute the full path that performs this check.

Acceptance condition:

- census mode runs with no profile;
- review/score mode requires one explicitly;
- provide `init-profile` that writes the current timestamp and asks for real values;
- add a clean-`HOME` end-to-end test covering README commands.

### P0-3. Global updates are non-atomic and can temporarily remove `SKILL.md`

This caused the reported error. The repository cannot make an external CLI atomic, but it can stop recommending an
unsafe in-session update and can ship an installation doctor. An upstream issue or patch should replace the current
remove-then-copy sequence with staged copy + atomic pointer swap.

Acceptance condition:

- update instructions explicitly say to leave active Codex/Claude sessions first;
- a doctor verifies canonical file, frontmatter, referenced files, Claude symlink, and installed hash;
- upstream installer issue is tracked until an atomic update exists.

### P0-4. Private-profile leakage controls check key names, not content

The profile validator rejects exact keys such as `email` and `credentials`, but accepts an email, phone number,
token, detailed address, or secret inside any allowed free-text field. It also copies the entire profile, absolute
resume paths, commute anchor, and preference text into each run's `profile.json`.

Impact: a user can accidentally commit or share private profile data while all validators pass.

Acceptance condition:

- typed allowlist for every profile field;
- secret/PII content scanner for strings and URLs;
- private run directory default outside repositories;
- explicit sanitized-share export that strips absolute paths and personal configuration;
- retention/deletion guidance.

### P0-5. Named official targets create an SSRF and resource-exhaustion boundary

`official-targets.json` accepts arbitrary URLs. The collector follows redirects and reads the entire response into
memory without blocking loopback/private/link-local addresses, limiting response bytes, or checking content type.

Impact: a malicious or mistaken target can probe local/cloud metadata services or exhaust memory.

Acceptance condition:

- allow only HTTP(S) public addresses;
- reject loopback, private, link-local, multicast, and cloud metadata ranges before and after redirects;
- cap redirects and response bytes;
- validate MIME type;
- optionally allowlist recognized ATS hosts, with explicit override for reviewed custom domains.

### P0-6. There is no per-source permission, terms, robots, or retention matrix

The collectors use browser-like user agents, undocumented endpoints, and automated pagination without recording each
site's terms, API permission, robots policy, request ceiling, retention rule, or redistribution boundary. The Korean
Copyright Commission has summarized a case where commercial crawling of job-seeker data infringed database-maker
rights and recommends permission-based/API-first collection with provenance. That case has different facts and does
not decide this tool's legality; it does show that technical access alone is not a sufficient rights analysis.

Impact: technical accessibility is being treated as sufficient authorization.

Acceptance condition:

- source governance table with `allowed / restricted / blocked / legal-review` state;
- terms and robots check date, permitted purpose, rate limit, stored fields, and retention per source;
- API-first collection, descriptive user agent, `Retry-After` handling, and contact path;
- never publish third-party raw bodies under the repository's MIT license.

### P0-7. Mutable main is an executable supply-chain surface with no CI or protection

The skill runs scripts with the agent's full permissions. The public repository has no Actions workflow, no protected
main branch, no tag/release, and no immutable install instruction. Secret scanning and push protection are enabled,
but they do not test behavior.

Acceptance condition:

- CI on Node 20/current and Python 3.10/current;
- Agent Skills reference validation, package tests, lint, security checks, and clean-home install test;
- protected main with required checks;
- versioned release tags and changelog;
- optional commit/tag signing, release checksums, and pinned install examples.

### P0-8. `audit.json` can PASS based on unverified claims in `qa-evidence.json`

`audit-run.mjs` trusts fields such as `checks.self_test.verdict = PASS`, browser timings, console errors, and
reproducibility verdicts. It does not run the checks or bind them to command output, screenshots, browser version,
artifact hashes, or the run manifest. `B5-safety-accessibility` reuses the self-test claim rather than performing an
accessibility check.

Acceptance condition:

- executable QA recorder generates the JSON;
- every check records command, exit code, timestamp, environment, artifact SHA, and raw evidence path;
- browser checks are automated and screenshots/console output are hashed;
- audit rejects hand-authored or schema-invalid evidence.

### P0-9. The advertised 29,469-row reference run is not independently reproducible from the repository

Only summary counts and an identity hash are public. Frozen raw inputs are absent, so a new user cannot run the
documented reference verification command and reproduce the claimed identity hash. This may be appropriate for
copyright/privacy, but then the claim is an author attestation rather than a self-contained public reproduction.

Acceptance condition:

- publish a legally shareable redacted fixture with checksums, or clearly label the private reference run as
  non-reproducible externally;
- keep a full synthetic fixture for public transformation parity;
- make the documented verification command runnable without hidden files.

## P1 — reliability and decision-quality gaps

### P1-1. The score is transparent but not calibrated or validated

The model documents that weights and caps are policy choices, which is correct. It has no criterion-related validity,
outcome backtest, test-retest reliability, inter-rater agreement, or error analysis. OPM distinguishes content/face
validity from predictive validity and recommends reliability/validity evidence for assessment tools.

Required next evidence:

- prospective outcome log: application, response, interview, offer, withdrawal, and reason;
- frozen pre-application score to prevent hindsight tuning;
- calibration and rank-quality report after enough outcomes;
- second-rater agreement on requirement and employer grades.

### P1-2. `Evidence Confidence` measures completeness, not confidence

Any non-`UNVERIFIED` finance grade receives all 10 finance points regardless of source authority, age, conflicts, or
whether the URL supports the stated fact. A verified mismatch can correctly have high coverage, but a weak source can
also receive high “confidence.”

Rename it `Evidence Coverage`, or add separate source-quality, freshness, independence, and conflict dimensions.

### P1-3. Weights were not elicited with swing weighting

The default weights reflect stated preferences but were not derived from the actual best-to-worst range of the
current alternatives. UK MCDA guidance warns against simple “importance” weights and recommends swing weighting plus
consistency and sensitivity checks.

Acceptance condition: a short private weight-elicitation worksheet, recorded answers, normalized weights, and a
versioned reason for changes.

### P1-4. Requirement granularity can change the score without changing the evidence

All mandatory items are averaged equally. One confirmed + one transferable requirement gives a synthetic Match of
`87.038`; splitting the confirmed requirement into three lines while leaving the same transferable requirement gives
`92.5408`. The JD did not become a better fit; only its atomization changed.

Acceptance condition: canonical atomic-requirement rules, requirement criticality/independence fields, duplicate
detection, and a grouping-invariance test.

### P1-5. Schema validators accept evidence structures that violate their own contract

Confirmed identity currently passes with `matched_fields=["domain", "domain"]`, a single irrelevant URL, and empty
finance facts. Exact role duplicates also pass. `finance.as_of` accepts any non-empty string.

Acceptance condition:

- enumerated, distinct 2-of-4 identity fields;
- claim-level evidence objects with source type, capture time, fact, and artifact hash;
- non-empty facts/steps for known grades;
- strict dates and freshness windows;
- unique role identity/URL checks.

### P1-6. Profile score maps can be inverted while validation still passes

The validator accepts `confirmed=0` and `missing=100` because it checks only keys and range. It also accepts arbitrary
axis ordering.

Acceptance condition: enforce monotonic relationships and fixed zero/maximum anchors, or explicitly mark an unsafe
advanced mode.

### P1-7. Ranking eligibility allows mandatory gaps

A role with a mandatory `missing` can be `CONDITIONAL`, receive high evidence coverage, and get a numbered rank.
A role with one unknown mandatory item can remain `PREPARE`, score `74`, and enter the confident ranking.

Decide and document one rule: either ranks are an all-reviewed ordering, or the primary shortlist contains only
`PREPARE` roles with no mandatory unknown/missing. Expose conditional ranks separately.

### P1-8. Hard exclusions and profile policies are manually copied into each review

The scorer does not evaluate profile hard exclusions, maximum hiring effort, finance policy, or commute rules. It
trusts the review's manually supplied `hard_exclusion` and grades.

Acceptance condition: deterministic policy evaluator emits gate decisions from structured profile + reviewed facts,
with manual override recorded separately.

### P1-9. Sensitivity analysis is too narrow

Three hand-authored profiles do not test local weight perturbations, threshold changes, unknown-value policy, or axis
scale choices. A diagnostic 10,000-run ±50% perturbation on the current default weights kept Mobigen first 91.2% of
runs and moved BeautySelection to first 8.8%; this is useful but not yet a package feature or formal uncertainty
analysis.

Acceptance condition: one-at-a-time perturbation, rank ranges, top-N stability, threshold sensitivity, and a machine-
readable robustness summary.

### P1-10. There is no deterministic ledger → review → score pipeline

Census review snapshots and score-review JSON are different contracts. Users must hand-author a large review file;
the full census never automatically becomes an evidence-resolved shortlist.

Acceptance condition: a converter that carries exact source identity/fingerprint into a review queue, refuses
unreviewed facts, and emits score-ready records only after all required gates are resolved.

### P1-11. Company identity, finance, commute, compensation, and process verification remain agent prose

These are strong instructions, but there are no deterministic resolvers, structured capture tools, or current-source
adapters. Two agents can therefore assign different grades from the same pages.

Acceptance condition: structured evidence capture templates, source-priority enforcement, explicit unresolved
conflicts, and repeatable grader examples.

### P1-12. Collector parsers have no source-specific fixtures or drift tests

Package tests exercise ledger/build/dashboard behavior but not every live parser. Several HTML collectors use regular
expressions and undocumented endpoints. A page redesign is detected only during a live run.

Acceptance condition: sanitized response fixtures, parser unit tests, schema-drift alarms, and scheduled read-only
canaries where terms permit them.

### P1-13. Network behavior lacks polite and resilient controls

Retries do not honor `Retry-After`; concurrency and user agent are hard-coded; there is no per-host rate budget,
conditional request, MIME validation, response-size ceiling, or circuit breaker. A source crash loses page progress,
and immutable snapshots force a new run rather than resuming a large source.

Acceptance condition: host policies, bounded bodies, adaptive backoff, checkpoints, and explicit partial recovery.

### P1-14. Multi-agent ownership is documented but not enforced

There is no run lock or source lease. Two writers can race on source-plan state or canonical outputs; PID staging only
protects the final file rename.

Acceptance condition: source lease/lock with owner, start time, heartbeat, and stale-lock recovery.

### P1-15. The registry is documented as extensible but hard-coded to exactly 29

`init-run.mjs` rejects any registry whose length is not exactly 29. Adding or retiring a source therefore violates the
implementation despite the reference saying new channels may be appended.

Acceptance condition: registry semantic version + unique source validation, with no magic count.

### P1-16. Public schemas are prose and Python, not portable schema artifacts

There is no JSON Schema for profile, raw, review, score, QA, manifest, or audit. Other agents and editors cannot
validate without executing repository code.

Acceptance condition: versioned JSON Schema files plus golden valid/invalid fixtures shared by Python and Node tests.

### P1-17. Numeric edge behavior is incompletely specified

Python's `round()` uses ties-to-even, but the documentation only says “round to one decimal.” NaN handling is also
inconsistent: a NaN weight can pass `validate_weights()` in Python's permissive JSON parser.

Acceptance condition: finite-number checks and an explicit decimal rounding policy with boundary tests.

## P2 — distribution and product-polish gaps

1. **No OpenAI plugin package.** The standalone skill works locally, but OpenAI recommends plugins for reusable
   public distribution and ChatGPT/Work/mobile reach.
2. **Incomplete `agents/openai.yaml`.** Existing image assets are not wired as `icon_small`, `icon_large`, or
   `brand_color`; invocation policy is implicit.
3. **No `license` or `compatibility` frontmatter.** Agent Skills supports both, and this skill has real Node, Python,
   network, and browser requirements.
4. **Version drift.** `package.json` remains `1.0.0` while the score model is `2026-08-v2`; there is no changelog.
5. **Social preview is not configured.** GitHub still serves its generic repository card even though custom PNGs are
   committed.
6. **No English quickstart.** The public README is Korean-only while the trigger description is English.
7. **Heavy install payload.** Roughly 3.9 MiB of images, including a 2.3 MiB source illustration, is copied into every
   installed skill despite not being required at runtime.
8. **No governance files.** Missing `SECURITY.md`, `CONTRIBUTING.md`, issue templates, support policy, and CODEOWNERS.
9. **No platform matrix.** Node 20 passes locally, but browser QA is Mac-specific and Windows/Linux behavior is not
   recorded.
10. **No public release artifact or checksums.** GitHub main is the only distribution source.
11. **Unused GitHub wiki.** Wiki is enabled but empty; documentation belongs in the versioned repository.
12. **“npm installation” needs clarification.** `npx skills add` runs the third-party `skills` CLI; this repository is
    not an npm-published package (`private: true`).

## What is already strong

- Agent Skills reference validator passes and `SKILL.md` stays concise at 59 lines.
- Fresh global installation works for both Codex and Claude Code.
- Raw rows retain source identity, payload hash, content fingerprint, capture time, completeness, and failure limits.
- Blocked/failed sources emit zero fake jobs.
- Review joins require content and profile fingerprints, preventing stale-label inheritance.
- Application effort and offer decisions are separate.
- Score formulas, weights, caps, numerator, denominator, raw score, and sensitivity ranks are visible.
- The dashboard escapes untrusted text, limits links to HTTP(S), and uses `noopener noreferrer`.
- Node 20 package self-test and official Agent Skills validation pass.
- GitHub secret scanning and push protection are enabled.

## Recommended implementation order

### Phase 0 — truth and safety

1. Make census profile-optional and fix the copyable profile bootstrap.
2. Label the registry `13 adapter / 15 probe / 1 authenticated` in code and README.
3. Add SSRF/body/rate controls and the source-rights matrix.
4. Add privacy-safe run defaults and sanitized export.
5. Replace claimed QA verdicts with executable evidence.
6. Add CI, protected main, release tags, and install doctor.

### Phase 1 — decision validity

1. Split Evidence Coverage from source quality/freshness/conflict.
2. Add canonical requirement atomization and structured policy evaluation.
3. Elicit weights with swing weighting and ship robust sensitivity output.
4. Record prospective outcomes and second-rater agreement before calibration claims.

### Phase 2 — collection completeness

1. Implement missing adapters in priority order based on unique candidate yield and legal permission.
2. Add response fixtures and drift canaries for every adapter.
3. Add leases, checkpoints, and bounded retries.

### Phase 3 — public distribution

1. Publish versioned releases and a minimal runtime bundle.
2. Package an OpenAI plugin if ChatGPT/Work distribution is desired.
3. Complete icons, social preview, English quickstart, security policy, and platform matrix.

## External standards used

- [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Agent Skills specification](https://agentskills.io/specification)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills)
- [OPM assessment glossary](https://www.opm.gov/policy-data-oversight/assessment-and-selection/assessment-glossary/)
- [OPM assessment strategy](https://www.opm.gov/policy-data-oversight/assessment-and-selection/assessment-strategy/)
- [UK MCDA swing weighting guidance](https://www.gov.uk/government/publications/green-book-supplementary-guidance-multi-criteria-decision-analysis/use-of-multi-criteria-decision-analysis-in-options-appraisal-of-economic-cases)
- [NIST AI RMF Measure](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [Korean Copyright Commission crawling/database-right case summary](https://www.copyright.or.kr/information-materials/trend/precedents/view.do?brdctsno=50300)
- [Korean Copyright Commission permission-based crawling overview](https://www.copyright.or.kr/information-materials/trend/tmis/view.do?brdctsno=54407)
