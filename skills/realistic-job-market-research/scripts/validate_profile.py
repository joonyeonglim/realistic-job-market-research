#!/usr/bin/env python3
"""Validate the private candidate profile used by census and scan modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

from privacy_scan import scan as scan_private_content

POLICY = json.loads((Path(__file__).resolve().parents[1] / "assets" / "scoring-policy.default.json").read_text(encoding="utf-8"))


ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
def walk_forbidden(value: object, prefix: str = "$") -> list[str]:
    return scan_private_content(value, prefix)


def nonempty_list(parent: dict, key: str, path: str, errors: list[str]) -> list:
    value = parent.get(key)
    if not isinstance(value, list) or not value:
        errors.append(f"{path}.{key}: expected non-empty array")
        return []
    return value


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_weights(value: object, path: str, expected_keys: set[str], errors: list[str]) -> None:
    if not isinstance(value, dict) or set(value) != expected_keys:
        errors.append(f"{path}: expected keys {sorted(expected_keys)}")
        return
    if any(not is_number(weight) or weight < 0 for weight in value.values()):
        errors.append(f"{path}: weights must be non-negative numbers")
        return
    if abs(sum(value.values()) - 100) > 1e-9:
        errors.append(f"{path}: weights must sum to 100")


def validate_score_map(value: object, path: str, expected_keys: set[str], errors: list[str]) -> None:
    if not isinstance(value, dict) or set(value) != expected_keys:
        errors.append(f"{path}: expected keys {sorted(expected_keys)}")
        return
    if any(not is_number(score) or not 0 <= score <= 100 for score in value.values()):
        errors.append(f"{path}: scores must be numbers from 0 to 100")


def validate(profile: object, check_sources: bool = False) -> list[str]:
    errors = walk_forbidden(profile)
    if not isinstance(profile, dict):
        return errors + ["$: expected object"]
    if profile.get("schema_version") != 1:
        errors.append("$.schema_version: expected 1")
    if not isinstance(profile.get("profile_version"), str) or not profile["profile_version"].strip():
        errors.append("$.profile_version: expected non-empty string")
    if not isinstance(profile.get("captured_at"), str) or not ISO_RE.fullmatch(profile["captured_at"]):
        errors.append("$.captured_at: expected ISO-8601 timestamp")
    if not isinstance(profile.get("career_years"), (int, float)) or profile["career_years"] <= 0:
        errors.append("$.career_years: expected positive number")

    candidate = profile.get("candidate")
    if not isinstance(candidate, dict):
        errors.append("$.candidate: expected object")
        candidate = {}
    nonempty_list(candidate, "target_roles", "$.candidate", errors)
    nonempty_list(candidate, "proven_strengths", "$.candidate", errors)
    nonempty_list(candidate, "known_gaps", "$.candidate", errors)
    for field in ("defensible_level", "degree"):
        if not isinstance(candidate.get(field), str) or not candidate[field].strip():
            errors.append(f"$.candidate.{field}: expected non-empty string")

    scoring = profile.get("scoring")
    if not isinstance(scoring, dict):
        errors.append("$.scoring: expected object")
        scoring = {}
    if not isinstance(scoring.get("model_version"), str) or not scoring.get("model_version", "").strip():
        errors.append("$.scoring.model_version: expected non-empty string")
    elif scoring["model_version"] != POLICY["model_version"]:
        errors.append(f"$.scoring.model_version: expected {POLICY['model_version']}")
    for field in ("policy_source", "weight_method", "elicited_at", "rationale"):
        if not isinstance(scoring.get(field), str) or not scoring[field].strip():
            errors.append(f"$.scoring.{field}: expected non-empty string")
    if isinstance(scoring.get("elicited_at"), str) and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", scoring["elicited_at"]):
        errors.append("$.scoring.elicited_at: expected YYYY-MM-DD")
    match_keys = {"mandatory_requirements", "task_ownership", "production_delivery", "preferred_requirements", "level_scope", "domain_onboarding"}
    opportunity_keys = {"match_score", "finance", "location_work_policy", "hiring_process", "compensation_level"}
    validate_weights(scoring.get("match_weights"), "$.scoring.match_weights", match_keys, errors)
    validate_weights(scoring.get("opportunity_weights"), "$.scoring.opportunity_weights", opportunity_keys, errors)
    validate_score_map(scoring.get("match_values"), "$.scoring.match_values", {"confirmed", "transferable", "missing", "unknown"}, errors)
    match_values = scoring.get("match_values", {})
    if isinstance(match_values, dict) and set(match_values) == {"confirmed", "transferable", "missing", "unknown"} and not (
        match_values["confirmed"] == 100 > match_values["transferable"] > match_values["missing"] == match_values["unknown"] == 0
    ):
        errors.append("$.scoring.match_values: expected confirmed=100 > transferable > missing=unknown=0")
    axis_values = scoring.get("axis_values")
    if not isinstance(axis_values, dict) or set(axis_values) != {"finance", "location_work_policy", "hiring_process", "compensation_level"}:
        errors.append("$.scoring.axis_values: expected four opportunity axes")
    else:
        validate_score_map(axis_values["finance"], "$.scoring.axis_values.finance", {"A", "B", "C", "D", "UNVERIFIED"}, errors)
        validate_score_map(axis_values["location_work_policy"], "$.scoring.axis_values.location_work_policy", {"good", "acceptable", "poor", "unknown"}, errors)
        validate_score_map(axis_values["hiring_process"], "$.scoring.axis_values.hiring_process", {"F0", "F1", "F2", "F3", "UNKNOWN"}, errors)
        validate_score_map(axis_values["compensation_level"], "$.scoring.axis_values.compensation_level", {"good", "acceptable", "poor", "unknown"}, errors)
        monotonic = [
            axis_values["finance"].get("A", 0) > axis_values["finance"].get("B", 0) > axis_values["finance"].get("C", 0) > axis_values["finance"].get("D", 0) == axis_values["finance"].get("UNVERIFIED", 0) == 0,
            axis_values["location_work_policy"].get("good", 0) > axis_values["location_work_policy"].get("acceptable", 0) > axis_values["location_work_policy"].get("poor", 0) > axis_values["location_work_policy"].get("unknown", 0) == 0,
            axis_values["hiring_process"].get("F0", 0) > axis_values["hiring_process"].get("F1", 0) > axis_values["hiring_process"].get("F2", 0) > axis_values["hiring_process"].get("F3", 0) > axis_values["hiring_process"].get("UNKNOWN", 0) == 0,
            axis_values["compensation_level"].get("good", 0) > axis_values["compensation_level"].get("acceptable", 0) > axis_values["compensation_level"].get("poor", 0) > axis_values["compensation_level"].get("unknown", 0) == 0,
        ]
        if not all(monotonic):
            errors.append("$.scoring.axis_values: score maps must preserve documented best-to-worst ordering and unknown=0")
    threshold = scoring.get("confidence_threshold")
    if not is_number(threshold) or not 0 <= threshold <= 100:
        errors.append("$.scoring.confidence_threshold: expected number from 0 to 100")
    profiles = scoring.get("sensitivity_profiles")
    if not isinstance(profiles, dict) or not profiles:
        errors.append("$.scoring.sensitivity_profiles: expected non-empty object")
    else:
        for name, weights in profiles.items():
            validate_weights(weights, f"$.scoring.sensitivity_profiles.{name}", opportunity_keys, errors)

    preferences = profile.get("preferences")
    if not isinstance(preferences, dict):
        errors.append("$.preferences: expected object")
        preferences = {}
    for field in ("finance_policy", "hiring_effort_max", "location_anchor"):
        if not isinstance(preferences.get(field), str) or not preferences[field].strip():
            errors.append(f"$.preferences.{field}: expected non-empty string")
    nonempty_list(preferences, "hard_exclusions", "$.preferences", errors)
    tiers = nonempty_list(preferences, "commute_tiers", "$.preferences", errors)
    if any(not isinstance(tier, dict) or not tier.get("grade") or not tier.get("rule") for tier in tiers):
        errors.append("$.preferences.commute_tiers: every item needs grade and rule")

    resume = profile.get("resume")
    if not isinstance(resume, dict):
        errors.append("$.resume: expected object")
        resume = {}
    nonempty_list(resume, "ordering", "$.resume", errors)
    sources = resume.get("source_files", [])
    if not isinstance(sources, list):
        errors.append("$.resume.source_files: expected array")
        sources = []
    if check_sources:
        for index, source in enumerate(sources):
            source_path = Path(str(source.get("path", ""))).expanduser() if isinstance(source, dict) else Path()
            if not source_path.is_file():
                errors.append(f"$.resume.source_files[{index}].path: file not found")
                continue
            expected = source.get("sha256")
            if expected:
                actual = hashlib.sha256(source_path.read_bytes()).hexdigest()
                if actual != expected:
                    errors.append(f"$.resume.source_files[{index}].sha256: source drift")
    return errors


def sample() -> dict:
    return {
        "schema_version": 1,
        "profile_version": "example-v1",
        "captured_at": "2000-01-15T00:00:00Z",
        "career_years": 6.0,
        "candidate": {
            "target_roles": ["Applied AI Engineer"],
            "defensible_level": "senior hands-on individual contributor",
            "degree": "bachelor",
            "proven_strengths": ["production AI"],
            "known_gaps": ["scale evidence unavailable"]
        },
        "scoring": {
            "model_version": "2026-08-v3",
            "policy_source": "assets/scoring-policy.default.json",
            "weight_method": "owner_policy_provisional",
            "elicited_at": "2000-01-15",
            "rationale": "Synthetic test policy",
            "match_weights": {"mandatory_requirements": 45, "task_ownership": 20, "production_delivery": 15, "preferred_requirements": 8, "level_scope": 8, "domain_onboarding": 4},
            "opportunity_weights": {"match_score": 45, "finance": 25, "location_work_policy": 12, "hiring_process": 8, "compensation_level": 10},
            "match_values": {"confirmed": 100, "transferable": 55, "missing": 0, "unknown": 0},
            "axis_values": {
                "finance": {"A": 100, "B": 75, "C": 35, "D": 0, "UNVERIFIED": 0},
                "location_work_policy": {"good": 100, "acceptable": 65, "poor": 20, "unknown": 0},
                "hiring_process": {"F0": 100, "F1": 80, "F2": 55, "F3": 20, "UNKNOWN": 0},
                "compensation_level": {"good": 100, "acceptable": 65, "poor": 20, "unknown": 0},
            },
            "confidence_threshold": 70,
            "sensitivity_profiles": {"fit_first": {"match_score": 60, "finance": 15, "location_work_policy": 8, "hiring_process": 7, "compensation_level": 10}},
        },
        "preferences": {
            "hard_exclusions": ["excluded domain"],
            "finance_policy": "avoid chronic loss",
            "hiring_effort_max": "F2",
            "hands_on_lead_allowed": True,
            "location_anchor": "transit anchor",
            "commute_tiers": [{"grade": "T1", "rule": "short"}]
        },
        "resume": {
            "source_files": [],
            "ordering": ["summary", "experience", "skills"],
            "commitment_statement": "UNKNOWN"
        }
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", type=Path)
    parser.add_argument("--check-sources", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        assert validate(sample()) == []
        invalid = sample()
        invalid["email"] = "private@example.com"
        assert any("forbidden" in error for error in validate(invalid))
        invalid = sample()
        invalid["candidate"]["proven_strengths"] = ["contact person@example.com"]
        assert any("email address" in error for error in validate(invalid))
        invalid = sample()
        invalid["candidate"]["proven_strengths"] = ["api_key=sk-example-secret-value"]
        assert any("assigned credential" in error for error in validate(invalid))
        print("SELF_TEST_PASS")
        return 0
    if args.profile is None:
        parser.error("profile path is required unless --self-test is used")
    try:
        profile = json.loads(args.profile.expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    errors = validate(profile, args.check_sources)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
