# Review JSON Schema

`scripts/validate_review.py` validates this contract with the Python standard library.

## Root

```json
{
  "schema_version": 1,
  "as_of": "2030-01-15",
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
- `requirements.must_have[]`: `requirement`, `candidate_evidence`, and `match`;
- `fit`: `level` (`high | medium | low`) and `reason`;
- `company_identity`: `status` (`confirmed | unverified`), `matched_fields[]`, `evidence[]`;
- `finance`: `grade` (`A | B | C | D | UNVERIFIED`), `as_of`, `facts[]`, `evidence[]`;
- `location_work_policy`: `grade` (`good | acceptable | poor | unknown`), `facts[]`, `evidence[]`;
- `hiring_process`: `grade` (`F0 | F1 | F2 | F3 | UNKNOWN`), `steps[]`, `evidence[]`;
- `compensation`: `status` (`confirmed | unknown`), `facts[]`, `evidence[]`;
- `application_stage`: `PREPARE | CONDITIONAL | DROP`;
- `offer_stage`: `PASS | HOLD | NO_GO`;
- `decision_reason`, `unknowns[]`, `resume_actions[]`, and top-level `evidence[]`.

Evidence items are HTTP(S) URLs. `candidate_evidence` may be `UNKNOWN` but must never be invented.

## Validator invariants

- Closed roles cannot be `PREPARE` or offer-stage `PASS`.
- Unverified legal identity requires finance `UNVERIFIED`.
- Offer-stage `PASS` requires an active role, confirmed identity and compensation, verified finance, known location or work policy and hiring process, and no `missing` or `unknown` mandatory requirement.
- Recruiter contact fields are rejected.
