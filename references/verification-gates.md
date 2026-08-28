# Census Verification Gates

Both independent auditors are read-only. Any failed item makes the run `HOLD`; `audit.json` records the gate,
expected value, observed value, evidence path, and timestamp.

```json
{
  "schema_version": 1,
  "run_id": "<run id>",
  "generated_at": "<ISO-8601>",
  "ledger": {"verdict": "PASS", "gates": []},
  "dashboard": {"verdict": "PASS", "gates": [], "environment": {}, "measurements": {}},
  "verdict": "PASS"
}
```

Each gate item is `{id, expected, observed, verdict, evidence}`. The main session writes this synthesis from
the two read-only reports; auditors do not edit the run.

## A. Ledger gates

1. **Plan:** `source-plan.json` declares every expected input, mandatory producer, output path, pagination rule,
   and attempt state. The build consumes only planned paths; missing/stale/unplanned raw is HOLD.
2. **Parse:** every planned raw file and manifest parses; snapshots were staged, validated, then atomically moved.
3. **Registry:** every selected source has exactly one snapshot and a terminal state: `complete_query`,
   `complete_surface`, `partial`, `blocked`, or `failed`.
4. **Schema:** every job has source URL/ID, payload hash, content fingerprint, ISO `captured_at`, distinct
   optional `posted_at`, and `filter_stage=raw`. Legacy aliases or missing hashes are rejected before build.
5. **Identity:** `source|source_id` is unique after normalization. Raw never cross-source dedupes.
6. **Parser accounting:** for every source,
   `fetched_rows = emitted_rows + duplicates_removed + invalid_rows` and `jobs.length = emitted_rows`.
   Invalid rows or parse errors force `partial`/`failed`; normalization warnings must not hide row loss.
7. **Accounting:** sum of per-source rows equals raw total; all relevance, coverage, status, career, and
   employment buckets each sum to that same total.
8. **Provenance:** every snapshot names exact scope, queries, pagination evidence, capture time, input kind,
   limits, completeness, source/artifact hashes, and checksum in the dist manifest.
9. **No fake rows:** every blocked/failed source has zero jobs. Reported provider totals never become rows unless the
   corresponding records were actually recovered.
10. **Snapshot separation:** no reviewed file is counted as raw. A join requires source ID, content fingerprint,
    `reviewed_at`, profile version and profile hash; stale/unmatched current rows are `미판정`.
11. **Canonical provenance:** cross-source candidate groups retain all members, basis and confidence; only
    high-confidence groups collapse. Posting-status conflicts are reported separately from coverage.
12. **Drift:** short intermediate pages, moving totals, provider count mismatches, stale mirrors, and pagination
    caps are reflected as limits or `partial`, not silently accepted as complete.
13. **Freshness:** manifest reports raw `captured_at` min/max separately from build `generated_at`; `posted_at`
    never masquerades as capture freshness. Attempted and row-producing source counts remain separate.
14. **Reproducibility:** rerunning the build from frozen raw inputs produces the same manifest counts and
    payload row identities. Volatile `generated_at` and file-order-neutral metadata may differ.

## B. Dashboard gates

1. The page loads `dist/jobs.js` and defaults to **all current raw rows**, not reviewed candidates.
2. Filters combine correctly for free text, source, relevance, region, status, career fit, employment, and
   coverage. Reset restores the unfiltered count.
3. Pagination uses manifest `build_config.page_size` (default 100). Previous/next boundaries, page label,
   zero-result state, and filter changes are correct; every filtered row remains reachable.
4. UI counts equal the manifest. Source options contain source keys, never raw URLs or object stringification.
5. Links accept only HTTP(S), untrusted text is escaped, controls have labels, and keyboard focus is visible.
6. Desktop and 390px checks show no body overflow; the ledger table may scroll inside its own container.
7. Browser console has zero errors. Missing optional reviewed data degrades to `미판정`, not a blank page.
8. Manifest `build_config` budgets pass: `max_payload_bytes=26214400`, `max_index_bytes=262144`,
   `max_local_load_ms=2000`, and `max_filter_ms=250`. Record Mac/browser/local-HTTP environment and measured
   jobs.js/index bytes, first usable local render, and filter repaint; do not universalize the timings.
   Budget failure is HOLD and rows are never truncated to pass.

Dashboard QA may use a local browser. That does not grant public collectors browser access; authenticated source
login remains in the owner-controlled main session and uses the private profile configuration.

## C. Release assertion

`audit.json` is PASS only when A and B pass. The final report must derive counts from the manifest and say:

- which declared scopes are complete;
- which are partial or blocked and why;
- how many actual raw rows are filterable now;
- whether a reviewed snapshot is attached and its date;
- that 100-row pagination affects rendering only, not retained rows.

Never use a historical count as an invariant or claim coverage beyond the registered scopes. Auditors do not
configure hooks/cron, bypass access controls, use credentials, apply to jobs, run finance over the full ledger,
or turn a census directly into a final Top 10.
