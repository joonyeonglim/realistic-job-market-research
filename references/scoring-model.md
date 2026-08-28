# Evidence-based Matching Scores

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

The sources justify the structure, not the exact numerical weights. Weights are candidate policy and must be versioned in the private profile.

## 0. Non-compensatory gates

Apply these before ranking:

- `hard_exclusion=true` → application `DROP`, offer `NO_GO`, Opportunity Score `0`.
- `current_status=closed` → application `DROP`, Opportunity Score `0`.
- any mandatory `missing` → JD Match Score capped at `59`, Opportunity Score capped at `49`, and application cannot be `PREPARE`.
- any mandatory `unknown` → JD Match Score capped at `74`.
- `current_status=ambiguous` → Opportunity Score capped at `59`.
- Evidence Confidence below `70` → score is provisional and excluded from a confident final ranking.

These gates prevent a high score on convenient criteria from compensating for a degree floor, a missing mandatory technology, a closed posting, or a user hard exclusion.

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

Formula:

```text
JD Match Score = sum(component score × component weight) / sum(applicable weights)
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

Formula:

```text
Opportunity Score =
  Match × Wmatch + Finance × Wfinance + Location × Wlocation
  + Hiring × Whiring + Compensation × Wcompensation
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

Bands:

| Score | Label |
|---:|---|
| 85–100 | `HIGH` |
| 70–84.9 | `USABLE` |
| 50–69.9 | `THIN` |
| 0–49.9 | `INSUFFICIENT` |

## 4. Sensitivity profiles

The scorer recomputes Opportunity Score with three alternative policies:

| Profile | Match | Finance | Location | Hiring | Compensation |
|---|---:|---:|---:|---:|---:|
| `fit_first` | 60 | 15 | 8 | 7 | 10 |
| `stability_first` | 35 | 35 | 10 | 8 | 12 |
| `low_friction` | 40 | 20 | 15 | 15 | 10 |

The scorer emits both alternative scores and `sensitivity_rankings`. Report whether the top set remains stable and which roles move. A role that ranks first only under one narrow weight profile should not be presented as the single objective best choice.

## 5. Interpretation rules

- Never hide component scores behind the total.
- Never rank `ranking_allowed=false` roles alongside adequately evidenced roles without a provisional label.
- Never convert scores to an application or hiring probability.
- Never use protected characteristics or recruiter-response demographics.
- Keep score model version, weights, input profile version, and `as_of` date in every output.
- Recompute when the JD body, candidate evidence, finance year, office policy, process, or weights change.
