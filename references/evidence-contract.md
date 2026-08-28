# Evidence Contract

## Candidate contract

Use a dated, versioned source supplied by the user. Capture only what changes decisions: target role and defensible level, proven outcomes, unsupported claims, hard exclusions, location or work-policy constraints, compensation needs, and tolerated hiring effort. Do not copy personal contact details into research output.

## Current posting status

| Status | Meaning |
|---|---|
| `active` | The exact current detail body is visible and accepting candidates. |
| `closed` | The employer marks it closed, removes the role, or redirects to a generic list without it. |
| `ambiguous` | A mirror and official source conflict, or the current body cannot be verified. |
| `reposted` | The same employer, role, and substantially identical body reappeared under a new source ID or channel. |

Classify updates as `genuinely_new`, `reposted`, `previously_missed`, `closed`, or `materially_changed`. A new URL alone is not a new opportunity.

## Exact-JD matching

The body outranks the title. Classify every mandatory requirement:

- `confirmed`: directly supported by dated candidate evidence;
- `transferable`: adjacent evidence exists, but the exact requirement is not proven;
- `missing`: candidate evidence contradicts or lacks a hard requirement;
- `unknown`: the candidate source or JD is insufficient.

One hard `missing` normally prevents `PREPARE`, unless the JD explicitly accepts equivalent experience and that equivalence is documented. Recheck degree floors, years after a degree, customer-facing work, business language, mandatory frameworks, cloud and queue systems, scale claims, and management-only roles.

## Employer identity gate

Before assigning financial facts, match at least two of:

1. official domain;
2. representative or legal name;
3. exact address, including suite when available;
4. incorporation date or business identifier.

With fewer than two matches, set identity and finance to `unverified`. Shared addresses and similar names are not sufficient.

## Financial evidence

Use the newest fiscal year available and state the year. Prefer regulator filings or audited statements, exchange or official investor material, portal data sourced from a recognized credit bureau, credible filing-based reporting, then company claims labeled as such.

| Grade | Meaning |
|---|---|
| `A` | Operating profit, with trend and balance-sheet caveats recorded. |
| `B` | Near break-even, rapidly improving, or backed by a demonstrably stable parent. |
| `C` | Early-stage loss where runway remains a material offer risk. |
| `D` | Established chronic loss, severe deficit, or restructuring signal. |
| `UNVERIFIED` | Legal identity or current figures are not verified. |

A single profitable year after large losses is not durable profitability. Keep the history in the decision reason.

## Location and work policy

Use the user's own anchor and thresholds. Verify the exact office or named station; city or district alone is insufficient. Record remote frequency, mandatory office days, flexible hours, and relocation support separately. Do not present station-to-station time as door-to-door time.

## Hiring effort

| Grade | Typical process |
|---|---|
| `F0` | One or two interviews, no separate test, assignment, or reference check. |
| `F1` | Two or three interviews, no separate test or assignment. |
| `F2` | One test or assignment, or a reference check added to at most two interviews. |
| `F3` | Test or assignment plus three or more interviews, or several extra gates. |
| `UNKNOWN` | Exact current-role process is not published. |

Do not inherit another role's process as fact. Historical interview reviews are risk evidence only.

## Two-stage decision

Application effort:

- `PREPARE`: mandatory fit is strong enough and application cost is proportionate.
- `CONDITIONAL`: one material unknown or transferable gap should be closed first.
- `DROP`: closed role, hard mismatch, unacceptable employer risk, or poor effort-to-value ratio.

Employer or offer decision:

- `PASS`: active exact role, no mandatory gaps, identity confirmed, current finance acceptable, compensation confirmed, location or work policy acceptable, and process known.
- `HOLD`: any material axis is unknown or needs negotiation.
- `NO_GO`: a hard exclusion or verified unacceptable risk applies.

It is valid and often realistic to mark a role `PREPARE / HOLD`.

## Source discipline

- Cite claim-level URLs and an `as_of` date.
- Keep capture time distinct from posting date.
- Report access blocks instead of silently substituting stale data.
- Preserve old findings as historical snapshots; add a correction rather than rewriting evidence history.
