# Realistic Job Market Research

An evidence-first Agent Skill for Codex and Claude Code that audits public job postings, builds a lossless job-market ledger, and ranks roles against a private local candidate profile. The current registry contains 13 implemented collectors, 15 access probes, and one authenticated handoff; probes are never described as collected.

## Install

```bash
npx skills add joonyeonglim/realistic-job-market-research \
  -g -a codex -a claude-code -y
```

This runs the [Skills CLI](https://github.com/vercel-labs/skills) through `npx` and installs the canonical skill from GitHub; this repository is not published as an npm runtime package.

Run updates from a normal terminal after closing active Codex/Claude sessions, then verify:

```bash
npx skills update -g realistic-job-market-research -y
npx -y skills-ref validate ~/.agents/skills/realistic-job-market-research
node ~/.agents/skills/realistic-job-market-research/scripts/doctor.mjs --global
```

## Census

From the installed skill directory:

```bash
cd ~/.agents/skills/realistic-job-market-research
node scripts/run-census.mjs \
  --run-dir /absolute/path/to/new-run \
  --acknowledge-source-policy
```

Review [`references/source-governance.md`](skills/realistic-job-market-research/references/source-governance.md) first. A raw census does not require a private profile.

## Personalized review

```bash
node scripts/init-profile.mjs
python3 scripts/validate_profile.py \
  ~/.config/realistic-job-market-research/profile.json \
  --check-sources
node scripts/create-review-queue.mjs \
  --run-dir /absolute/run \
  --query "AI Agent"
```

The queue remains unresolved until exact JD, candidate, legal-identity, finance, location/work-policy, hiring-process, compensation, and evidence-quality checks are completed.

## Score

```bash
python3 scripts/score_review.py \
  --input /absolute/review.json \
  --profile ~/.config/realistic-job-market-research/profile.json \
  --output /absolute/scored-review.json
```

The machine-readable score SSOT is [`scoring-policy.default.json`](skills/realistic-job-market-research/assets/scoring-policy.default.json). Scores are decision aids, not hiring probabilities.

## QA

```bash
npm install
npx playwright install chromium
node scripts/record-qa.mjs --run-dir /absolute/run
node scripts/audit-run.mjs --run-dir /absolute/run --qa /absolute/run/qa-evidence.json
```

## Guarantees and boundaries

- Preserves actual rows, exact source limits, blocked/failed zero-row evidence, hashes, and capture times.
- Never bypasses login, CAPTCHA, paywalls, private networks, or access controls.
- Never applies, saves, messages, or mutates a job profile without explicit authorization.
- Keeps personal profiles outside Git and rejects credential/contact patterns.
- Does not claim internet-wide completeness, legal permission, predictive validity, or hiring probability.

See [AUDIT.md](AUDIT.md), [SECURITY.md](SECURITY.md), and the full [Korean README](README.md).
