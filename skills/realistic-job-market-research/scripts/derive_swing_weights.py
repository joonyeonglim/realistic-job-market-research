#!/usr/bin/env python3
"""Normalize a documented swing-weight elicitation without mutating the profile."""

from __future__ import annotations

import argparse
import json
import math
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from privacy_scan import scan

CRITERIA = ("match_score", "finance", "location_work_policy", "hiring_process", "compensation_level")


def derive(document: object) -> dict:
    errors = scan(document)
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        errors.append("$: expected schema_version=1 object")
        document = {}
    if document.get("method") != "swing_weighting":
        errors.append("$.method: expected swing_weighting")
    criteria = document.get("criteria")
    if not isinstance(criteria, dict) or set(criteria) != set(CRITERIA):
        errors.append(f"$.criteria: expected {list(CRITERIA)}")
        criteria = {}
    raw = {}
    for key in CRITERIA:
        item = criteria.get(key, {}) if isinstance(criteria, dict) else {}
        value = item.get("raw_weight") if isinstance(item, dict) else None
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
            errors.append(f"$.criteria.{key}.raw_weight: expected positive finite number")
        else:
            raw[key] = Decimal(str(value))
        if not isinstance(item, dict) or not isinstance(item.get("rationale"), str) or not item["rationale"].strip():
            errors.append(f"$.criteria.{key}.rationale: expected non-empty string")
    if errors:
        raise ValueError("\n".join(errors))
    total = sum(raw.values())
    weights = {key: (raw[key] * Decimal(100) / total).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP) for key in CRITERIA}
    weights[CRITERIA[-1]] += Decimal(100) - sum(weights.values())
    return {
        "schema_version": 1,
        "method": "swing_weighting",
        "elicited_at": document.get("elicited_at"),
        "opportunity_weights": {key: float(value) for key, value in weights.items()},
        "rationales": {key: criteria[key]["rationale"] for key in CRITERIA},
    }


def self_test() -> int:
    document = {"schema_version": 1, "method": "swing_weighting", "elicited_at": "2030-01-01", "criteria": {key: {"raw_weight": value, "rationale": key} for key, value in zip(CRITERIA, (100, 50, 25, 15, 10))}}
    result = derive(document)
    assert abs(sum(result["opportunity_weights"].values()) - 100) < 1e-9
    assert result["opportunity_weights"]["match_score"] == 50
    print("SWING_WEIGHT_SELF_TEST_PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.input:
        parser.error("input is required")
    try:
        result = derive(json.loads(args.input.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
