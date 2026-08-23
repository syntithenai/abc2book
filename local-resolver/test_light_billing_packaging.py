"""Packaging and boot gates so light Cloud Run cannot ship without billing."""

from __future__ import annotations

import importlib
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"


class LightBillingPackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(SCRIPTS))
        cls.verify = importlib.import_module("verify_light_billing_packaging")

    def test_dockerfile_copies_all_billing_modules(self):
        errors = self.verify.verify_dockerfile_copies_billing()
        self.assertEqual(errors, [], msg="\n".join(errors))

    def test_required_billing_modules_include_routes(self):
        required = self.verify.required_billing_py_files()
        self.assertIn("billing_routes.py", required)
        self.assertIn("billing.py", required)
        self.assertIn("billing_stripe.py", required)

    def test_cloud_run_env_enables_billing(self):
        errors = self.verify.verify_cloud_run_env_billing_flags()
        self.assertEqual(errors, [], msg="\n".join(errors))

    def test_verify_script_main_exits_zero(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "verify_light_billing_packaging.py")],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=result.stdout + "\n" + result.stderr,
        )


class LightBillingBootTests(unittest.TestCase):
    def test_server_light_registers_billing_routes(self):
        """Import server_light in a clean subprocess with sqlite billing enabled."""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "billing.sqlite")
            code = f"""
import os
os.environ["BILLING_ENABLED"] = "true"
os.environ["BILLING_STORE"] = "sqlite"
os.environ["BILLING_DB_PATH"] = {db_path!r}
os.environ["RESOLVER_LIGHT_MODE"] = "true"
os.environ["REQUIRE_AUTH"] = "false"
os.environ.setdefault("ALLOWED_ORIGINS", "")

import server_light
from billing import billing_enabled, billing_health_fields

assert billing_enabled(), "billing_enabled() must be true"
fields = billing_health_fields(None)
assert fields.get("billingEnabled") is True, fields

paths = set(server_light.app.openapi().get("paths") or {{}})
assert "/billing/can-afford" in paths, sorted(paths)
assert "/billing/balance" in paths, sorted(paths)
print("ok")
"""
            result = subprocess.run(
                [sys.executable, "-c", code],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=os.environ.copy(),
            )
            self.assertEqual(
                result.returncode,
                0,
                msg=result.stdout + "\n" + result.stderr,
            )
            self.assertIn("ok", result.stdout)

    def test_missing_billing_routes_copy_would_fail_packaging(self):
        """Regression guard: omitting billing_routes.py must fail the verify check."""
        dockerfile = (ROOT / "Dockerfile.light").read_text(encoding="utf-8")
        sabotaged = "\n".join(
            line
            for line in dockerfile.splitlines()
            if "billing_routes.py" not in line
        )
        sys.path.insert(0, str(SCRIPTS))
        verify = importlib.import_module("verify_light_billing_packaging")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Dockerfile.light"
            path.write_text(sabotaged + "\n", encoding="utf-8")
            with patch.object(verify, "DOCKERFILE", path):
                errors = verify.verify_dockerfile_copies_billing()
            self.assertTrue(
                any("billing_routes.py" in err for err in errors),
                msg=errors,
            )


if __name__ == "__main__":
    unittest.main()
