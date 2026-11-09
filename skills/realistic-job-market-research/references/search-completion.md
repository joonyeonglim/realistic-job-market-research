# First-report completion

Internal agent work: the user should not prepare files or learn commands.
This accounts for a bounded observed queue; it does not prove hiring eligibility,
source truth or entire-market recall. Existing census/review ledgers retain their
owners. Preserve raw sources and corrections rather than rewriting history.

For focused searches, save `intake.json` as `{ "items": [{ "id": "provider:ID",
"company": "…", "title": "…", "url": "https://…" }] }` and freeze its SHA256.
The observed intake comes from real source captures, not just the chosen favorites.
Repeated exact ID/URL observations are allowed; fuzzy identity merges are not.

The decision state is a small companion to the cumulative report:

```json
{
  "schema_version": 1,
  "request": "Find jobs worth applying to using my existing region and career constraints",
  "mode": "search",
  "intake_file": "intake.json",
  "intake_sha256": "<SHA256 of the saved intake>",
  "passes": [{ "source": "job board", "family": "region/role query",
    "kind": "feed", "status": "checked", "evidence": ["sources.md"] }],
  "items": [{ "id": "provider:ID", "state": "reviewed",
    "decision": "conditional", "novelty": "new_role",
    "reason": "Useful role with a stated condition", "evidence": ["sources.md"] }],
  "report_file": "REPORT.md",
  "closure": { "status": "complete", "reason": "Observed batch triaged and documented" }
}
```

Use `mode: targeted` for supplied roles/companies or an explicitly narrow check;
it needs no feed or wider pass. Do not select that mode to bypass a broad request.
For each exact intake ID use:

- `reviewed`: decision `prepare` or `conditional`, with reason and saved evidence.
- `excluded`: reason/evidence plus `basis`: `closed`, `out_of_region`,
  `hard_requirement`, `owner_exclusion` or `irrelevant_role`. Topic assignments,
  unknown optional facts and answer length are not exclusion grounds.
- `duplicate`: `duplicate_of` another exact ID, alias evidence and reason; no cycles.
- `blocked`: source evidence, reason and `recovery` describing the bounded
  alternative attempted or why no authorized alternative exists.
- `pending`: unresolved work; do not silently relabel it to close the report.

Every observed intake URL must be traceable in the persistent report, including
excluded/blocked/pending rows. Link `research-state.json` from that report so the
complete decisions and reasons are accessible. Do not use the intake/state itself
as the readable report. The chat may summarize priorities. The record is
available on the first report, not only after the user asks for the rest.

A broad search needs a current listing-feed pass. If useful options are absent
or all are `novelty: known_role`, make a distinct source/query-family discovery
pass (`feed`, `employer_discovery` or `adjacent_roles`) before stopping. Verification
alone is not expansion. `new_role` means new to this ledger, not newly posted.

```text
node <skill-dir>/scripts/check-search-completion.mjs --state <private>/research-state.json
```

The checker rejects dropped IDs, unresolved items claimed complete, invalid
exclusions/duplicate chains, missing evidence files, report omissions and sparse
or repeat-only searches closed without a different discovery pass. `COMPLETE`
means this declared batch is accounted for, not every company was searched.

Real limits can produce `LIMITED`: use `closure.status: limited`, a reason,
`limit_kind: user_requested | source_access | runtime_budget`, and `limit_evidence`
referencing the actual saved request/access/runtime evidence. A self-chosen short
display list or lane quota is not a real limit. Preserve the unresolved queue and
explain scope plainly; do not ask the user to finish agent-side bookkeeping.

On `HOLD`, resolve the named work or record the actual limit. Never fabricate
rows, qualifications or permission. File/JSON checks are structural; better
behavior/cost claims need independent real-task replay.
