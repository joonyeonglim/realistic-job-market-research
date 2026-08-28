#!/usr/bin/env python3
"""Calculate transparent match, opportunity, confidence, and sensitivity scores."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from validate_profile import validate as validate_profile
from validate_review import sample_document, validate_document

POLICY_FILE = Path(__file__).resolve().parents[1] / "assets" / "scoring-policy.default.json"
POLICY_BYTES = POLICY_FILE.read_bytes()
POLICY = json.loads(POLICY_BYTES)
POLICY_HASH = hashlib.sha256(POLICY_BYTES).hexdigest()
CAPS = POLICY["caps"]


def rounded(value: float, digits: int = 1) -> float:
    quantum = Decimal("1").scaleb(-digits)
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def mean_match(items: list[dict], values: dict[str, float]) -> float | None:
    if not items:
        return None
    return sum(values[item["match"]] for item in items) / len(items)


def mandatory_match(items: list[dict], values: dict[str, float]) -> float:
    return min(values[item["match"]] for item in items)


def weighted_calculation(values: dict[str, float | None], weights: dict[str, float]) -> tuple[float, dict]:
    applicable = [(key, value) for key, value in values.items() if value is not None]
    denominator = sum(weights[key] for key, _ in applicable)
    if denominator <= 0:
        raise ValueError("no applicable weighted components")
    numerator = sum(value * weights[key] for key, value in applicable)
    return numerator / denominator, {
        "formula": "sum(component_score * weight) / applicable_weight_sum",
        "terms": {
            key: {
                "score": None if value is None else rounded(value, 4),
                "weight": weights[key],
                "product": None if value is None else rounded(value * weights[key], 4),
            }
            for key, value in values.items()
        },
        "numerator": rounded(numerator, 4),
        "denominator": denominator,
        "raw_score": rounded(numerator / denominator, 4),
    }


def weighted_score(values: dict[str, float | None], weights: dict[str, float]) -> float:
    return weighted_calculation(values, weights)[0]


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
        "mandatory_requirements": mandatory_match(must, match_values),
        "task_ownership": match_values[dimensions["task_ownership"]["match"]],
        "production_delivery": match_values[dimensions["production_delivery"]["match"]],
        "preferred_requirements": mean_match(preferred, match_values),
        "level_scope": match_values[dimensions["level_scope"]["match"]],
        "domain_onboarding": match_values[dimensions["domain_onboarding"]["match"]],
    }
    raw_match, match_calculation = weighted_calculation(match_components, scoring["match_weights"])
    must_states = [item["match"] for item in must]
    caps: list[str] = []
    match_ceiling = None
    match_cap_name = None
    if "missing" in must_states:
        match_ceiling = CAPS["mandatory_missing_match"]
        match_cap_name = "mandatory_missing_match_cap_59"
    elif "unknown" in must_states:
        match_ceiling = CAPS["mandatory_unknown_match"]
        match_cap_name = "mandatory_unknown_match_cap_74"
    match_score = min(raw_match, match_ceiling) if match_ceiling is not None else raw_match
    if match_ceiling is not None and raw_match > match_ceiling:
        caps.append(match_cap_name)
    match_calculation.update({
        "mandatory_aggregation": POLICY["mandatory_aggregation"],
        "active_ceiling": match_ceiling,
        "ceiling_binding": match_ceiling is not None and raw_match > match_ceiling,
        "final_score_unrounded": rounded(match_score, 4),
        "display_score": rounded(match_score, 1),
    })

    axis_values = scoring["axis_values"]
    opportunity_axes = {
        "match_score": match_score,
        "finance": axis_values["finance"][role["finance"]["grade"]],
        "location_work_policy": axis_values["location_work_policy"][role["location_work_policy"]["grade"]],
        "hiring_process": axis_values["hiring_process"][role["hiring_process"]["grade"]],
        "compensation_level": axis_values["compensation_level"][role["compensation"]["grade"]],
    }
    raw_opportunity, opportunity_calculation = weighted_calculation(opportunity_axes, scoring["opportunity_weights"])
    hard_exclusion = role["gates"]["hard_exclusion"]
    current_status = role["current_status"]
    opportunity_ceiling = None
    if hard_exclusion or current_status == "closed":
        opportunity_ceiling = CAPS["hard_gate_opportunity"]
        caps.append("hard_gate_opportunity_0")
    elif "missing" in must_states:
        opportunity_ceiling = CAPS["mandatory_missing_opportunity"]
        if raw_opportunity > opportunity_ceiling:
            caps.append("mandatory_missing_opportunity_cap_49")
    elif current_status == "ambiguous":
        opportunity_ceiling = CAPS["ambiguous_status_opportunity"]
        if raw_opportunity > opportunity_ceiling:
            caps.append("ambiguous_status_opportunity_cap_59")
    opportunity_score = min(raw_opportunity, opportunity_ceiling) if opportunity_ceiling is not None else raw_opportunity
    opportunity_calculation.update({
        "active_ceiling": opportunity_ceiling,
        "ceiling_binding": opportunity_ceiling is not None and raw_opportunity > opportunity_ceiling,
        "final_score_unrounded": rounded(opportunity_score, 4),
        "display_score": rounded(opportunity_score, 1),
    })

    resolved_must = sum(item["match"] != "unknown" for item in must) / len(must)
    resolved_preferred = 1 if not preferred else sum(item["match"] != "unknown" for item in preferred) / len(preferred)
    resolved_dimensions = sum(item["match"] != "unknown" for item in dimensions.values()) / len(dimensions)
    coverage_points = POLICY["coverage_points"]
    confidence_terms = {
        "posting_status_verified": coverage_points["posting_status_verified"] if current_status != "ambiguous" else 0,
        "mandatory_evidence_resolved": coverage_points["mandatory_evidence_resolved"] * resolved_must,
        "preferred_evidence_resolved": coverage_points["preferred_evidence_resolved"] * resolved_preferred,
        "fit_dimensions_resolved": coverage_points["fit_dimensions_resolved"] * resolved_dimensions,
        "company_identity_confirmed": coverage_points["company_identity_confirmed"] if role["company_identity"]["status"] == "confirmed" else 0,
        "finance_verified": coverage_points["finance_verified"] if role["finance"]["grade"] != "UNVERIFIED" else 0,
        "location_work_policy_known": coverage_points["location_work_policy_known"] if role["location_work_policy"]["grade"] != "unknown" else 0,
        "hiring_process_known": coverage_points["hiring_process_known"] if role["hiring_process"]["grade"] != "UNKNOWN" else 0,
        "compensation_confirmed": coverage_points["compensation_confirmed"] if role["compensation"]["status"] == "confirmed" and role["compensation"]["grade"] != "unknown" else 0,
    }
    confidence = sum(confidence_terms.values())
    confidence_calculation = {
        "formula": "sum(evidence_points)",
        "resolved_ratios": {
            "mandatory_requirements": rounded(resolved_must, 4),
            "preferred_requirements": rounded(resolved_preferred, 4),
            "fit_dimensions": rounded(resolved_dimensions, 4),
        },
        "terms": {key: rounded(value, 4) for key, value in confidence_terms.items()},
        "raw_score": rounded(confidence, 4),
        "display_score": rounded(confidence, 1),
    }

    warnings = []
    evidence_quality_values = {"high": 100, "medium": 70, "low": 40, "unverified": 0}
    evidence_quality_score = evidence_quality_values[role["evidence_quality"]["grade"]]
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
    if role["evidence_quality"]["freshness"] in {"stale", "unknown"}:
        warnings.append("evidence freshness is insufficient")
    threshold = scoring["confidence_threshold"]
    ranking_allowed = (
        confidence >= threshold
        and not hard_exclusion
        and current_status in {"active", "reposted"}
        and role["application_stage"] == POLICY["ranking"]["application_stage"]
        and all(state in POLICY["ranking"]["mandatory_states"] for state in must_states)
        and evidence_quality_score >= 70
        and role["evidence_quality"]["freshness"] in {"current", "mixed"}
    )
    if confidence < threshold:
        warnings.append(f"evidence confidence below {threshold}")

    sensitivity = {}
    sensitivity_raw = {}
    for name, weights in scoring["sensitivity_profiles"].items():
        value = weighted_score(opportunity_axes, weights)
        if hard_exclusion or current_status == "closed":
            value = 0
        elif "missing" in must_states:
            value = min(value, 49)
        elif current_status == "ambiguous":
            value = min(value, 59)
        sensitivity_raw[name] = value
        sensitivity[name] = rounded(value, 1)

    return {
        "company": role["company"],
        "title": role["title"],
        "url": role["url"],
        "current_status": current_status,
        "application_stage": role["application_stage"],
        "offer_stage": role["offer_stage"],
        "match_score": rounded(match_score, 1),
        "match_band": band(match_score, POLICY["bands"]["match"]),
        "match_components": {key: None if value is None else rounded(value, 1) for key, value in match_components.items()},
        "match_calculation": match_calculation,
        "opportunity_score": rounded(opportunity_score, 1),
        "opportunity_band": band(opportunity_score, POLICY["bands"]["opportunity"]),
        "opportunity_axes": {key: rounded(value, 1) for key, value in opportunity_axes.items()},
        "opportunity_calculation": opportunity_calculation,
        "evidence_coverage": rounded(confidence, 1),
        "coverage_band": band(confidence, POLICY["bands"]["coverage"]),
        "evidence_confidence": rounded(confidence, 1),
        "confidence_band": band(confidence, POLICY["bands"]["coverage"]),
        "confidence_calculation": confidence_calculation,
        "coverage_calculation": confidence_calculation,
        "evidence_quality": role["evidence_quality"],
        "evidence_quality_score": evidence_quality_score,
        "ranking_allowed": ranking_allowed,
        "caps": caps,
        "gate_reasons": role["gates"]["reasons"],
        "warnings": warnings,
        "sensitivity": sensitivity,
        "decision_reason": role["decision_reason"],
        "unknowns": role["unknowns"],
        "resume_actions": role["resume_actions"],
        "evidence": role["evidence"],
        "_sort": {
            "match": match_score,
            "opportunity": opportunity_score,
            "confidence": confidence,
            "sensitivity": sensitivity_raw,
            "axes": opportunity_axes,
        },
    }


def robust_ranking(roles: list[dict], scoring: dict) -> dict:
    eligible = [role for role in roles if role["ranking_allowed"]]
    config = POLICY["robustness"]
    if not eligible:
        return {"samples": config["samples"], "eligible_roles": 0, "top_frequency": {}, "rank_ranges": {}}
    rng = random.Random(config["seed"])
    base = scoring["opportunity_weights"]
    keys = list(base)
    stats = {(role["company"], role["title"], role["url"]): {"top": 0, "ranks": []} for role in eligible}
    for _ in range(config["samples"]):
        varied = {key: base[key] * rng.uniform(config["weight_multiplier_min"], config["weight_multiplier_max"]) for key in keys}
        total = sum(varied.values())
        weights = {key: value * 100 / total for key, value in varied.items()}
        sampled = []
        for role in eligible:
            value = sum(role["_sort"]["axes"][key] * weights[key] for key in keys) / 100
            ceiling = role["opportunity_calculation"]["active_ceiling"]
            if ceiling is not None:
                value = min(value, ceiling)
            sampled.append((value, role["_sort"]["match"], role["_sort"]["confidence"], role["company"], role))
        sampled.sort(key=lambda item: (-item[0], -item[1], -item[2], item[3]))
        for rank, item in enumerate(sampled, 1):
            role = item[-1]
            key = (role["company"], role["title"], role["url"])
            stats[key]["ranks"].append(rank)
            if rank == 1:
                stats[key]["top"] += 1
    top_frequency = {}
    rank_ranges = {}
    for role in eligible:
        key = (role["company"], role["title"], role["url"])
        item = stats[key]
        role["robustness"] = {
            "top_frequency_pct": rounded(item["top"] * 100 / config["samples"], 2),
            "rank_min": min(item["ranks"]),
            "rank_max": max(item["ranks"]),
            "rank_mean": rounded(sum(item["ranks"]) / len(item["ranks"]), 2),
        }
        label = f"{role['company']} — {role['title']}"
        top_frequency[label] = role["robustness"]["top_frequency_pct"]
        rank_ranges[label] = {key: role["robustness"][key] for key in ("rank_min", "rank_max", "rank_mean")}
    return {
        "method": "independent uniform multiplicative perturbation followed by weight renormalization",
        **config,
        "eligible_roles": len(eligible),
        "top_frequency": top_frequency,
        "rank_ranges": rank_ranges,
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
    exclusions = {str(value).strip().lower() for value in profile["preferences"]["hard_exclusions"]}
    avoid_chronic_loss = "avoid established chronic-loss" in profile["preferences"]["finance_policy"].lower()
    for role in review["roles"]:
        flag_gate = any(str(flag).strip().lower() in exclusions for flag in role["policy_flags"])
        finance_gate = avoid_chronic_loss and role["finance"]["grade"] == "D"
        if role["gates"]["hard_exclusion"] != (flag_gate or finance_gate):
            raise ValueError(f"{role['company']} {role['title']}: hard_exclusion does not match profile policy flags/finance policy")
    scoring = profile["scoring"]
    roles = [score_role(role, scoring) for role in review["roles"]]
    roles.sort(key=lambda role: (not role["ranking_allowed"], -role["_sort"]["opportunity"], -role["_sort"]["match"], -role["_sort"]["confidence"], role["company"]))
    for index, role in enumerate(roles, 1):
        role["rank"] = index if role["ranking_allowed"] else None
        role["sensitivity_rank"] = {}
    sensitivity_rankings = {}
    for name in scoring["sensitivity_profiles"]:
        ranked = sorted(
            (role for role in roles if role["ranking_allowed"]),
            key=lambda role: (-role["_sort"]["sensitivity"][name], -role["_sort"]["match"], -role["_sort"]["confidence"], role["company"]),
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
    robustness = robust_ranking(roles, scoring)
    for role in roles:
        role.pop("_sort")
    return {
        "schema_version": 1,
        "scored_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "as_of": review["as_of"],
        "candidate_profile_version": review["candidate_profile_version"],
        "score_model_version": scoring["model_version"],
        "score_policy_sha256": POLICY_HASH,
        "weights": {
            "match": scoring["match_weights"],
            "opportunity": scoring["opportunity_weights"],
            "sensitivity": scoring["sensitivity_profiles"],
        },
        "calculation_policy": {
            "match_values": scoring["match_values"],
            "axis_values": scoring["axis_values"],
            "caps": CAPS,
            "bands": POLICY["bands"],
            "mandatory_aggregation": POLICY["mandatory_aggregation"],
            "confidence_threshold": scoring["confidence_threshold"],
            "rounding": POLICY["rounding"],
            "tie_break": "opportunity, then match, then confidence descending; company ascending",
        },
        "scope": review["scope"],
        "sensitivity_rankings": sensitivity_rankings,
        "robustness": robustness,
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
    assert role["match_calculation"]["numerator"] == 9020
    assert role["match_calculation"]["denominator"] == 92
    assert role["match_calculation"]["raw_score"] == 98.0435
    assert role["opportunity_calculation"]["raw_score"] == 84.9196
    assert role["confidence_calculation"]["raw_score"] == 93
    assert role["ranking_allowed"] is True
    assert role["sensitivity_rank"] == {"fit_first": 1}

    review = sample_document()
    review["roles"][0]["requirements"]["must_have"].append({
        "requirement": "Synthetic missing requirement",
        "candidate_evidence": "No evidence",
        "match": "missing",
    })
    review["roles"][0]["application_stage"] = "DROP"
    result = score_document(review, sample_profile())
    role = result["roles"][0]
    assert role["match_calculation"]["raw_score"] == 49.1304
    assert role["match_calculation"]["active_ceiling"] == 59
    assert role["match_calculation"]["ceiling_binding"] is False
    assert role["match_score"] == 49.1
    assert role["opportunity_calculation"]["raw_score"] == 62.9087
    assert role["opportunity_calculation"]["active_ceiling"] == 49
    assert role["opportunity_score"] == 49

    review = sample_document()
    review["roles"][0]["gates"] = {"hard_exclusion": True, "reasons": ["synthetic exclusion"]}
    review["roles"][0]["policy_flags"] = ["excluded domain"]
    review["roles"][0]["application_stage"] = "DROP"
    review["roles"][0]["offer_stage"] = "NO_GO"
    result = score_document(review, sample_profile())
    assert result["roles"][0]["opportunity_score"] == 0
    assert result["roles"][0]["ranking_allowed"] is False
    assert band(84.96, [(85, "STRONG"), (70, "SOLID"), (0, "WEAK")]) == "SOLID"
    assert rounded(84.95) == 85.0
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
