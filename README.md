# Realistic Job Market Research

A cross-agent skill for collecting public job postings into an audited ledger and reducing them to a small, evidence-backed, personalized decision set.

It verifies the exact current JD against a real candidate profile, resolves the employer before attaching finance, checks location or work policy and hiring effort, separates genuinely new roles from reposts, and distinguishes application preparation from accepting an employer.

It ships the same 29-source census, immutable raw schema, manifest, dashboard, audit gates, company-identity gate, financial review, commute and hiring-effort model, update correction, and two-stage application/offer decision used by the maintained workflow. It never submits applications.

## Install

Install globally for both Codex and Claude Code with the open agent-skills CLI:

```bash
npx skills add joonyeonglim/realistic-job-market-research \
  -g -a codex -a claude-code -y
```

The CLI keeps one canonical copy and creates agent-specific links. Use `npx skills update -g realistic-job-market-research -y` to update it.

## Use

```text
Use $realistic-job-market-research to research these five roles realistically.
Which of these openings are actually worth the application effort?
Compare this week's jobs with my prior list and separate new, reposted, and closed roles.
```

Provide a dated resume or candidate profile and named job URLs or an audited shortlist. The output keeps missing evidence as `UNKNOWN` and uses claim-level links.

## Personalize locally

Personal facts stay outside the public repository:

```bash
mkdir -p ~/.config/realistic-job-market-research
cp assets/profile.example.json ~/.config/realistic-job-market-research/profile.json
cp assets/official-targets.example.json ~/.config/realistic-job-market-research/official-targets.json
python3 scripts/validate_profile.py \
  ~/.config/realistic-job-market-research/profile.json --check-sources
```

See [`references/personalization.md`](references/personalization.md).

## Run the census

From the installed canonical skill directory:

```bash
node scripts/run-census.mjs --run-dir /absolute/path/to/2030-01-15-ai-census
```

The run retains all raw rows. The dashboard paginates rendering only.

Attach reviewed labels without editing raw rows:

```bash
node scripts/create-review-snapshot.mjs \
  --run-dir /absolute/run/path \
  --decisions /absolute/review-decisions.json

node scripts/run-census.mjs \
  --run-dir /absolute/run/path \
  --from-frozen-raw \
  --review-snapshot /absolute/run/path/reviewed/manual.json
```

After local browser QA, synthesize the 14 ledger and 8 dashboard gates:

```bash
node scripts/audit-run.mjs \
  --run-dir /absolute/run/path \
  --qa /absolute/run/path/qa-evidence.json
```

## Validate a review

```bash
python3 scripts/validate_review.py --self-test
python3 scripts/validate_profile.py --self-test
node scripts/self-test.mjs
node scripts/smoke-dashboard.mjs
node scripts/verify-reference-run.mjs --run-dir /absolute/replayed-reference-run
python3 scripts/validate_review.py path/to/review.json
```

See [`references/review-schema.md`](references/review-schema.md) for the JSON contract.

## Privacy and actions

Do not put recruiter contact details, private messages, credentials, personal contact information, or confidential employer data in review artifacts. Installing this skill does not authorize applying, saving, messaging, or editing a profile.

## Compatibility

- Codex: root `SKILL.md`, optional `agents/openai.yaml`, scripts, references, and assets.
- Claude Code: the same root `SKILL.md`; invoke explicitly as `/realistic-job-market-research` or allow description-based loading.
- Installer: [`skills`](https://github.com/vercel-labs/skills), the open agent-skills CLI.

Specifications: [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills) · [Claude Code Skills](https://code.claude.com/docs/en/skills) · [Agent Skills](https://agentskills.io)

## License

MIT
