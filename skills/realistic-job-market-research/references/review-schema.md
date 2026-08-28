# Review JSON Schema

`scripts/validate_review.py` validates this contract with the Python standard library.

## Root

```json
{
  "schema_version": 1,
  "as_of": "2000-01-15",
  "candidate_profile_version": "profile-v3",
  "scope": {
    "kind": "named_shortlist",
    "statement": "Six named product-AI roles",
    "coverage_limits": ["No claim of market-wide completeness"]
  },
  "roles": []
}
```

`scope.kind` is `named_shortlist`, `audited_ledger`, or `update_correction`.

## Required role fields

- `company`, `title`, `url`;
- `current_status`: `active | closed | ambiguous | reposted`;
- `requirements.must_have[]` and `requirements.preferred[]`: `requirement`, `candidate_evidence`, and `match`;
- `fit`: `level` (`high | medium | low`), `reason`, and four scored dimensions: `task_ownership`, `production_delivery`, `level_scope`, and `domain_onboarding`; each dimension has `match` and `reason`;
- `gates`: `hard_exclusion` boolean and `reasons[]`;
- `policy_flags[]`: structured strings checked against profile hard exclusions; finance `D` is checked against the profile chronic-loss policy;
- `evidence_quality`: `grade` (`high | medium | low | unverified`), `freshness` (`current | mixed | stale | unknown`), and reason;
- `company_identity`: `status` (`confirmed | unverified`), `matched_fields[]`, `evidence[]`;
- `finance`: `grade` (`A | B | C | D | UNVERIFIED`), `as_of`, `facts[]`, `evidence[]`;
- `location_work_policy`: `grade` (`good | acceptable | poor | unknown`), `facts[]`, `evidence[]`;
- `hiring_process`: `grade` (`F0 | F1 | F2 | F3 | UNKNOWN`), `steps[]`, `evidence[]`;
- `compensation`: `status` (`confirmed | unknown`), `grade` (`good | acceptable | poor | unknown`), `facts[]`, and `evidence[]`;
- `application_stage`: `PREPARE | CONDITIONAL | DROP`;
- `offer_stage`: `PASS | HOLD | NO_GO`;
- `decision_reason`, `unknowns[]`, `resume_actions[]`, and top-level `evidence[]`.

Evidence items are HTTP(S) URLs. `candidate_evidence` may be `UNKNOWN` but must never be invented.

## Validator invariants

- Closed roles cannot be `PREPARE` or offer-stage `PASS`.
- A hard exclusion requires `DROP / NO_GO`.
- A missing or unknown mandatory requirement cannot be `PREPARE`.
- Confirmed identity requires at least two distinct canonical 2-of-4 fields and supporting evidence.
- Known finance, location, and hiring grades require facts/steps, strict dates where applicable, and evidence.
- Duplicate company/title/URL roles are rejected.
- Unverified legal identity requires finance `UNVERIFIED`.
- Offer-stage `PASS` requires an active role, confirmed identity and compensation, verified finance, known location or work policy and hiring process, and no `missing` or `unknown` mandatory requirement.
- Recruiter contact fields are rejected.

## Scoring output

`scripts/score_review.py` preserves role identity and decisions, then adds:

- `match_score`, `match_band`, and component scores;
- `opportunity_score`, `opportunity_band`, and axis scores;
- `evidence_coverage`, coverage band, evidence quality, and freshness; deprecated `evidence_confidence` remains as a compatibility alias only;
- `match_calculation`, `opportunity_calculation`, and `confidence_calculation`, including every numeric term, numerator, denominator, raw value, active ceiling, and displayed value;
- caps, gate warnings, and `ranking_allowed`;
- alternative Opportunity Scores and ranks plus 10,000-run deterministic robustness ranges.

Portable generated schemas live in `schemas/`; `scripts/generate-schemas.mjs` is their generator and drift gate.

See [scoring-model.md](scoring-model.md) for formulas and interpretation.
