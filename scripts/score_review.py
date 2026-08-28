#!/usr/bin/env python3
"""Calculate transparent match, opportunity, confidence, and sensitivity scores."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from validate_profile import validate as validate_profile
from validate_review import sample_document, validate_document


def mean_match(items: list[dict], values: dict[str, float]) -> float | None:
    if not items:
        return None
    return sum(values[item["match"]] for item in items) / len(items)


def weighted_score(values: dict[str, float | None], weights: dict[str, float]) -> float:
    applicable = [(key, value) for key, value in values.items() if value is not None]
    denominator = sum(weights[key] for key, _ in applicable)
    if denominator <= 0:
        raise ValueError("no applicable weighted components")
    return sum(value * weights[key] for key, value in applicable) / denominator


def band(value: float, thresholds: list[tuple[float, str]]) -> str:
    for minimum, label in thresholds:
        if value >= minimum:
            return label
    return thresholds[-1][1]


def score_role(role: dict, scoring: dict) -> dict:
    match_values = scoring["match_values"]
    must = role["requirements"]["must_have"]
    preferred = role["requirements"]["preferred"]
    dimensions = role["fit"]["dimensions"]
    match_components = {
        "mandatory_requirements": mean_match(must, match_values),
        "task_ownership": match_values[dimensions["task_ownership"]["match"]],
        "production_delivery": match_values[dimensions["production_delivery"]["match"]],
        "preferred_requirements": mean_match(preferred, match_values),
        "level_scope": match_values[dimensions["level_scope"]["match"]],
        "domain_onboarding": match_values[dimensions["domain_onboarding"]["match"]],
    }
    raw_match = weighted_score(match_components, scoring["match_weights"])
    must_states = [item["match"] for item in must]
    caps: list[str] = []
    match_score = raw_match
    if "missing" in must_states and match_score > 59:
        match_score = 59
        caps.append("mandatory_missing_match_cap_59")
    elif "unknown" in must_states and match_score > 74:
        match_score = 74
        caps.append("mandatory_unknown_match_cap_74")

    axis_values = scoring["axis_values"]
    opportunity_axes = {
        "match_score": match_score,
        "finance": axis_values["finance"][role["finance"]["grade"]],
        "location_work_policy": axis_values["location_work_policy"][role["location_work_policy"]["grade"]],
        "hiring_process": axis_values["hiring_process"][role["hiring_process"]["grade"]],
        "compensation_level": axis_values["compensation_level"][role["compensation"]["grade"]],
    }
    opportunity_score = weighted_score(opportunity_axes, scoring["opportunity_weights"])
    hard_exclusion = role["gates"]["hard_exclusion"]
    current_status = role["current_status"]
    if hard_exclusion or current_status == "closed":
        opportunity_score = 0
        caps.append("hard_gate_opportunity_0")
    elif "missing" in must_states and opportunity_score > 49:
        opportunity_score = 49
        caps.append("mandatory_missing_opportunity_cap_49")
    elif current_status == "ambiguous" and opportunity_score > 59:
        opportunity_score = 59
        caps.append("ambiguous_status_opportunity_cap_59")

    resolved_must = sum(item["match"] != "unknown" for item in must) / len(must)
    resolved_preferred = 1 if not preferred else sum(item["match"] != "unknown" for item in preferred) / len(preferred)
    resolved_dimensions = sum(item["match"] != "unknown" for item in dimensions.values()) / len(dimensions)
    confidence = (
        (10 if current_status != "ambiguous" else 0)
        + 25 * resolved_must
        + 5 * resolved_preferred
        + 15 * resolved_dimensions
        + (10 if role["company_identity"]["status"] == "confirmed" else 0)
        + (10 if role["finance"]["grade"] != "UNVERIFIED" else 0)
        + (10 if role["location_work_policy"]["grade"] != "unknown" else 0)
        + (8 if role["hiring_process"]["grade"] != "UNKNOWN" else 0)
        + (7 if role["compensation"]["status"] == "confirmed" and role["compensation"]["grade"] != "unknown" else 0)
    )

    warnings = []
    if hard_exclusion:
        warnings.append("hard exclusion applies")
    if current_status == "closed":
        warnings.append("posting is closed")
    if "missing" in must_states:
        warnings.append("mandatory requirement is missing")
    if "unknown" in must_states:
        warnings.append("mandatory requirement evidence is unknown")
    if role["finance"]["grade"] == "UNVERIFIED":
        warnings.append("finance is unverified")
    if role["compensation"]["grade"] == "unknown":
        warnings.append("compensation is unknown")
    threshold = scoring["confidence_threshold"]
    ranking_allowed = (
        confidence >= threshold
        and not hard_exclusion
        and current_status in {"active", "reposted"}
        and role["application_stage"] != "DROP"
    )
    if confidence < threshold:
        warnings.append(f"evidence confidence below {threshold}")

    sensitivity = {}
    for name, weights in scoring["sensitivity_profiles"].items():
        value = weighted_score(opportunity_axes, weights)
        if hard_exclusion or current_status == "closed":
            value = 0
        elif "missing" in must_states:
            value = min(value, 49)
        elif current_status == "ambiguous":
            value = min(value, 59)
        sensitivity[name] = round(value, 1)

    match_score = round(match_score, 1)
    opportunity_score = round(opportunity_score, 1)
    confidence = round(confidence, 1)
    return {
        "company": role["company"],
        "title": role["title"],
        "url": role["url"],
        "current_status": current_status,
        "application_stage": role["application_stage"],
        "offer_stage": role["offer_stage"],
        "match_score": match_score,
        "match_band": band(match_score, [(85, "STRONG"), (70, "SOLID"), (55, "CONDITIONAL"), (0, "WEAK")]),
        "match_components": {key: None if value is None else round(value, 1) for key, value in match_components.items()},
        "opportunity_score": opportunity_score,
        "opportunity_band": band(opportunity_score, [(80, "HIGH_PRIORITY"), (65, "VIABLE"), (50, "CONDITIONAL"), (0, "LOW")]),
        "opportunity_axes": {key: round(value, 1) for key, value in opportunity_axes.items()},
        "evidence_confidence": confidence,
        "confidence_band": band(confidence, [(85, "HIGH"), (70, "USABLE"), (50, "THIN"), (0, "INSUFFICIENT")]),
        "ranking_allowed": ranking_allowed,
        "caps": caps,
        "gate_reasons": role["gates"]["reasons"],
        "warnings": warnings,
        "sensitivity": sensitivity,
        "decision_reason": role["decision_reason"],
        "unknowns": role["unknowns"],
        "resume_actions": role["resume_actions"],
        "evidence": role["evidence"],
    }


def score_document(review: dict, profile: dict) -> dict:
    review_errors = validate_document(review)
    if review_errors:
        raise ValueError("invalid review:\n" + "\n".join(review_errors))
    profile_errors = validate_profile(profile)
    if profile_errors:
        raise ValueError("invalid profile:\n" + "\n".join(profile_errors))
    if review["candidate_profile_version"] != profile["profile_version"]:
        raise ValueError("candidate_profile_version does not match the supplied profile")
    scoring = profile["scoring"]
    roles = [score_role(role, scoring) for role in review["roles"]]
    roles.sort(key=lambda role: (not role["ranking_allowed"], -role["opportunity_score"], -role["match_score"], -role["evidence_confidence"], role["company"]))
    for index, role in enumerate(roles, 1):
        role["rank"] = index if role["ranking_allowed"] else None
        role["sensitivity_rank"] = {}
    sensitivity_rankings = {}
    for name in scoring["sensitivity_profiles"]:
        ranked = sorted(
            (role for role in roles if role["ranking_allowed"]),
            key=lambda role: (-role["sensitivity"][name], -role["match_score"], -role["evidence_confidence"], role["company"]),
        )
        sensitivity_rankings[name] = [
            {"company": role["company"], "title": role["title"], "url": role["url"]}
            for role in ranked
        ]
        ranks = {
            (role["company"], role["title"], role["url"]): index
            for index, role in enumerate(ranked, 1)
        }
        for role in roles:
            role["sensitivity_rank"][name] = ranks.get((role["company"], role["title"], role["url"]))
    return {
        "schema_version": 1,
        "scored_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "as_of": review["as_of"],
        "candidate_profile_version": review["candidate_profile_version"],
        "score_model_version": scoring["model_version"],
        "weights": {
            "match": scoring["match_weights"],
            "opportunity": scoring["opportunity_weights"],
            "sensitivity": scoring["sensitivity_profiles"],
        },
        "scope": review["scope"],
        "sensitivity_rankings": sensitivity_rankings,
        "roles": roles,
    }


def self_test() -> int:
    from validate_profile import sample as sample_profile

    review = sample_document()
    result = score_document(review, sample_profile())
    role = result["roles"][0]
    assert role["match_score"] == 98.0
    assert role["opportunity_score"] == 84.9
    assert role["evidence_confidence"] == 93.0
    assert role["ranking_allowed"] is True
    assert role["sensitivity_rank"] == {"fit_first": 1}

    review = sample_document()
    review["roles"][0]["requirements"]["must_have"][0]["match"] = "missing"
    review["roles"][0]["application_stage"] = "DROP"
    result = score_document(review, sample_profile())
    assert result["roles"][0]["match_score"] <= 59
    assert result["roles"][0]["opportunity_score"] <= 49

    review = sample_document()
    review["roles"][0]["gates"] = {"hard_exclusion": True, "reasons": ["synthetic exclusion"]}
    review["roles"][0]["application_stage"] = "DROP"
    review["roles"][0]["offer_stage"] = "NO_GO"
    result = score_document(review, sample_profile())
    assert result["roles"][0]["opportunity_score"] == 0
    assert result["roles"][0]["ranking_allowed"] is False
    print("SELF_TEST_PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.input is None or args.profile is None:
        parser.error("--input and --profile are required unless --self-test is used")
    try:
        review = json.loads(args.input.expanduser().read_text(encoding="utf-8"))
        profile = json.loads(args.profile.expanduser().read_text(encoding="utf-8"))
        result = score_document(review, profile)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
