#!/usr/bin/env python3
"""Validate a realistic job-market review JSON file with no dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from privacy_scan import scan as scan_private_content


ALLOWED = {
    "scope": {"named_shortlist", "audited_ledger", "update_correction"},
    "current_status": {"active", "closed", "ambiguous", "reposted"},
    "match": {"confirmed", "transferable", "missing", "unknown"},
    "fit": {"high", "medium", "low"},
    "identity": {"confirmed", "unverified"},
    "finance": {"A", "B", "C", "D", "UNVERIFIED"},
    "location": {"good", "acceptable", "poor", "unknown"},
    "hiring": {"F0", "F1", "F2", "F3", "UNKNOWN"},
    "compensation": {"confirmed", "unknown"},
    "comp_grade": {"good", "acceptable", "poor", "unknown"},
    "application": {"PREPARE", "CONDITIONAL", "DROP"},
    "offer": {"PASS", "HOLD", "NO_GO"},
    "evidence_quality": {"high", "medium", "low", "unverified"},
    "evidence_freshness": {"current", "mixed", "stale", "unknown"},
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FINANCE_AS_OF_RE = re.compile(r"^\d{4}(?:-\d{2}-\d{2})?$")
IDENTITY_FIELD_ALIASES = {
    "domain": "official_domain",
    "official domain": "official_domain",
    "official_domain": "official_domain",
    "legal_name": "legal_name",
    "legal name": "legal_name",
    "company name": "legal_name",
    "address": "exact_address",
    "exact address": "exact_address",
    "exact_address": "exact_address",
    "incorporation date": "incorporation_or_business_id",
    "business identifier": "incorporation_or_business_id",
    "incorporation_or_business_id": "incorporation_or_business_id",
}


def is_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def collect_forbidden(value: object, path: str = "$") -> list[str]:
    return scan_private_content(value, path)


def require_dict(parent: dict, key: str, path: str, errors: list[str]) -> dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        errors.append(f"{path}.{key}: expected object")
        return {}
    return value


def require_list(parent: dict, key: str, path: str, errors: list[str]) -> list:
    value = parent.get(key)
    if not isinstance(value, list):
        errors.append(f"{path}.{key}: expected array")
        return []
    return value


def require_string(parent: dict, key: str, path: str, errors: list[str]) -> str:
    value = parent.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path}.{key}: expected non-empty string")
        return ""
    return value


def require_enum(
    parent: dict, key: str, allowed: set[str], path: str, errors: list[str]
) -> str:
    value = require_string(parent, key, path, errors)
    if value and value not in allowed:
        errors.append(f"{path}.{key}: {value!r} is not one of {sorted(allowed)}")
    return value


def validate_urls(items: list, path: str, errors: list[str]) -> None:
    for index, value in enumerate(items):
        if not is_url(value):
            errors.append(f"{path}[{index}]: expected HTTP(S) URL")


def validate_match_items(items: list, path: str, errors: list[str]) -> list[str]:
    matches: list[str] = []
    for index, item in enumerate(items):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_path}: expected object")
            continue
        require_string(item, "requirement", item_path, errors)
        require_string(item, "candidate_evidence", item_path, errors)
        matches.append(require_enum(item, "match", ALLOWED["match"], item_path, errors))
    return matches


def validate_role(role: object, index: int) -> list[str]:
    path = f"$.roles[{index}]"
    errors: list[str] = []
    if not isinstance(role, dict):
        return [f"{path}: expected object"]

    require_string(role, "company", path, errors)
    require_string(role, "title", path, errors)
    if not is_url(role.get("url")):
        errors.append(f"{path}.url: expected HTTP(S) URL")
    current = require_enum(
        role, "current_status", ALLOWED["current_status"], path, errors
    )

    requirements = require_dict(role, "requirements", path, errors)
    must_have = require_list(
        requirements, "must_have", f"{path}.requirements", errors
    )
    if not must_have:
        errors.append(f"{path}.requirements.must_have: expected at least one item")
    matches = validate_match_items(must_have, f"{path}.requirements.must_have", errors)
    preferred = require_list(
        requirements, "preferred", f"{path}.requirements", errors
    )
    validate_match_items(preferred, f"{path}.requirements.preferred", errors)

    fit = require_dict(role, "fit", path, errors)
    require_enum(fit, "level", ALLOWED["fit"], f"{path}.fit", errors)
    require_string(fit, "reason", f"{path}.fit", errors)
    dimensions = require_dict(fit, "dimensions", f"{path}.fit", errors)
    for dimension in (
        "task_ownership",
        "production_delivery",
        "level_scope",
        "domain_onboarding",
    ):
        value = require_dict(dimensions, dimension, f"{path}.fit.dimensions", errors)
        require_enum(value, "match", ALLOWED["match"], f"{path}.fit.dimensions.{dimension}", errors)
        require_string(value, "reason", f"{path}.fit.dimensions.{dimension}", errors)

    gates = require_dict(role, "gates", path, errors)
    hard_exclusion = gates.get("hard_exclusion")
    if not isinstance(hard_exclusion, bool):
        errors.append(f"{path}.gates.hard_exclusion: expected boolean")
    gate_reasons = require_list(gates, "reasons", f"{path}.gates", errors)
    if hard_exclusion is True and not gate_reasons:
        errors.append(f"{path}.gates.reasons: hard exclusion requires a reason")
    policy_flags = require_list(role, "policy_flags", path, errors)
    if any(not isinstance(flag, str) or not flag.strip() for flag in policy_flags):
        errors.append(f"{path}.policy_flags: expected non-empty strings")

    evidence_quality = require_dict(role, "evidence_quality", path, errors)
    require_enum(evidence_quality, "grade", ALLOWED["evidence_quality"], f"{path}.evidence_quality", errors)
    require_enum(evidence_quality, "freshness", ALLOWED["evidence_freshness"], f"{path}.evidence_quality", errors)
    require_string(evidence_quality, "reason", f"{path}.evidence_quality", errors)

    identity = require_dict(role, "company_identity", path, errors)
    identity_status = require_enum(
        identity,
        "status",
        ALLOWED["identity"],
        f"{path}.company_identity",
        errors,
    )
    matched_fields = require_list(identity, "matched_fields", f"{path}.company_identity", errors)
    validate_urls(
        require_list(identity, "evidence", f"{path}.company_identity", errors),
        f"{path}.company_identity.evidence",
        errors,
    )
    if identity_status == "confirmed":
        normalized_identity_fields = {IDENTITY_FIELD_ALIASES.get(str(field).lower()) for field in matched_fields}
        if None in normalized_identity_fields or len(normalized_identity_fields) < 2:
            errors.append(f"{path}.company_identity.matched_fields: confirmed identity requires at least two distinct 2-of-4 fields")
        if not identity.get("evidence"):
            errors.append(f"{path}.company_identity.evidence: confirmed identity requires evidence")

    finance = require_dict(role, "finance", path, errors)
    finance_grade = require_enum(
        finance, "grade", ALLOWED["finance"], f"{path}.finance", errors
    )
    finance_as_of = require_string(finance, "as_of", f"{path}.finance", errors)
    finance_facts = require_list(finance, "facts", f"{path}.finance", errors)
    finance_evidence = require_list(finance, "evidence", f"{path}.finance", errors)
    validate_urls(
        finance_evidence,
        f"{path}.finance.evidence",
        errors,
    )
    if finance_grade != "UNVERIFIED" and not finance_evidence:
        errors.append(f"{path}.finance.evidence: verified finance requires evidence")
    if finance_grade != "UNVERIFIED" and (not finance_facts or not FINANCE_AS_OF_RE.fullmatch(finance_as_of)):
        errors.append(f"{path}.finance: verified finance requires non-empty facts and YYYY or YYYY-MM-DD as_of")

    location = require_dict(role, "location_work_policy", path, errors)
    location_grade = require_enum(
        location,
        "grade",
        ALLOWED["location"],
        f"{path}.location_work_policy",
        errors,
    )
    location_facts = require_list(location, "facts", f"{path}.location_work_policy", errors)
    location_evidence = require_list(location, "evidence", f"{path}.location_work_policy", errors)
    validate_urls(
        location_evidence,
        f"{path}.location_work_policy.evidence",
        errors,
    )
    if location_grade != "unknown" and not location_evidence:
        errors.append(f"{path}.location_work_policy.evidence: known location requires evidence")
    if location_grade != "unknown" and not location_facts:
        errors.append(f"{path}.location_work_policy.facts: known location requires facts")

    hiring = require_dict(role, "hiring_process", path, errors)
    hiring_grade = require_enum(
        hiring, "grade", ALLOWED["hiring"], f"{path}.hiring_process", errors
    )
    hiring_steps = require_list(hiring, "steps", f"{path}.hiring_process", errors)
    hiring_evidence = require_list(hiring, "evidence", f"{path}.hiring_process", errors)
    validate_urls(
        hiring_evidence,
        f"{path}.hiring_process.evidence",
        errors,
    )
    if hiring_grade != "UNKNOWN" and not hiring_evidence:
        errors.append(f"{path}.hiring_process.evidence: known hiring process requires evidence")
    if hiring_grade != "UNKNOWN" and not hiring_steps:
        errors.append(f"{path}.hiring_process.steps: known hiring process requires steps")

    compensation = require_dict(role, "compensation", path, errors)
    compensation_status = require_enum(
        compensation,
        "status",
        ALLOWED["compensation"],
        f"{path}.compensation",
        errors,
    )
    compensation_grade = require_enum(
        compensation,
        "grade",
        ALLOWED["comp_grade"],
        f"{path}.compensation",
        errors,
    )
    require_list(compensation, "facts", f"{path}.compensation", errors)
    compensation_evidence = require_list(compensation, "evidence", f"{path}.compensation", errors)
    validate_urls(
        compensation_evidence,
        f"{path}.compensation.evidence",
        errors,
    )
    if compensation_status == "confirmed" and compensation_grade == "unknown":
        errors.append(f"{path}.compensation.grade: confirmed compensation requires a known grade")
    if compensation_status == "unknown" and compensation_grade != "unknown":
        errors.append(f"{path}.compensation.grade: unknown compensation requires grade unknown")
    if compensation_status == "confirmed" and not compensation_evidence:
        errors.append(f"{path}.compensation.evidence: confirmed compensation requires evidence")

    application = require_enum(
        role, "application_stage", ALLOWED["application"], path, errors
    )
    offer = require_enum(role, "offer_stage", ALLOWED["offer"], path, errors)
    require_string(role, "decision_reason", path, errors)
    require_list(role, "unknowns", path, errors)
    require_list(role, "resume_actions", path, errors)
    role_evidence = require_list(role, "evidence", path, errors)
    validate_urls(role_evidence, f"{path}.evidence", errors)
    if not role_evidence:
        errors.append(f"{path}.evidence: expected at least one claim-level source")

    if current == "closed" and application != "DROP":
        errors.append(f"{path}: closed role must have application_stage DROP")
    if current == "closed" and offer == "PASS":
        errors.append(f"{path}: closed role cannot have offer_stage PASS")
    if identity_status == "unverified" and finance_grade != "UNVERIFIED":
        errors.append(f"{path}: unverified identity requires finance grade UNVERIFIED")
    if hard_exclusion is True and application != "DROP":
        errors.append(f"{path}: hard exclusion requires application_stage DROP")
    if hard_exclusion is True and offer != "NO_GO":
        errors.append(f"{path}: hard exclusion requires offer_stage NO_GO")
    if "missing" in matches and application == "PREPARE":
        errors.append(f"{path}: missing mandatory requirement cannot be PREPARE")
    if "unknown" in matches and application == "PREPARE":
        errors.append(f"{path}: unknown mandatory requirement cannot be PREPARE")
    if offer == "PASS":
        if current != "active":
            errors.append(f"{path}: PASS requires active current_status")
        if identity_status != "confirmed" or finance_grade == "UNVERIFIED":
            errors.append(
                f"{path}: PASS requires confirmed identity and verified finance"
            )
        if (
            location_grade == "unknown"
            or hiring_grade == "UNKNOWN"
            or compensation_status != "confirmed"
            or compensation_grade in {"poor", "unknown"}
        ):
            errors.append(
                f"{path}: PASS requires known location, hiring process, and compensation"
            )
        if any(match in {"missing", "unknown"} for match in matches):
            errors.append(
                f"{path}: PASS cannot contain missing or unknown mandatory requirements"
            )
    return errors


def validate_document(document: object) -> list[str]:
    errors = collect_forbidden(document)
    if not isinstance(document, dict):
        return errors + ["$: expected object"]
    if document.get("schema_version") != 1:
        errors.append("$.schema_version: expected 1")
    as_of = require_string(document, "as_of", "$", errors)
    if as_of and not DATE_RE.fullmatch(as_of):
        errors.append("$.as_of: expected YYYY-MM-DD")
    require_string(document, "candidate_profile_version", "$", errors)
    scope = require_dict(document, "scope", "$", errors)
    require_enum(scope, "kind", ALLOWED["scope"], "$.scope", errors)
    require_string(scope, "statement", "$.scope", errors)
    require_list(scope, "coverage_limits", "$.scope", errors)
    roles = require_list(document, "roles", "$", errors)
    if not roles:
        errors.append("$.roles: expected at least one role")
    for index, role in enumerate(roles):
        errors.extend(validate_role(role, index))
    identities = [(role.get("company"), role.get("title"), role.get("url")) for role in roles if isinstance(role, dict)]
    if len(identities) != len(set(identities)):
        errors.append("$.roles: duplicate company/title/url role identity")
    return errors


def sample_document() -> dict:
    url = "https://example.com/jobs/agent-engineer"
    return {
        "schema_version": 1,
        "as_of": "2000-01-15",
        "candidate_profile_version": "example-v1",
        "scope": {
            "kind": "named_shortlist",
            "statement": "One synthetic role",
            "coverage_limits": ["Synthetic self-test"],
        },
        "roles": [
            {
                "company": "Example Labs",
                "title": "AI Agent Engineer",
                "url": url,
                "current_status": "active",
                "requirements": {
                    "must_have": [
                        {
                            "requirement": "Production Python",
                            "candidate_evidence": "Dated project evidence",
                            "match": "confirmed",
                        }
                    ],
                    "preferred": []
                },
                "fit": {
                    "level": "high",
                    "reason": "Mandatory experience is directly evidenced.",
                    "dimensions": {
                        "task_ownership": {"match": "confirmed", "reason": "Owned the task."},
                        "production_delivery": {"match": "confirmed", "reason": "Shipped to production."},
                        "level_scope": {"match": "confirmed", "reason": "Level is aligned."},
                        "domain_onboarding": {"match": "transferable", "reason": "Adjacent domain."},
                    },
                },
                "gates": {"hard_exclusion": False, "reasons": []},
                "policy_flags": [],
                "evidence_quality": {"grade": "high", "freshness": "current", "reason": "Synthetic current primary evidence."},
                "company_identity": {
                    "status": "confirmed",
                    "matched_fields": ["domain", "legal_name"],
                    "evidence": [url],
                },
                "finance": {
                    "grade": "A",
                    "as_of": "2029",
                    "facts": ["Audited operating profit"],
                    "evidence": [url],
                },
                "location_work_policy": {
                    "grade": "acceptable",
                    "facts": ["Two office days"],
                    "evidence": [url],
                },
                "hiring_process": {
                    "grade": "F0",
                    "steps": ["Interview"],
                    "evidence": [url],
                },
                "compensation": {
                    "status": "unknown",
                    "grade": "unknown",
                    "facts": [],
                    "evidence": [],
                },
                "application_stage": "PREPARE",
                "offer_stage": "HOLD",
                "decision_reason": "Low-cost application; compensation remains unknown.",
                "unknowns": ["Compensation"],
                "resume_actions": ["Lead with production Python evidence"],
                "evidence": [url],
            }
        ],
    }


def self_test() -> int:
    valid = sample_document()
    assert validate_document(valid) == []

    invalid = sample_document()
    invalid["roles"][0]["offer_stage"] = "PASS"
    assert any("compensation" in error for error in validate_document(invalid))

    invalid = sample_document()
    invalid["roles"][0]["current_status"] = "closed"
    assert any("closed role" in error for error in validate_document(invalid))

    print("SELF_TEST_PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("review", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.review is None:
        parser.error("review JSON path is required unless --self-test is used")
    try:
        document = json.loads(args.review.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    errors = validate_document(document)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
