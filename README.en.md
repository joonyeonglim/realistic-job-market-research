# Realistic Job Market Research

An evidence-first Agent Skill for Codex and Claude Code that audits public job postings, builds a lossless job-market ledger, and ranks roles against a private local candidate profile. The current registry contains 26 automated collectors and 3 owner-browser handoffs, covering all 29 declared sources without bypassing access controls.

## Install

```bash
npx skills add joonyeonglim/realistic-job-market-research \
  -g -a codex -a claude-code -y
```

Without Node.js on macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/joonyeonglim/realistic-job-market-research/main/install.sh | sh
```

Without Node.js on Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/joonyeonglim/realistic-job-market-research/main/install.ps1 | iex
```

The bootstrap verifies the official Node v24 archive and installs it only in the user cache. Python is discovered automatically or provisioned through `uv` as a managed Python 3.12 runtime.

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

Jobplanet, RocketPunch, and Remember use an owner-browser export at `imports/<source>.json`; see [`browser-export.example.json`](skills/realistic-job-market-research/assets/browser-export.example.json). The other 26 sources run automatically.

## Personalized review

```bash
node scripts/init-profile.mjs
node scripts/python-runner.mjs scripts/validate_profile.py \
  ~/.config/realistic-job-market-research/profile.json \
  --check-sources
node scripts/create-review-queue.mjs \
  --run-dir /absolute/run \
  --query "AI Agent"
```

The queue remains unresolved until exact JD, candidate, legal-identity, finance, location/work-policy, hiring-process, compensation, and evidence-quality checks are completed.

## Score

```bash
node scripts/python-runner.mjs scripts/score_review.py \
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
