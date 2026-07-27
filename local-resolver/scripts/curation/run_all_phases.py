#!/usr/bin/env python3
"""Run all curation phases sequentially (reports only)."""

from __future__ import annotations

import subprocess
import sys

PHASES = ("folk-world", "pop-rock", "remainder")


def main():
    base = __file__.rsplit("/", 1)[0]
    for phase in PHASES:
        subprocess.check_call([sys.executable, f"{base}/run_phase.py", f"--phase={phase}"])
    print("All phase reports written to Music/_reports/")


if __name__ == "__main__":
    main()
