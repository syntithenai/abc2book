#!/usr/bin/env python3
"""Dry-run library move plan (one song per artist)."""

from __future__ import annotations

import sys

from _common import parse_phase_arg, write_report
from music_collection_moves import plan_duplicate_quarantine, plan_library_moves


def main():
    phase = parse_phase_arg()
    plan_type = "library"
    for arg in sys.argv[1:]:
        if arg.startswith("--type="):
            plan_type = arg.split("=", 1)[1]
    if plan_type == "duplicates":
        payload = plan_duplicate_quarantine(phase=phase)
    else:
        payload = plan_library_moves(phase=phase, triage_only="--all" not in sys.argv)
    write_report(f"move-plan-{plan_type}-{phase or 'all'}.json", payload)
    print(f"moves={payload.get('moveCount', 0)}")


if __name__ == "__main__":
    main()
