# Decision Validation

## Preference weights

Use `assets/swing-weights.example.json` as a private worksheet, then run:

```bash
python3 scripts/derive_swing_weights.py assets/swing-weights.example.json
```

Copy the normalized result into a new profile version only after the owner confirms every rationale. `owner_policy_provisional` remains honest until then.

## Prospective outcomes

Freeze the score before applying. Record only a de-identified role hash, frozen score, band, timestamps, and coarse outcome in the private outcome log. Never add recruiter contacts or private messages.

```bash
python3 scripts/evaluate_outcomes.py /private/path/outcomes.json
```

Fewer than 30 records or fewer than five interview-or-better outcomes is `HOLD_INSUFFICIENT_OUTCOMES`. Even after that gate, correlation is not a hiring probability or causal validity result. Use a separate future holdout before changing model parameters.
