# Evidence-based Matching Scores

Model version: `2026-08-v3`

The machine-readable SSOT is [`assets/scoring-policy.default.json`](../assets/scoring-policy.default.json). Code reads that file; this document explains it. `npm test` fails when generated schemas or numeric examples drift.

## Purpose and limits

The model reports separate values:

1. **JD Match** — weakest mandatory evidence plus task, production, preferred, level, and domain evidence.
2. **Opportunity** — personalized role value across Match, finance, location/work policy, hiring effort, and compensation.
3. **Evidence Coverage** — how much required evidence is resolved.
4. **Evidence Quality** — a separately reviewed source-quality and freshness grade.

These are decision aids, not hiring probabilities or validated psychometric scores. Structure is informed by [OPM job analysis](https://www.opm.gov/policy-data-oversight/assessment-and-selection/job-analysis/), [O*NET](https://www.onetcenter.org/content.html), [ESCO essential skills](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/essential), person-job fit research, and [UK MCDA guidance](https://www.gov.uk/government/publications/multi-criteria-analysis-manual-for-making-government-policy). Exact values are versioned owner policy.

## Calculation order

1. Map evidence/axis states to numeric values from the policy SSOT.
2. Set Mandatory to the minimum mandatory-requirement value; all must-haves are conjunctive.
3. Average preferred requirements when present; otherwise mark Preferred `N/A`.
4. Calculate raw JD Match and apply mandatory ceilings.
5. Calculate raw Opportunity from the capped, unrounded Match and apply gates.
6. Calculate Evidence Coverage independently.
7. Check Evidence Quality and freshness.
8. Rank only eligible `PREPARE` roles using unrounded values.
9. Display with decimal `ROUND_HALF_UP` to one place.

## 1. JD Match

Evidence values:

```text
confirmed=100, transferable=55, missing=0, unknown=0
```

Components and default weights:

```text
Mandatory=45, Task=20, Production=15, Preferred=8, Level=8, Domain=4
```

Mandatory aggregation is deliberately grouping-resistant:

```text
Mandatory = min(m1, m2, ... mn)
Preferred = mean(p1, p2, ... pp) when p > 0; otherwise N/A

J_raw = Σ(component × weight) / Σ(applicable weights)
```

The denominator is normally `100`; when Preferred is absent it is `92`.

```text
J = min(J_raw, 59) if any mandatory is missing
J = min(J_raw, 74) else if any mandatory is unknown
J = J_raw otherwise
```

Because Mandatory uses the minimum, splitting one confirmed criterion into several confirmed lines cannot inflate the mandatory component.

Bands are read from `policy.bands.match`.

## 2. Opportunity

Default profile weights:

```text
Match=45, Finance=25, Location/Work=12, Hiring=8, Compensation=10
```

Axis maps are in `policy.axis_values`. Unknown receives no positive value; this is conservative missing-information policy, not evidence that an employer is poor.

```text
O_raw = (45×J + 25×Finance + 12×Location + 8×Hiring + 10×Compensation) / 100

O = 0              if hard exclusion or closed
O = min(O_raw, 49) else if mandatory missing
O = min(O_raw, 59) else if posting ambiguous
O = O_raw          otherwise
```

## 3. Evidence Coverage and Quality

Coverage measures completeness only:

```text
E =
  10×I(posting status resolved)
  + 25×resolved mandatory ratio
  + 5×resolved preferred ratio
  + 15×resolved fit-dimension ratio
  + 10×I(identity confirmed)
  + 10×I(finance verified)
  + 10×I(location/work known)
  + 8×I(hiring process known)
  + 7×I(compensation confirmed)
```

An empty preferred list is explicitly resolved. A verified negative fact increases coverage without increasing Match or Opportunity.

Coverage is not source trust. Every role therefore also requires:

```json
{"grade":"high|medium|low|unverified","freshness":"current|mixed|stale|unknown","reason":"..."}
```

Primary ranking requires quality `high|medium` and freshness `current|mixed`.

## 4. Ranking gates

```text
ranking_allowed =
  application_stage == PREPARE
  and every mandatory state in {confirmed, transferable}
  and current_status in {active, reposted}
  and hard_exclusion == false
  and Evidence Coverage >= 70
  and Evidence Quality >= medium
  and freshness in {current, mixed}
```

Eligible roles sort by unrounded Opportunity, then Match, then Coverage descending, then company ascending. Conditional and dropped roles remain visible without a numbered rank.

## 5. Sensitivity and robustness

The three named profiles are stored in the policy SSOT. The scorer also runs 10,000 deterministic weight perturbations:

```text
each base Opportunity weight × Uniform(0.5, 1.5), then renormalize to 100
```

Output includes top-frequency percentage and rank min/max/mean. This is robustness diagnostics, not statistical confidence.

Use [`derive_swing_weights.py`](../scripts/derive_swing_weights.py) and [`decision-validation.md`](decision-validation.md) to replace provisional simple weights with owner-confirmed swing weights.

## 6. Worked example

Synthetic values:

```text
Mandatory=100, Task=100, Production=100, Preferred=N/A,
Level=100, Domain=55,
Finance=100, Location=65, Hiring=100, Compensation=0
```

```text
J_raw = (100×45 + 100×20 + 100×15 + 100×8 + 55×4) / 92
      = 9,020 / 92
      = 98.043478... → 98.0

O_raw = (98.043478...×45 + 100×25 + 65×12 + 100×8 + 0×10) / 100
      = 8,491.9565... / 100
      = 84.919565... → 84.9

E = 10+25+5+15+10+10+10+8+0 = 93.0
```

The JSON output exposes every term, product, numerator, denominator, raw score, active ceiling, policy hash, and displayed value.

## 7. Validation boundary

- Keep scores frozen before application outcomes.
- Do not tune and evaluate on the same outcome records.
- Fewer than 30 outcomes or five interview-or-better outcomes remains `HOLD_INSUFFICIENT_OUTCOMES`.
- Never convert association into hiring probability.
- Recompute when JD, resume evidence, identity, finance, location/work policy, process, compensation, or profile policy changes.
