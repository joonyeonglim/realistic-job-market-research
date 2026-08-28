# Census Runbook

## 1. Run identity

Set one immutable run root: `workbench/job-search/YYYY-MM-DD-<scope>-census/`.
Never refresh an older run in place. A rerun gets a new root or an explicit `-r2` suffix. Within one run,
resume may create only planned outputs that do not yet exist.

Before collection, record in the run manifest draft:

- `run_id`, timezone, `started_at`
- source registry version and selected sources
- exact per-source scope/query set
- current/raw cutoff and any imported snapshot cutoff
- collector assignment

Write the executable plan first as `<run>/source-plan.json`. Each source entry requires `source`, `producer`,
`expected_inputs`, `access_mode`, `adapter_status`, `governance`, `scope`, `queries`, `pagination`, `output_path`, and `attempt_status`.
Allowed attempt states are `planned`, `running`, `complete_surface`, `complete_query`, `partial`, `blocked`,
`failed`, and `main_session_handoff`. The builder reads only this exact output list; it never globs `raw/`.

Raw census may omit a profile. If review is in scope, `<run>/profile.json` records `profile_version`, `captured_at`, canonical profile source
path, its SHA-256, and the preference/filter snapshot. Do not silently use the latest mutable profile.

## 2. State machine

| State | Required evidence | Allowed next state |
|---|---|---|
| `PLANNED` | source plan lists every producer, expected input, output, and termination rule | `COLLECTING` |
| `COLLECTING` | every planned attempt is terminal; exact planned outputs exist | `RAW_FROZEN` |
| `RAW_FROZEN` | ledger audit passes schema, identity, accounting, provenance | `REVIEW_ATTACHED` or `RENDERED` |
| `REVIEW_ATTACHED` | review files are under `reviewed/`; join report names unmatched rows | `RENDERED` |
| `RENDERED` | `dist/manifest.json`, `dist/jobs.js`, `site/index.html` exist | `VERIFIED` |
| `VERIFIED` | ledger audit and dashboard audit are PASS in `audit.json` | terminal |

A failure stays in the current state with `HOLD` and an exact reason. Chat claims do not advance state.

## 3. Orchestration

1. Main session partitions the registry into non-overlapping source assignments.
2. Each collector writes only its assigned source. It writes a sibling
   `<output>.tmp-<pid>`, validates it, then atomically renames it to the planned output.
   Automated collection uses HTTP/API/search/sitemaps and never impersonates an authenticated browser.
3. Jobplanet, RocketPunch, and Remember use the owner-configured browser. The owner handles login; the agent performs read-only collection and writes `imports/<source>.json` using `assets/browser-export.example.json`.
4. Main session integrates only after all assigned sources have a terminal attempt state. `failed` remains
   visible and cannot silently fall back to an older file.
5. Run a read-only ledger audit over raw and dist without editing them.
6. Run a read-only dashboard audit over the local site without editing source data.

Do not fan out browser work. Parallelize public source collection, not shared Chrome state.

Canonical commands are:

- `scripts/init-run.mjs` — freeze the 29-source registry, local profile, and named official targets;
- `scripts/collect-raw-ledgers.mjs` — complete adapters for Wanted, Saramin, Jumpit, and Rallit;
- `scripts/collect-extended-sources.mjs` — all other automated sources plus validated owner-browser imports for Jobplanet, RocketPunch, and Remember;
- `scripts/sync-source-plan.mjs` — bind every attempt state to the immutable raw snapshot;
- `scripts/build-ledger.mjs` — optional reviewed-label join;
- `scripts/build-census.mjs` and `scripts/build-dashboard.mjs` — manifest, payload, and static site;
- `scripts/run-census.mjs` — one-command orchestration of the above;
- `scripts/self-test.mjs` and `scripts/smoke-dashboard.mjs` — executable regression gates.

From the installed skill root:

```bash
node scripts/run-census.mjs --run-dir /absolute/path/to/YYYY-MM-DD-scope-census --acknowledge-source-policy
```

If a browser handoff is missing, the run keeps a zero-row `blocked` artifact. Add the validated export under `imports/` and rerun that source in a fresh `-r2` run; never delete or overwrite the blocked evidence.

## 4. Artifact transitions

```text
source-plan.json + optional profile.json
  -> raw/<source>.json
  -> dist/manifest.json + dist/jobs.js
  -> site/index.html
  -> audit.json
```

`reviewed/*.json` is an optional side input between raw freeze and render. It may add labels but must not
add, delete, or replace current raw rows. The dashboard loads the current raw ledger by default.

## 5. Resume rules

Legacy runs missing current plan metadata are never edited in place. Migrate to a new run root:

```bash
node scripts/migrate-run.mjs --run-dir /absolute/old-run --out /absolute/new-run
```

The migration copies immutable raw files, records the source plan hash, enriches current policy metadata, and rebuilds derived surfaces.

- Read `audit.json`, manifest, and each raw metadata block before retrying.
- Reject unplanned files and stale extras under `raw/`; do not glob them into the build.
- Resume writes missing planned outputs only. An existing `partial`, `blocked`, `failed`, corrupt, or stale raw
  file is immutable evidence; retry that source in a new `-r2` run.
- Reuse a snapshot only when its exact scope and capture time are still accepted for this run; mark it as
  `inputs.kind=imported_snapshot`. Never relabel it as live collection.
- `--snapshot` accepts canonical `{metadata,jobs}` only. Treat historical `data/all/` and `data/*.json` as
  read-only regression fixtures; do not invent a generic legacy fallback or promise a nonexistent converter.
- A snapshot producer is mandatory. Missing live/import producer, missing expected input, or a failed producer
  is `failed`; there is no implicit fallback.
- A blocked source remains a zero-row metadata artifact. Never backfill a guessed count or synthetic row.
- If the provider changes during pagination, record drift and finish as `partial` unless the collector can
  prove the declared scope was exhausted.

## 6. Handoff to candidate review

After `RAW_FROZEN`, this skill's realistic-review mode may derive candidate/unknown/excluded labels, company identity,
financial grade, commute, and hiring friction for a narrowed set. Never run finance across the full raw ledger.
Keep review in `reviewed/`; reuse requires source ID, content fingerprint, review time, profile version and hash.
Canonical cross-source merges retain members, confidence, and provenance. Census completion never auto-produces
a final Top 10; ranking and adversarial review are separate owner-requested work.

Closeout reports: what was collected, why any scope is incomplete, importance of the gap, and the next
action. State the declared coverage, never “all jobs on the internet.”

After rendering, generate evidence rather than hand-writing QA:

```bash
npm install
npx playwright install chromium
node scripts/record-qa.mjs --run-dir /absolute/run
node scripts/audit-run.mjs --run-dir /absolute/run --qa /absolute/run/qa-evidence.json
```
