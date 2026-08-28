# Local Personalization

Personal tailoring is deliberately separated from the public Git repository.

## Default local files

```text
~/.config/realistic-job-market-research/profile.json
~/.config/realistic-job-market-research/official-targets.json
```

`scripts/init-run.mjs` reads these files by default and freezes them into each run. Override them with `--profile-config` and `--official-targets`.

Start from [`assets/profile.example.json`](../assets/profile.example.json). The local profile should contain only decision-relevant facts:

- target roles and defensible level;
- dated, proven strengths and explicit gaps;
- degree and career years;
- hard domain or employment exclusions;
- finance and hiring-effort policy;
- a transit or work-policy anchor and user-defined tiers;
- resume source paths, ordering, and any owner-confirmed commitment statement.

Do not include phone numbers, personal email, exact home address, recruiter details, credentials, private messages, or confidential employer information.

Validate before a run:

```bash
python3 scripts/validate_profile.py ~/.config/realistic-job-market-research/profile.json --check-sources
```

The public skill may be installed on another machine without the local profile, but personalized census initialization fails closed until a valid profile is supplied.
