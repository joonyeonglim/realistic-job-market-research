# Repeated Failure Patterns

These are the failure modes the workflow must actively test, not optional reading.

| ID | Failure | Required response |
|---|---|---|
| P01 | Portal funding or investor data is stale | Recheck current filings, ownership, and recent corporate events. |
| P02 | Multiword search behaves like broad OR | Prefer precise single-token queries and record query semantics. |
| P03 | Login filters cannot be reproduced | Save declared URL parameters; leave non-reproducible filters partial. |
| P04 | Inbound proposals can be stronger than new search | On authenticated channels, inspect inbound first without recording contact details. |
| P05 | Subsidiary looks healthy because parent is hidden | Verify both employing entity and parent, plus the reason for separation. |
| P06 | Early-stage loss is treated like chronic loss | Separate runway risk from structural loss. |
| P07 | Convenient commute hides a down-level title | Record level and compensation floor, not commute alone. |
| P08 | Headhunter client is anonymous | Identity and finance stay `UNVERIFIED`; do not rank as an employer. |
| P09 | Recruiter personal data enters artifacts | Store company, role, and state only. |
| P10 | Research silently becomes an external action | Applying, saving, messaging, and profile changes require exact authorization. |
| P11 | Degree or experience differs across channels | Use the stricter current exact-role requirement until official conflict resolution. |
| P12 | Search budget is exhausted before finance | Validate high-priority company identity and finance early; do not fan out blindly. |
| P13 | Search index preserves a closed role | Verify the current detail body and deadline. |
| P14 | A source ID is paired with the wrong title | Re-read exact ID-to-title mapping before review inheritance. |
| P15 | A JS shell reports zero openings | Recheck a rendered or official API surface; zero shell rows are not closure proof. |
| P16 | A city or district is treated as commute proof | Use exact office or station; keep door-to-door limits explicit. |
| P17 | Titles such as FDE or Solutions are assumed equivalent | Read duties for customer site, travel, support, and product ownership. |
| P18 | Title and tags substitute for a missing JD body | Missing body means fit `UNKNOWN`, not high. |
| P19 | Browser tooling blocks template-literal query strings | Use `URLSearchParams` and return only necessary fields or counts. |
| P20 | Filing-site inline search resets or hides statement frames | Use stable filing IDs and navigate to the exact financial statement section. |
| P21 | A dead data provider is retried indefinitely | Record the dead path and use the next authoritative source. |
| P22 | Same-name company receives another entity's finance | Enforce the 2-of-4 identity gate before attribution. |
| P23 | Plain-text scraping merges adjacent cards | Parse DOM card boundaries or open individual detail pages. |
| P24 | Portal summary tag contradicts underlying data | Preserve both; higher-authority underlying data wins. |
| P25 | Conflicting figures are averaged | Report both with year and source; explain any selected value. |
| P26 | A short page is treated as the final page | Stop only on the declared terminal contract, such as cursor exhaustion or consecutive empty pages. |

## Additional realistic-review checks

- A current founder or side-project title can create commitment risk even when ordering is correct.
- A preferred skill must not be promoted to a mandatory gap, and a mandatory tool must not be softened into “transferable” without evidence.
- A low-cost application can be `PREPARE` while compensation, finance, or work policy keeps the employer at `HOLD`.
- A new URL, portal, or title is not a new opportunity when the employer and body are materially the same.
