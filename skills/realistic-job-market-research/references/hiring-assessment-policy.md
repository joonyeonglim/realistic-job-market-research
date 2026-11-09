# Hiring Assessment Policy

Read for every new personalized review, especially requests such as “no coding tests.” Freeze the actual user constraint; this skill does not assume every candidate excludes tests.

## Keep four axes separate

Use `hiring_process.checks` with `coding_test`, `take_home`, `live_coding`, and `reference_check`. Each item contains:

```json
{
  "status": "NOT_LISTED",
  "scope": "exact_role",
  "as_of": "2000-01-15",
  "reason": "Synthetic example: the exact-role process lists interviews but does not address coding tests.",
  "evidence": ["https://example.com/jobs/agent-engineer"]
}
```

| Status | Evidence and meaning |
|---|---|
| `REQUIRED` | The exact current role explicitly requires this assessment. |
| `EXPLICIT_NONE` | The exact current role explicitly waives this assessment. |
| `NOT_LISTED` | The exact current role was read; it does not settle this axis. |
| `UNKNOWN` | Detail unavailable, conflicted, or only general/historical information exists. |

`REQUIRED`, `EXPLICIT_NONE` and `NOT_LISTED` require an actual calendar date, a source URL, a concise evidence basis in `reason`, and `scope: exact_role`. Scope alternatives are `company_general`, `historical`, and `unknown`; these cannot establish a current role's requirement or waiver. For an unobserved axis use `UNKNOWN`, `as_of: UNKNOWN`, an empty evidence array and the specific missing evidence. General FAQs and old interviews can explain risk in `reason`; do not transfer them into a current-role fact.

An “interviews only” flow chart does not necessarily waive hidden tests or an in-interview coding exercise. Read expandable sections, linked process images, and current role-specific notices. Disclose a conflicting general FAQ as unresolved. Store a short permitted excerpt or faithful paraphrase, not full copied pages or private recruiter messages.

## Apply candidate policy before ranking

Optional private profile field `preferences.excluded_hiring_assessments` lists excluded axes. For example, `["coding_test", "take_home", "live_coding"]` expresses three separate exclusions. Use it only when that is the user's actual rule, in a private per-run profile; do not overwrite their global profile by inference.

- An excluded axis marked `REQUIRED` is a hard exclusion: `gates.hard_exclusion: true`, a reason, and `DROP / NO_GO`.
- An excluded axis marked `NOT_LISTED`, `UNKNOWN`, or absent prevents `PREPARE/PASS`. Use `CONDITIONAL / HOLD` unless another reason warrants dropping it.
- `EXPLICIT_NONE` resolves only its own axis. A coding-test waiver says nothing about a take-home assignment or live coding.
- Known effort above `preferences.hiring_effort_max`, or `UNKNOWN` effort, also prevents `PREPARE/PASS`. Preserve a potentially worthwhile high-effort role as conditional; do not treat high technical fit as an automatic policy exception. If the owner changes the policy, freeze a new profile and rescore.

F0 requires explicit absence of all four axes; F1 requires explicit absence of the three test/assignment axes. Where omission makes a low-effort grade unjustified, use `UNKNOWN` rather than guessing. For F2/F3 record the observed steps and remaining uncertainty; a known lower bound does not prove the complete process. Offer `PASS` additionally requires all four axes resolved.

## Current checks and historical replay

The following commands require the four-axis evidence block by default:

```bash
node scripts/python-runner.mjs scripts/validate_review.py /absolute/review.json
node scripts/python-runner.mjs scripts/score_review.py \
  --input /absolute/review.json --profile /absolute/profile.json \
  --output /absolute/scored-review.json
```

Scoring also validates every configured resume source path and SHA-256. Source drift must be reconciled against the career SSOT and a new frozen profile; do not merely replace a hash without re-reading the changed evidence. No configured source files yields `validation.resume_source_check: NO_SOURCES`, which is not candidate-source verification.

Historical schema-v1 files without checks remain readable through `--allow-legacy-review`. Offline replay can use `--skip-source-check`; output explicitly records `NOT_RUN`. Neither flag establishes current no-test status or candidate freshness. Python API callers must request `require_hiring_checks=True` and `check_sources=True` for current evaluation; the defaults preserve historical library callers. The generated review schema describes the current strict form.

Run `python3 scripts/test_review_policy.py` for evidence, policy, source-drift and CLI regressions. These fixtures prove refusal behavior, not hiring outcomes or accuracy of captured sources.
