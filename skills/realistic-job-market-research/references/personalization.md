# Local Personalization

Personal tailoring is deliberately separated from the public Git repository.

## Default local files

```text
~/.config/realistic-job-market-research/profile.json
~/.config/realistic-job-market-research/official-targets.json
```

`scripts/init-run.mjs` reads these files by default and freezes them into each run. Override them with `--profile-config` and `--official-targets`.

Create a current, private, mode-0600 profile with `node scripts/init-profile.mjs`. `assets/profile.example.json` is a generated fixture, not a copy-and-run SSOT. The local profile should contain only decision-relevant facts:

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

Raw census initialization works without a profile. Review queues, personalized decisions, and scoring fail closed until a valid profile is supplied.
