"""Regression cases for evidence omission, effort ceilings and source drift."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from score_review import score_document
from validate_profile import sample as sample_profile, validate as validate_profile
from validate_review import HIRING_CHECKS, sample_document, validate_document


class ReviewPolicyTests(unittest.TestCase):
    def setUp(self):
        self.review = sample_document()
        self.profile = sample_profile()
        self.role = self.review["roles"][0]

    def score(self):
        return score_document(self.review, self.profile, require_hiring_checks=True)

    def test_explicit_waivers_allow_prepare_and_preserve_checks(self):
        scored = self.score()
        self.assertTrue(scored["roles"][0]["ranking_allowed"])
        self.assertEqual(scored["roles"][0]["hiring_process"], self.role["hiring_process"])

    def test_ambiguous_role_cannot_prepare(self):
        self.role["current_status"] = "ambiguous"
        self.assertTrue(any("ambiguous" in e for e in validate_document(self.review)))

    def test_missing_checks_need_explicit_legacy_mode(self):
        del self.role["hiring_process"]["checks"]
        self.assertEqual(validate_document(self.review), [])
        self.assertTrue(validate_document(self.review, require_hiring_checks=True))

    def test_omission_is_not_a_waiver(self):
        for state in ("NOT_LISTED", "UNKNOWN", "REQUIRED"):
            with self.subTest(state=state):
                self.role["hiring_process"]["checks"]["coding_test"]["status"] = state
                self.assertTrue(any("F0/F1" in e for e in validate_document(self.review)))

    def test_company_policy_and_history_cannot_establish_role_waiver(self):
        for scope in ("company_general", "historical", "unknown"):
            with self.subTest(scope=scope):
                self.role["hiring_process"]["checks"]["coding_test"]["scope"] = scope
                self.assertTrue(any("exact_role" in e for e in validate_document(self.review)))

    def test_waiver_needs_source_and_real_date(self):
        check = self.role["hiring_process"]["checks"]["coding_test"]
        check["evidence"] = []
        check["as_of"] = "2000-02-30"
        errors = validate_document(self.review)
        self.assertTrue(any("evidence" in e for e in errors))
        self.assertTrue(any("real YYYY-MM-DD" in e for e in errors))

    def test_effort_above_limit_or_unknown_blocks_prepare(self):
        for grade in ("F3", "UNKNOWN"):
            with self.subTest(grade=grade):
                self.role["hiring_process"]["grade"] = grade
                with self.assertRaisesRegex(ValueError, "hiring effort"):
                    self.score()

    def test_above_limit_remains_conditional_and_unranked(self):
        self.role["hiring_process"]["grade"] = "F3"
        self.role["application_stage"] = "CONDITIONAL"
        self.assertFalse(self.score()["roles"][0]["ranking_allowed"])

    def test_each_excluded_assessment_requires_positive_waiver(self):
        self.role["hiring_process"]["grade"] = "F2"
        for axis in HIRING_CHECKS:
            for state in ("NOT_LISTED", "UNKNOWN"):
                with self.subTest(axis=axis, state=state):
                    self.profile["preferences"]["excluded_hiring_assessments"] = [axis]
                    original = self.role["hiring_process"]["checks"][axis]["status"]
                    self.role["hiring_process"]["checks"][axis]["status"] = state
                    with self.assertRaisesRegex(ValueError, "EXPLICIT_NONE"):
                        self.score()
                    self.role["hiring_process"]["checks"][axis]["status"] = original

    def test_required_excluded_test_requires_drop_no_go(self):
        self.profile["preferences"]["excluded_hiring_assessments"] = ["coding_test"]
        self.role["hiring_process"]["grade"] = "F2"
        self.role["hiring_process"]["checks"]["coding_test"]["status"] = "REQUIRED"
        with self.assertRaisesRegex(ValueError, "hard_exclusion"):
            self.score()
        self.role["gates"] = {"hard_exclusion": True, "reasons": ["Coding test excluded by candidate policy"]}
        self.role["application_stage"] = "DROP"
        self.role["offer_stage"] = "NO_GO"
        result = self.score()["roles"][0]
        self.assertFalse(result["ranking_allowed"])
        self.assertEqual(result["opportunity_score"], 0)

    def test_pass_cannot_hide_unresolved_assessment(self):
        self.role["hiring_process"]["grade"] = "F2"
        self.role["hiring_process"]["checks"]["live_coding"]["status"] = "NOT_LISTED"
        self.role["compensation"] = {"status": "confirmed", "grade": "acceptable", "facts": ["Synthetic pay floor"], "evidence": [self.role["url"]]}
        self.role["offer_stage"] = "PASS"
        self.assertTrue(any("resolved hiring" in e for e in validate_document(self.review)))

    def test_malformed_checks_return_errors_without_crashing(self):
        self.role["offer_stage"] = "PASS"
        for invalid in ([], "not an object", 7, {"coding_test": None}):
            with self.subTest(value=invalid):
                self.role["hiring_process"]["checks"] = invalid
                self.assertTrue(validate_document(self.review, require_hiring_checks=True))

    def test_profile_rejects_unknown_limit_and_invalid_exclusion(self):
        self.profile["preferences"]["hiring_effort_max"] = "F4"
        self.profile["preferences"]["excluded_hiring_assessments"] = ["anything"]
        self.assertGreaterEqual(len(validate_profile(self.profile)), 2)

    def test_profile_rejects_duplicate_exclusions(self):
        self.profile["preferences"]["excluded_hiring_assessments"] = ["coding_test", "coding_test"]
        self.assertTrue(any("duplicate axis" in e for e in validate_profile(self.profile)))

    def test_source_drift_and_absent_hash_block_checked_scoring(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "evidence.md"
            source.write_text("Frozen synthetic career evidence")
            ref = {"path": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
            self.profile["resume"]["source_files"] = [ref]
            checked = score_document(self.review, self.profile, require_hiring_checks=True, check_sources=True)
            self.assertEqual(checked["validation"]["resume_source_check"], "PASS")
            source.write_text("Changed evidence under the same profile version")
            with self.assertRaisesRegex(ValueError, "source drift"):
                score_document(self.review, self.profile, check_sources=True)
            del ref["sha256"]
            self.assertTrue(any("expected SHA-256" in e for e in validate_profile(self.profile, check_sources=True)))

    def test_no_source_claim_is_explicit(self):
        result = score_document(self.review, self.profile, check_sources=True)
        self.assertEqual(result["validation"]["resume_source_check"], "NO_SOURCES")

    def test_cli_defaults_reject_legacy_and_allow_explicit_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            review = Path(directory) / "review.json"
            profile = Path(directory) / "profile.json"
            del self.role["hiring_process"]["checks"]
            review.write_text(json.dumps(self.review))
            profile.write_text(json.dumps(self.profile))
            command = [sys.executable, str(Path(__file__).with_name("score_review.py")), "--input", str(review), "--profile", str(profile)]
            rejected = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(rejected.returncode, 1)
            self.assertIn("all four", rejected.stderr)
            replayed = subprocess.run(command + ["--allow-legacy-review", "--skip-source-check"], capture_output=True, text=True)
            self.assertEqual(replayed.returncode, 0, replayed.stderr)
            self.assertEqual(json.loads(replayed.stdout)["validation"]["resume_source_check"], "NOT_RUN")

    def test_cli_checks_live_source_hashes_by_default(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "career.md"
            source.write_text("Synthetic frozen evidence")
            self.profile["resume"]["source_files"] = [{"path": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}]
            review = root / "review.json"
            profile = root / "profile.json"
            review.write_text(json.dumps(self.review))
            profile.write_text(json.dumps(self.profile))
            command = [sys.executable, str(Path(__file__).with_name("score_review.py")), "--input", str(review), "--profile", str(profile)]
            good = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(json.loads(good.stdout)["validation"]["resume_source_check"], "PASS")
            source.write_text("Changed after profile freeze")
            drift = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(drift.returncode, 1)
            self.assertIn("source drift", drift.stderr)
            self.assertEqual(drift.stdout, "")


if __name__ == "__main__":
    unittest.main()
