# Realistic Job Market Research

A Codex skill for reducing live job openings to a small, evidence-backed decision set.

It verifies the exact current JD against a real candidate profile, resolves the employer before attaching finance, checks location or work policy and hiring effort, separates genuinely new roles from reposts, and distinguishes application preparation from accepting an employer.

The skill does not mass-crawl job boards or submit applications.

## Install

```bash
git clone https://github.com/joonyeonglim/realistic-job-market-research.git \
  ~/.codex/skills/realistic-job-market-research
```

Restart Codex if the skill list does not refresh automatically.

## Use

```text
Use $realistic-job-market-research to research these five roles realistically.
Which of these openings are actually worth the application effort?
Compare this week's jobs with my prior list and separate new, reposted, and closed roles.
```

Provide a dated resume or candidate profile and named job URLs or an audited shortlist. The output keeps missing evidence as `UNKNOWN` and uses claim-level links.

## Validate a review

```bash
python3 scripts/validate_review.py --self-test
python3 scripts/validate_review.py path/to/review.json
```

See [`references/review-schema.md`](references/review-schema.md) for the JSON contract.

## Privacy and actions

Do not put recruiter contact details, private messages, credentials, personal contact information, or confidential employer data in review artifacts. Installing this skill does not authorize applying, saving, messaging, or editing a profile.

## License

MIT
