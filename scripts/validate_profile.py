#!/usr/bin/env python3
"""Validate the private candidate profile used by census and scan modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
FORBIDDEN_KEYS = {
    "phone",
    "email",
    "home_address",
    "recruiter_name",
    "recruiter_email",
    "recruiter_phone",
    "credentials"
}


def walk_forbidden(value: object, prefix: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FORBIDDEN_KEYS:
                errors.append(f"{prefix}.{key}: forbidden personal or credential field")
            errors.extend(walk_forbidden(item, f"{prefix}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            errors.extend(walk_forbidden(item, f"{prefix}[{index}]"))
    return errors


def nonempty_list(parent: dict, key: str, path: str, errors: list[str]) -> list:
    value = parent.get(key)
    if not isinstance(value, list) or not value:
        errors.append(f"{path}.{key}: expected non-empty array")
        return []
    return value


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
        "captured_at": "2030-01-15T00:00:00Z",
        "career_years": 6.0,
        "candidate": {
            "target_roles": ["Applied AI Engineer"],
            "defensible_level": "senior hands-on individual contributor",
            "degree": "bachelor",
            "proven_strengths": ["production AI"],
            "known_gaps": ["scale evidence unavailable"]
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
