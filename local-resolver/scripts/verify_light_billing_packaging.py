#!/usr/bin/env python3
"""Fail closed if the light Cloud Run image would ship without billing.

Used by Cloud Build (before docker build) and by unit tests. Kept out of
test_*.py naming so .gcloudignore still uploads this script.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = ROOT / "Dockerfile.light"
SERVER_LIGHT = ROOT / "server_light.py"
ENV_FILES = (
    ROOT / "deploy" / "cloud-run-env.yaml",
    ROOT / "deploy" / "cloud-run-env.example.yaml",
)

# Modules that must be present in the light image for billing to load.
SEED_MODULES = (
    "billing",
    "billing_hooks",
    "billing_routes",
    "billing_reservation",
)


def _dockerfile_copied_py_files(dockerfile_text: str) -> set[str]:
    copied: set[str] = set()
    for match in re.finditer(r"^\s*COPY\s+(\S+\.py)\s+", dockerfile_text, re.MULTILINE):
        copied.add(Path(match.group(1)).name)
    return copied


def _billing_imports_from_source(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            mod = node.module.split(".", 1)[0]
            if mod == "billing" or mod.startswith("billing_"):
                found.add(mod)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.split(".", 1)[0]
                if mod == "billing" or mod.startswith("billing_"):
                    found.add(mod)
    return found


def required_billing_py_files() -> set[str]:
    """Transitively collect billing*.py modules needed by the light server."""
    required: set[str] = set()
    pending = set(SEED_MODULES)
    while pending:
        mod = pending.pop()
        py_name = mod + ".py"
        if py_name in required:
            continue
        path = ROOT / py_name
        if not path.is_file():
            raise FileNotFoundError(f"Missing billing module source: {path}")
        required.add(py_name)
        for dep in _billing_imports_from_source(path):
            dep_py = dep + ".py"
            if dep_py not in required:
                pending.add(dep)
    return required


def verify_dockerfile_copies_billing() -> list[str]:
    errors: list[str] = []
    if not DOCKERFILE.is_file():
        return [f"Missing {DOCKERFILE}"]
    copied = _dockerfile_copied_py_files(DOCKERFILE.read_text(encoding="utf-8"))
    required = required_billing_py_files()
    missing = sorted(required - copied)
    if missing:
        errors.append(
            "Dockerfile.light is missing COPY for billing modules: "
            + ", ".join(missing)
            + ". Light Cloud Run cannot ship without billing."
        )
    return errors


def _yaml_simple_string_value(text: str, key: str) -> str | None:
    """Parse KEY: \"value\" / KEY: value from our flat env yaml (no nested maps)."""
    pattern = re.compile(
        r"^" + re.escape(key) + r":\s*(?:\"([^\"]*)\"|'([^']*)'|(\S+))\s*$",
        re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1) or match.group(2) or match.group(3)


def verify_cloud_run_env_billing_flags() -> list[str]:
    errors: list[str] = []
    for path in ENV_FILES:
        if not path.is_file():
            errors.append(f"Missing env file: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        for key, expected in (
            ("BILLING_ENABLED", "true"),
            ("RESOLVER_LIGHT_MODE", "true"),
        ):
            actual = _yaml_simple_string_value(text, key)
            if actual is None:
                errors.append(f"{path.name}: missing {key}")
            elif actual.lower() not in ("1", "true", "yes"):
                errors.append(
                    f"{path.name}: {key}={actual!r} (expected true); "
                    "Cloud Run light is the central billing ledger."
                )
            elif actual.lower() != expected and actual.lower() not in ("1", "yes"):
                # accept true/1/yes; preferred spelling is true
                pass
    return errors


def verify_all() -> list[str]:
    return verify_dockerfile_copies_billing() + verify_cloud_run_env_billing_flags()


def main() -> int:
    errors = verify_all()
    if errors:
        print("Light billing packaging check FAILED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    required = sorted(required_billing_py_files())
    print("Light billing packaging OK.")
    print("Dockerfile.light billing modules:", ", ".join(required))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
