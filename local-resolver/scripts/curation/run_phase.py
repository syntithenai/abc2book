#!/usr/bin/env python3
"""Run curation workflow for a phase: inventory, dupes, tag gaps, unplayed, move plan."""

from __future__ import annotations

import subprocess
import sys

from _common import parse_phase_arg


def run(script, phase, extra=None):
    cmd = [sys.executable, script]
    if phase:
        cmd.append(f"--phase={phase}")
    for arg in extra or ():
        cmd.append(arg)
    print(">", " ".join(cmd))
    subprocess.check_call(cmd)


def main():
    phase = parse_phase_arg("folk-world")
    enrich = "--with-enrichment" in sys.argv
    base = __file__.rsplit("/", 1)[0]
    for name in (
        "report_inventory.py",
        "report_duplicates.py",
        "report_tag_gaps.py",
        "report_unplayed.py",
        "plan_moves.py",
    ):
        run(f"{base}/{name}", phase)
    if enrich:
        run(f"{base}/batch_tag.py", phase, ["--limit=25"])
        run(f"{base}/detect_bpm.py", phase, ["--limit=25"])
    print(f"Phase {phase} reports complete. Review _reports/ then triage in Tunebook curator.")


if __name__ == "__main__":
    main()
