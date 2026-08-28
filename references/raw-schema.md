# Raw Schema and Snapshot Provenance

## 1. Source plan

`<run>/source-plan.json` is the only build input index. Every source entry has:

```json
{
  "source": "wanted",
  "producer": "job-census-source-collector",
  "expected_inputs": [{"kind": "live_http", "uri": "https://example.com/jobs"}],
  "access_mode": "public_http",
  "scope": "exact declared surface or query set",
  "queries": [],
  "pagination": {"method": "offset", "page_size": 100, "termination": "three empty pages"},
  "output_path": "raw/wanted.json",
  "minimum_captured_at": "2026-08-24T00:00:00+09:00",
  "allowed_completeness": ["complete_surface", "partial", "blocked", "failed"],
  "attempt_status": "planned",
  "attempts": []
}
```

The builder reads only these paths and rejects missing, duplicate, unplanned, or stale raw files. A required
producer may be live or explicit import; there is no silent fallback to yesterday's snapshot.

If review is attached, `<run>/profile.json` is:

```json
{
  "schema_version": 1,
  "profile_version": "2026-08-24-v1",
  "captured_at": "2026-08-24T00:00:00+09:00",
  "source": {"path": "<canonical profile>", "sha256": "<sha256>"},
  "preferences": {}
}
```

`profile_hash` in every review row is the SHA-256 of the exact frozen `profile.json` bytes. It is not a hash of
whatever mutable profile source happens to exist when the build runs.

## 2. One source snapshot per file

Canonical path: `<run>/raw/<source>.json`.

```json
{
  "metadata": {
    "schema_version": 1,
    "source": "wanted",
    "producer": "job-census-source-collector",
    "captured_at": "2026-08-24T00:00:00+09:00",
    "scope": "exact public scope collected in this file",
    "scope_kind": "public_surface",
    "queries": [],
    "pagination": {"method": "offset", "page_size": 100, "requests": [], "termination": "evidence"},
    "completeness": "complete_surface",
    "limits": [],
    "fetched_rows": 0,
    "emitted_rows": 0,
    "duplicates_removed": 0,
    "invalid_rows": 0,
    "parse_errors": 0,
    "normalization_warnings": [],
    "status_conflict_count": 0,
    "snapshot_kind": "live",
    "inputs": [{"kind": "live_http", "uri": "https://example.com/jobs", "captured_at": "2026-08-24T00:00:00+09:00"}]
  },
  "jobs": []
}
```

Completeness is exactly `complete_query`, `complete_surface`, `partial`, `blocked`, or `failed`.
`complete_query` covers only declared queries; `complete_surface` covers only the declared public surface.
Remaining invalid rows or parser errors force `partial`/`failed`. Coverage and posting status are separate.
`scope_kind` is `public_surface`, `query`, `category`, `board`, or `feed`.

`fetched_rows = emitted_rows + duplicates_removed + invalid_rows` and `jobs.length = emitted_rows`.
`parse_errors` is a count; `normalization_warnings` contains safe reasons/counts, never credentials. `named_targets`
binds a frozen list of official career URLs to the run; it is an input manifest, not a recovered job row. Imported
inputs keep original `captured_at`, path/URI, SHA-256, and byte size. Current CLI rejects legacy
`collected_at` and missing counters/hashes. A future explicit canonical migration adapter must convert them
before ingestion and record warnings. `posted_at` can never replace `captured_at`.

## 3. Normalized raw job

```json
{
  "source": "wanted",
  "source_id": "382301",
  "company": "example company",
  "title": "example title",
  "url": "https://example.com/jobs/382301",
  "captured_at": "2026-08-24T00:00:00+09:00",
  "posted_at": null,
  "location": null,
  "career_min": null,
  "career_max": null,
  "employment": null,
  "deadline": null,
  "status": "unknown",
  "status_conflict": false,
  "filter_stage": "raw",
  "match_terms": [],
  "review_text": "",
  "source_payload_hash": "<sha256>",
  "content_fingerprint": "<sha256>",
  "source_fields": {}
}
```

Required: source URL/ID, company, title, capture time, payload hash, and content fingerprint. Unknown text is
`UNKNOWN`; numeric/date unknowns are `null`. `posted_at` is the provider's optional publication time and never
satisfies freshness; `captured_at` is when this run actually retrieved the record.

Use the provider ID. If absent, use `url:<sha256(canonical URL)>` and record `metadata.id_strategy`; never use
company/title as identity. `source_payload_hash` hashes the source card/detail payload. This proves the artifact
basis without pretending every normalized field has independent evidence.

`content_fingerprint` is SHA-256 of the UTF-8 JSON array of NFKC, whitespace-collapsed values:
`[source, source_id, company, title, location, career_min, career_max, employment, review_text]`.

## 4. Raw identity, review, and canonical candidates

Raw primary key is exactly `source + "|" + source_id`. Merge that key only within the current snapshot; union
match terms, prefer the newest non-null source value, and record duplicates. Never cross-dedupe raw.
`blocked`/`failed` sources have `jobs: []`; provider totals without recovered records stay metadata.

A review row requires `source`, `source_id`, `content_fingerprint`, `reviewed_at`, `profile_version`,
`profile_hash`, and its label/evidence. Join only when all identity/fingerprint/profile values match. A content
or profile mismatch is stale review and becomes `unreviewed` (dashboard label `미판정`). Legacy `outside` is
accepted only on import and emits a warning.

Company/title similarity, a LinkedIn alias, or a repost may be shown as a review suggestion but never inherits
a label automatically. Same-ID evidence priority (including Work24 mirrors) is allowed only inside one source;
it is not permission to cross-source merge raw or transfer review.

Optional cross-source reviewed candidates record `canonical_id`, all `member_keys`, `dedupe_basis`,
`confidence` (`high|medium|low`), and provenance. Only high-confidence groups collapse; medium/low groups remain
separate linked rows.

## 5. Dist contract

`dist/manifest.json` contains run/source-plan/profile hashes, ordered payload schema, raw snapshot paths and
SHA-256, row-producing versus attempted/complete/partial/blocked/failed source counts, source and row accounting,
coverage and posting-status-conflict counts, all limits, and reviewed matched/stale/unmatched counts. It shows
raw `captured_at` min/max separately from build `generated_at`. Reviewed rows never add to current raw totals.

Manifest `build_config` is the UI SSOT:

```json
{
  "page_size": 100,
  "debounce_ms": 180,
  "facets": ["relevance", "source", "region", "status_group", "career_fit", "employment_group", "completeness"],
  "max_payload_bytes": 26214400,
  "max_index_bytes": 262144,
  "max_local_load_ms": 2000,
  "max_filter_ms": 250
}
```

`dist/jobs.js` exposes current raw rows plus optional joined review labels. The renderer reads schema and
`build_config` from the manifest. A budget failure is HOLD; never drop or truncate rows to pass it.
