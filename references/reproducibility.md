# Reference-run Reproducibility

The public package was replayed against the frozen 2026-08-28 artifacts produced by the maintained workflow.

Observed equality:

- 29 planned and snapshotted sources;
- 29,469 normalized raw rows;
- 12 row-producing sources;
- complete 6, partial 7, blocked 3, failed 13;
- reviewed candidate 19, excluded 6, unreviewed 29,444;
- identical source-ID plus content-fingerprint identity SHA-256:
  `8a9fd83e095f91ad3330bd458b22b7326059a86e7e8edecca8d7512a167a662b`;
- zero manifest count mismatches;
- census self-test and 40,001-row dashboard smoke test PASS.

Verify a retained replay:

```bash
node scripts/verify-reference-run.mjs --run-dir /absolute/path/to/replayed-run
```

The reference fixes transformation behavior, not live market counts. A fresh collection is expected to differ because jobs and source access change.
