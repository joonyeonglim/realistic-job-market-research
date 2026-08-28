---
name: realistic-job-market-research
description: "Verify whether live job openings are genuinely worth pursuing by checking the exact JD, candidate evidence, company identity, current finance, location or work policy, compensation, and hiring effort. Use for 'research these jobs realistically', 'which roles are actually worth applying to', or 'separate new, reposted, stale, and misleading openings'. Do not use for mass crawling or submitting applications."
---

# Realistic Job Market Research

## Purpose

Turn a named shortlist or an audited job ledger into a small, evidence-backed decision set. Distinguish low-cost application preparation from the stricter decision to join an employer.

## Workflow

1. Freeze the candidate contract: target roles, proven strengths, unsupported claims, hard exclusions, location or work-policy constraints, compensation needs, and tolerated hiring effort. Version the source instead of paraphrasing it from memory.
2. State the research scope. Default to named roles or a shortlist from an audited ledger. If the user asks for a market-wide census, stop and say that collection is a separate workflow.
3. Recheck every role on its current detail page. Record `active`, `closed`, `ambiguous`, or `reposted`. The exact body and source ID outrank the title and search snippet.
4. Extract mandatory requirements, preferred requirements, duties, employment type, exact location, work policy, compensation, deadline, and hiring steps. Use `UNKNOWN` when the current source does not say.
5. Resolve the employer identity before assigning finance. Then verify current financial facts using the source order and identity gate in [references/evidence-contract.md](references/evidence-contract.md).
6. Match each mandatory requirement to candidate evidence as `confirmed`, `transferable`, `missing`, or `unknown`. Never turn a preferred skill into a mandatory one or fill a gap with adjacent experience.
7. Make two decisions: `PREPARE | CONDITIONAL | DROP` for application effort, and `PASS | HOLD | NO_GO` for accepting the employer. A cheap application may be `PREPARE` while the employer remains `HOLD`.
8. Adversarially recheck the leaders. Look for degree floors, customer-facing work, language requirements, scale claims, mandatory frameworks, hidden tests, stale finance, and current-founder or commitment signals in the resume.
9. Produce the shortlist, hard exclusions, corrections to prior findings, evidence links, unknowns, and resume-signal changes. Validate JSON output with `python3 scripts/validate_review.py <review.json>`.

## Modes

- **Named shortlist:** deeply verify the roles supplied by the user.
- **Audited ledger:** select a small review set from a ledger whose collection limits are already known; do not call unreviewed rows exclusions.
- **Update correction:** compare prior source IDs and URLs with current pages; label genuinely new, reposted, previously missed, closed, and materially changed roles separately.

## Rules

- Prefer official career pages and exact job details. A search result is discovery evidence, not proof that a role is active.
- Preserve conflicting facts with both sources; do not average them.
- Do not infer salary, work policy, degree requirements, finance, or hiring steps.
- Do not express unsupported hiring probabilities as percentages. Use reasoned `high`, `medium`, or `low` fit labels.
- Do not store recruiter names, emails, phone numbers, private messages, credentials, or confidential employer data.
- Do not apply, save, message, edit a profile, or contact anyone without explicit authorization for that action.
- Keep the final shortlist small. More rows are not a better result.

## References

- [references/evidence-contract.md](references/evidence-contract.md) — read before finance, identity, status, or decision classification.
- [references/review-schema.md](references/review-schema.md) — read when producing or validating machine-readable review JSON.
