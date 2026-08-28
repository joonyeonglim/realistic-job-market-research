# Contributing

1. Start from a current issue or describe the exact source contract being changed.
2. Never commit personal profiles, raw third-party bodies, credentials, recruiter contacts, or browser session data.
3. Add sanitized fixtures for parser changes and preserve blocked/failed zero-row behavior.
4. Run `npm test`, `npx -y skills-ref validate skills/realistic-job-market-research`, and the relevant focused command.
5. Update the machine-readable SSOT first, then the thin documentation that links to it.

Collector additions must document source rights status, access mode, query/pagination boundary, rate policy, termination evidence, and failure behavior.
