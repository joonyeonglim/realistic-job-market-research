# Agent Workflow — Keep the Work Behind the Request

The user supplies a natural-language request, not a workflow configuration.
Select the route yourself. Load its references only when they are needed.

## Context and files

The saved private profile is `~/.config/realistic-job-market-research/profile.json`.
Read [personalization](personalization.md), then validate its referenced career
sources before using candidate claims. Current user instructions override older
preferences. Freeze changed constraints in a private per-run profile; do not
overwrite the global profile by inference.

If a saved profile is absent, look for the selected project's existing resume
or career sources and use only verified facts. Ask one short question only if
an essential fact such as the target role cannot be recovered. Missing optional
pay or work-policy preferences do not prevent public discovery. Do not make the
user create a profile, choose a path, fill a schema or run a command to start.
When structured personalization is needed, the agent prepares a private per-run
profile using [personalization](personalization.md); unresolved facts remain
unknown and must not become candidate strengths.

Use the selected project's existing private research location. If none exists,
use a new owner-only run directory under
`~/.local/state/realistic-job-market-research/runs/YYYY-MM-DD-<scope>/`.
Keep personal evidence outside public repositories. Choose names and paths
without asking the user. Resolve scripts from this skill's absolute directory,
never from the caller's project cwd; Claude may use `${CLAUDE_SKILL_DIR}`.
Python is supplied by `scripts/python-runner.mjs` when needed.

## Focused search or a named role

Start with relevant public channels and exact employer pages. Reuse an existing
ledger for discovery when useful, then recheck selected roles live. Neither a
29-source census nor a dashboard is a prerequisite for an ordinary shortlist.
Describe the actual searched scope; unreviewed rows are not exclusions.

Use [the evidence contract](evidence-contract.md) for role status, mandatory and
preferred requirements, employer identity before finance, current fiscal year,
actual role worksite versus company address, compensation and work policy.
For a company-only question, assess that employer first; do not invent an open role.
Use [hiring assessment policy](hiring-assessment-policy.md) for separate test,
assignment, live-coding and reference evidence. Apply the user's actual effort
ceiling and exclusions. Do not turn all candidates' desire for low effort into
a universal no-test rule.

For promising candidates, match requirements to dated evidence as confirmed,
transferable, missing or unknown, then check [pitfalls](pitfalls.md). Verify the
important unknowns early instead of doing deep finance on every discovered row.
Keep conflicting facts with both sources; never average them. Search snippets,
redirects, login blocks and empty JS shells do not prove a role is active or closed.

Keep application preparation separate from employer/offer acceptance. The internal
states are `PREPARE | CONDITIONAL | DROP` and `PASS | HOLD | NO_GO`; translate them
into ordinary Korean in the answer. Stop expanding the search when the requested
scope and next decision have been addressed; disclose remaining unknowns.

Use numeric scoring when requested or when it materially helps compare candidates.
If scoring is used, follow [the scoring model](scoring-model.md) and
[review schema](review-schema.md), then run `scripts/score_review.py` through the
Python runner with the current input/profile/output paths. Its CLI checks
assessment evidence and configured resume hashes by default. Preserve component
scores, full-precision calculations, weights, caps, evidence coverage/quality and
sensitivity in the artifact. Do not present a naked score or a hiring probability.
Validate any review JSON you produce; the user does not prepare it.
Weight elicitation or outcome-model validation is conditional on an explicit
request: [decision validation](decision-validation.md).

## Refresh a previous result

Locate the previous shortlist or ledger yourself. Compare source IDs, exact
bodies, capture times and profile snapshots; classify genuinely new, reposted,
previously missed, closed and materially changed roles separately. A new URL is
not a new opportunity. Preserve old evidence and add corrections. If no usable
baseline exists, say comparison is unavailable and report current findings;
do not claim they are new. For attaching reviews to raw rows, use
[review workflow](review-workflow.md), never a fuzzy title/company join.

## Full collection, only for that request

Read [census runbook](census-runbook.md), [source registry](source-registry.md),
[source governance](source-governance.md), [raw schema](raw-schema.md) and
[verification gates](verification-gates.md). Current scope is 26 automated adapters and 3 owner-browser handoffs.
The agent selects the immutable run path, reviews source policy, then runs:

```text
node <skill-dir>/scripts/run-census.mjs --run-dir <absolute-private-run> --acknowledge-source-policy
```

Preserve every declared source's terminal attempt, blocked/failed zero-row
evidence, manifest and ledger/dashboard audits. Never replace actual rows with
provider totals or call limited coverage the whole market. Raw collection needs
no candidate profile. Collection alone does not imply a personalized ranking;
if both were requested, continue through the focused review route.
Frozen-run parity: [reproducibility](reproducibility.md).

## Browser and maintenance

For any browser work, use [authenticated sources](authenticated-sources.md) and
the runtime's authorized browser route. The browser agent handles normal sign-in;
the owner handles genuinely missing credentials, OTP, CAPTCHA or OS approval.
Do not make the user perform ordinary browser setup or export work the agent can do.
Never store credentials, private messages, recruiter contacts or confidential data.
External account actions still need their specific authorization.

For installation or upstream updates, read [local maintenance](local-maintenance.md)
so the local revision is not silently overwritten.
