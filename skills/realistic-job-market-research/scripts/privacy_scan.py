"""Small dependency-free scanner for accidental credentials and personal contacts."""

from __future__ import annotations

import re
import json
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

POLICY = json.loads((Path(__file__).resolve().parents[1] / "assets" / "privacy-patterns.json").read_text(encoding="utf-8"))
SENSITIVE_KEY = re.compile(POLICY["sensitive_key_pattern"], re.I)
SENSITIVE_QUERY = re.compile(POLICY["sensitive_query_key_pattern"], re.I)
CONTENT_PATTERNS = [(item["name"], re.compile(item["pattern"], re.I if "i" in item.get("flags", "") else 0)) for item in POLICY["content_patterns"]]


def scan(value: object, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if SENSITIVE_KEY.search(str(key).replace("-", "_")):
                errors.append(f"{path}.{key}: sensitive key is forbidden")
            errors.extend(scan(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            errors.extend(scan(item, f"{path}[{index}]"))
    elif isinstance(value, str):
        for name, pattern in CONTENT_PATTERNS:
            if pattern.search(value):
                errors.append(f"{path}: {name} is forbidden")
        if value.startswith(("http://", "https://")):
            for key, query_value in parse_qsl(urlparse(value).query, keep_blank_values=True):
                if SENSITIVE_QUERY.fullmatch(key) and query_value:
                    errors.append(f"{path}: sensitive URL query parameter {key!r} is forbidden")
    return errors
