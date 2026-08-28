# Review Attachment Workflow

The raw ledger is immutable. Review labels join only by current `source`, `source_id`, content fingerprint, profile version, and profile hash.

1. Copy [`assets/review-decisions.example.json`](../assets/review-decisions.example.json) outside the raw directory.
2. Add only rows whose current detail evidence was actually reviewed.
3. Create an exact snapshot:

```bash
node scripts/create-review-snapshot.mjs \
  --run-dir /absolute/run/path \
  --decisions /absolute/decisions.json
```

4. Build the reviewed ledger and dashboard:

```bash
node scripts/build-ledger.mjs \
  --run-dir /absolute/run/path \
  --snapshot /absolute/run/path/reviewed/manual.json \
  --profile /absolute/run/path/profile.json

node scripts/build-census.mjs \
  --run-dir /absolute/run/path \
  --snapshot /absolute/run/path/reviewed/ledger.json

node scripts/build-dashboard.mjs \
  --dist /absolute/run/path/dist \
  --out /absolute/run/path/site
```

An unmatched or stale row stays `unreviewed`. Similar company or title text never inherits a prior label automatically. Detailed application and offer decisions belong in the review JSON contract, not in raw rows.
