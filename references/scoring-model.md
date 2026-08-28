# Evidence-based Matching Scores

Model version: `2026-08-v2`

## Why three scores

A single score mixes different questions and creates false precision. This model reports three values:

1. **JD Match Score** — how strongly the candidate's dated evidence covers the actual work and requirements.
2. **Opportunity Score** — how attractive the role and employer are under the candidate's finance, location, hiring-effort, and compensation preferences.
3. **Evidence Confidence** — how much of the information needed for those scores is actually verified.

Scores are decision aids, not hiring probabilities, psychometric tests, or substitutes for the explicit `PREPARE | CONDITIONAL | DROP` and `PASS | HOLD | NO_GO` states.

## Research basis

- The [U.S. Office of Personnel Management job-analysis guidance](https://www.opm.gov/policy-data-oversight/assessment-and-selection/job-analysis/) treats job analysis as the foundation for assessment decisions and explicitly links job tasks with the competencies required to perform them. Therefore this model scores the exact JD body and task evidence, not titles or tags.
- The [O*NET Content Model](https://www.onetcenter.org/content.html) separates worker requirements, experience requirements, occupational requirements, work activities, and work context. Therefore mandatory skills, delivery evidence, level, actual duties, and work conditions remain distinct criteria.
- [ESCO's skills pillar](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/skills-pillar) and its [essential-skill concept](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/essential) support separating essential from optional skills instead of treating every keyword equally.
- Kristof-Brown, Zimmerman, and Johnson's [meta-analysis of fit at work](https://doi.org/10.1111/j.1744-6570.2005.00672.x) covered 172 studies and found broadly generalizable relationships between forms of fit and applicant attraction, job acceptance, performance, withdrawal, strain, and tenure. This supports reporting role capability fit separately from employer or needs fit.
- The UK government's [Multi-criteria analysis manual](https://www.gov.uk/government/publications/multi-criteria-analysis-manual-for-making-government-policy) specifies a sequence of decision context, criteria, scoring, weighting, overall value, and sensitivity analysis. It also recommends testing whether different weights change the ordering. Therefore weights are explicit, versioned, and accompanied by sensitivity profiles.

The sources justify the structure, not the exact numbers. Match values, weights, caps, and band boundaries are explicit decision-policy parameters, not statistically learned hiring probabilities. Candidate-specific values and weights live in the versioned private profile; fixed model caps and bands change only with a score-model version.

## 0. Non-compensatory gates

Apply these before ranking:

- `hard_exclusion=true` → application `DROP`, offer `NO_GO`, Opportunity Score `0`.
- `current_status=closed` → application `DROP`, Opportunity Score `0`.
- any mandatory `missing` → JD Match Score capped at `59`, Opportunity Score capped at `49`, and application cannot be `PREPARE`.
- any mandatory `unknown` → JD Match Score capped at `74`.
- `current_status=ambiguous` → Opportunity Score capped at `59`.
- Evidence Confidence below `70` → score is provisional and excluded from a confident final ranking.

These gates prevent a high score on convenient criteria from compensating for a degree floor, a missing mandatory technology, a closed posting, or a user hard exclusion.

The numeric anchors intentionally lock states to bands:

- `transferable=55` is the lowest `CONDITIONAL` Match value: adjacent evidence receives credit but never equals direct proof;
- Match cap `59` keeps a verified mandatory miss below `SOLID`;
- Opportunity cap `49` keeps a verified mandatory miss in `LOW` regardless of finance or commute;
- Match cap `74` lets unresolved mandatory evidence remain provisional but never `STRONG`;
- ambiguous-status cap `59` keeps an unverified posting at most `CONDITIONAL`;
- Confidence threshold `70` is the lower boundary of `USABLE` evidence.

These are conservative policy choices. They must not be described as empirically estimated acceptance, performance, or hiring-success probabilities.

## Calculation order and numeric precision

The implementation order is fixed:

1. convert evidence states and employer grades to numeric values;
2. calculate component means;
3. calculate the raw JD Match weighted mean, excluding only truly not-applicable components from its denominator;
4. apply the JD Match ceiling;
5. calculate the raw Opportunity weighted mean using the capped, unrounded JD Match value;
6. apply the Opportunity hard gate or ceiling;
7. calculate Evidence Confidence independently;
8. assign bands and ranks from unrounded final values;
9. round displayed scores to one decimal only at output time.

Intermediate values in `match_calculation`, `opportunity_calculation`, and `confidence_calculation` are shown to four decimal places. The scorer never feeds the displayed one-decimal score back into another formula.

## 1. JD Match Score

Default weights:

| Component | Weight | Input |
|---|---:|---|
| Mandatory requirements | 45 | mean match value across `requirements.must_have[]` |
| Task and ownership alignment | 20 | `fit.dimensions.task_ownership` |
| Production delivery evidence | 15 | `fit.dimensions.production_delivery` |
| Preferred requirements | 8 | mean match value across `requirements.preferred[]` |
| Level and scope alignment | 8 | `fit.dimensions.level_scope` |
| Domain onboarding cost | 4 | `fit.dimensions.domain_onboarding` |

Match values:

| Evidence state | Value |
|---|---:|
| `confirmed` | 100 |
| `transferable` | 55 |
| `missing` | 0 |
| `unknown` | 0 |

An absent preferred-requirements section is `not applicable`; its weight is redistributed proportionally across applicable components. An unknown preferred requirement is not absent and receives `0`.

First calculate requirement means. For `n` mandatory requirements and `p` preferred requirements:

```text
Mandatory = (m1 + m2 + ... + mn) / n
Preferred = (p1 + p2 + ... + pp) / p       when p > 0
Preferred = N/A                            when p = 0
```

Then calculate the raw weighted mean:

```text
J_raw =
  (45×Mandatory + 20×Task + 15×Production + 8×Preferred
   + 8×Level + 4×Domain)
  / sum(weights whose component is not N/A)
```

The normal denominator is `100`. If Preferred is absent, its weight is removed and the denominator is `92`; this is proportional redistribution, not an automatic preferred score of `100`.

Apply the most restrictive mandatory ceiling:

```text
J = min(J_raw, 59)   if any mandatory requirement is missing
J = min(J_raw, 74)   else if any mandatory requirement is unknown
J = J_raw            otherwise
```

Bands:

| Score | Label |
|---:|---|
| 85–100 | `STRONG` |
| 70–84.9 | `SOLID` |
| 55–69.9 | `CONDITIONAL` |
| 0–54.9 | `WEAK` |

## 2. Opportunity Score

Default personalized weights:

| Component | Weight |
|---|---:|
| JD Match Score | 45 |
| Employer finance | 25 |
| Location and work policy | 12 |
| Hiring effort | 8 |
| Compensation and level | 10 |

Axis values:

| Axis | Values |
|---|---|
| Finance | `A=100`, `B=75`, `C=35`, `D=0`, `UNVERIFIED=0` |
| Location/work policy | `good=100`, `acceptable=65`, `poor=20`, `unknown=0` |
| Hiring effort | `F0=100`, `F1=80`, `F2=55`, `F3=20`, `UNKNOWN=0` |
| Compensation/level | `good=100`, `acceptable=65`, `poor=20`, `unknown=0` |

`unknown=0` is a conservative risk policy, not evidence that the employer is bad or pays poorly. Evidence Confidence exposes the missing fact, and compensation must be confirmed before offer-stage `PASS`. If every shortlisted role has the same unknown axis, it lowers absolute Opportunity bands without changing their relative order.

Use finance `A` for durable profitability, not merely one profitable year after large losses. A turnaround, near-break-even employer, or demonstrably stable parent normally belongs in `B` with the reason recorded.

All five Opportunity axes are applicable, so the denominator is always `100`:

```text
O_raw =
  (45×J + 25×Finance + 12×Location + 8×Hiring + 10×Compensation)
  / 100
```

Apply gates in this order:

```text
O = 0                 if hard_exclusion=true or posting is closed
O = min(O_raw, 49)    else if any mandatory requirement is missing
O = min(O_raw, 59)    else if posting status is ambiguous
O = O_raw             otherwise
```

Bands:

| Score | Label |
|---:|---|
| 80–100 | `HIGH_PRIORITY` |
| 65–79.9 | `VIABLE` |
| 50–64.9 | `CONDITIONAL` |
| 0–49.9 | `LOW` |

## 3. Evidence Confidence

Confidence measures completeness, not positivity. A verified mismatch increases confidence even though it lowers fit.

| Evidence | Weight |
|---|---:|
| Current posting status verified | 10 |
| Mandatory requirement evidence resolved | 25 |
| Preferred requirement evidence resolved or explicitly absent | 5 |
| Four fit dimensions resolved | 15 |
| Employer identity confirmed | 10 |
| Finance verified | 10 |
| Exact location/work policy known | 10 |
| Current-role hiring process known | 8 |
| Compensation/level confirmed | 7 |

`resolved` means any value other than `unknown`. Missing evidence can be confidently negative.

Let `Rmust`, `Rpreferred`, and `Rdimensions` be resolved-item counts divided by total-item counts. An empty preferred list is explicitly resolved, so `Rpreferred=1`. Let each `I(condition)` be `1` when true and `0` otherwise.

```text
E =
  10×I(posting status is not ambiguous)
  + 25×Rmust
  + 5×Rpreferred
  + 15×Rdimensions
  + 10×I(company identity confirmed)
  + 10×I(finance grade is not UNVERIFIED)
  + 10×I(location/work policy is known)
  + 8×I(hiring process is known)
  + 7×I(compensation is confirmed and graded)
```

Evidence Confidence is not capped by a negative decision. A verified hard mismatch can correctly have high confidence.

Bands:

| Score | Label |
|---:|---|
| 85–100 | `HIGH` |
| 70–84.9 | `USABLE` |
| 50–69.9 | `THIN` |
| 0–49.9 | `INSUFFICIENT` |

## 4. Fully worked numeric example

The synthetic example in [`assets/score-review.example.json`](../assets/score-review.example.json) has these values:

```text
Mandatory=100, Task=100, Production=100, Preferred=N/A,
Level=100, Domain=55,
Finance=100, Location=65, Hiring=100, Compensation=0
```

JD Match excludes the absent Preferred component:

```text
J_raw =
  (100×45 + 100×20 + 100×15 + 100×8 + 55×4)
  / (45 + 20 + 15 + 8 + 4)

      = 9,020 / 92
      = 98.043478...

No mandatory ceiling applies.
Displayed JD Match = 98.0
```

Opportunity uses `98.043478...`, not the displayed `98.0`:

```text
O_raw =
  (98.043478...×45 + 100×25 + 65×12 + 100×8 + 0×10)
  / 100

      = 8,491.9565... / 100
      = 84.919565...

No Opportunity gate applies.
Displayed Opportunity = 84.9
```

Every evidence category except compensation is resolved:

```text
E = 10 + 25 + 5 + 15 + 10 + 10 + 10 + 8 + 0
  = 93

Displayed Evidence Confidence = 93.0
```

The executable package test asserts the same numerator, denominator, raw scores, and displayed scores. A formula change that no longer yields `98.0 / 84.9 / 93.0` fails `npm test`.

## 5. Sensitivity profiles

The scorer recomputes Opportunity Score with three alternative policies:

| Profile | Match | Finance | Location | Hiring | Compensation |
|---|---:|---:|---:|---:|---:|
| `fit_first` | 60 | 15 | 8 | 7 | 10 |
| `stability_first` | 35 | 35 | 10 | 8 | 12 |
| `low_friction` | 40 | 20 | 15 | 15 | 10 |

The scorer emits both alternative scores and `sensitivity_rankings`. Report whether the top set remains stable and which roles move. A role that ranks first only under one narrow weight profile should not be presented as the single objective best choice.

Each sensitivity score replaces only the five Opportunity weights. It reuses the same unrounded capped JD Match, axis values, hard gates, ceilings, band rules, and ranking eligibility.

## 6. Ranking and interpretation rules

Base ranking eligibility is:

```text
ranking_allowed =
  E >= 70
  and current_status in {active, reposted}
  and hard_exclusion=false
  and application_stage != DROP
```

Eligible roles sort by unrounded Opportunity descending, then unrounded JD Match descending, then unrounded Evidence Confidence descending, then company name ascending. Sensitivity ranks use the alternative unrounded Opportunity value with the same tie-break order.

- Never hide component scores behind the total.
- Never rank `ranking_allowed=false` roles alongside adequately evidenced roles without a provisional label.
- Never convert scores to an application or hiring probability.
- Never use protected characteristics or recruiter-response demographics.
- Keep score model version, weights, input profile version, and `as_of` date in every output.
- Recompute when the JD body, candidate evidence, finance year, office policy, process, or weights change.
