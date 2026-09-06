"""Unit tests for blog content assessment parsing (no live LLM)."""

from __future__ import annotations

import unittest

from blog_content_assessment import _parse_assessment_payload


class ParseAssessmentPayloadTests(unittest.TestCase):
    def test_ok_json(self) -> None:
        ok, reason = _parse_assessment_payload('{"ok": true, "reason": ""}')
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_fail_json(self) -> None:
        ok, reason = _parse_assessment_payload(
            '{"ok": false, "reason": "Contains sexual content inappropriate for families."}'
        )
        self.assertFalse(ok)
        self.assertIn("sexual", reason.lower())

    def test_fenced_json(self) -> None:
        ok, reason = _parse_assessment_payload(
            '```json\n{"ok": false, "reason": "Hate speech targeting a group."}\n```'
        )
        self.assertFalse(ok)
        self.assertIn("Hate", reason)

    def test_empty_fail_reason_gets_default(self) -> None:
        ok, reason = _parse_assessment_payload('{"ok": false, "reason": ""}')
        self.assertFalse(ok)
        self.assertTrue(reason)


if __name__ == "__main__":
    unittest.main()
