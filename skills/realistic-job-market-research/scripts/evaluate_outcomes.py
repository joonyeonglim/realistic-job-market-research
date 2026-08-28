#!/usr/bin/env python3
"""Audit prospective job-search outcomes without claiming hiring probabilities."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

from privacy_scan import scan

OUTCOMES = {"not_applied": 0, "no_response": 0, "response": 1, "interview": 2, "offer": 3, "accepted": 4, "withdrawn": 0}


def ranks(values: list[float]) -> list[float]:
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[index]]:
            end += 1
        rank = (index + end - 1) / 2 + 1
        for position in ordered[index:end]:
            result[position] = rank
        index = end
    return result


def correlation(left: list[float], right: list[float]) -> float | None:
    if len(left) < 2:
        return None
    a, b = ranks(left), ranks(right)
    mean_a, mean_b = sum(a) / len(a), sum(b) / len(b)
    numerator = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    denominator = math.sqrt(sum((x - mean_a) ** 2 for x in a) * sum((y - mean_b) ** 2 for y in b))
    return None if denominator == 0 else numerator / denominator


def evaluate(document: object) -> dict:
    errors = scan(document)
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        errors.append("$: expected schema_version=1 object")
        document = {}
    records = document.get("records")
    if not isinstance(records, list):
        errors.append("$.records: expected array")
        records = []
    seen = set()
    for index, record in enumerate(records):
        path = f"$.records[{index}]"
        if not isinstance(record, dict):
            errors.append(f"{path}: expected object")
            continue
        for field in ("role_key", "scored_at", "opportunity_band", "outcome", "outcome_recorded_at"):
            if not isinstance(record.get(field), str) or not record[field]:
                errors.append(f"{path}.{field}: expected non-empty string")
        score = record.get("opportunity_score")
        if not isinstance(score, (int, float)) or isinstance(score, bool) or not math.isfinite(score) or not 0 <= score <= 100:
            errors.append(f"{path}.opportunity_score: expected finite 0..100")
        if record.get("outcome") not in OUTCOMES:
            errors.append(f"{path}.outcome: unsupported outcome")
        key = (record.get("role_key"), record.get("scored_at"))
        if key in seen:
            errors.append(f"{path}: duplicate prospective score record")
        seen.add(key)
    if errors:
        raise ValueError("\n".join(errors))
    counts = Counter(record["outcome"] for record in records)
    by_band = defaultdict(Counter)
    for record in records:
        by_band[record["opportunity_band"]][record["outcome"]] += 1
    positive_interviews = sum(counts[outcome] for outcome in ("interview", "offer", "accepted"))
    status = "READY_FOR_VALIDITY_REVIEW" if len(records) >= 30 and positive_interviews >= 5 else "HOLD_INSUFFICIENT_OUTCOMES"
    rho = correlation([float(record["opportunity_score"]) for record in records], [float(OUTCOMES[record["outcome"]]) for record in records])
    return {
        "schema_version": 1,
        "status": status,
        "records": len(records),
        "positive_interview_or_better": positive_interviews,
        "outcome_counts": dict(sorted(counts.items())),
        "band_counts": {band: dict(sorted(values.items())) for band, values in sorted(by_band.items())},
        "spearman_score_vs_outcome_ordinal": None if rho is None else round(rho, 4),
        "limitations": ["Association is not hiring probability or causal validity.", "Keep scores frozen before outcomes and do not tune on the same records used for evaluation."],
    }


def self_test() -> int:
    document = json.loads((Path(__file__).resolve().parents[1] / "assets" / "outcomes.example.json").read_text(encoding="utf-8"))
    result = evaluate(document)
    assert result["status"] == "HOLD_INSUFFICIENT_OUTCOMES"
    assert result["records"] == 2
    print("OUTCOME_EVAL_SELF_TEST_PASS")
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
        result = evaluate(json.loads(args.input.read_text(encoding="utf-8")))
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
