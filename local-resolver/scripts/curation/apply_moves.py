#!/usr/bin/env python3
"""Apply a move plan JSON on the host (music folder must be writable)."""

from __future__ import annotations

import json
import sys

from _common import reports_dir, write_report
from music_collection_moves import apply_move_plan


def main():
    if len(sys.argv) < 2:
        print("Usage: apply_moves.py <plan.json> [--apply] [--staging]")
        raise SystemExit(2)
    plan_path = sys.argv[1]
    apply = "--apply" in sys.argv
    staging = "--staging" in sys.argv
    with open(plan_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    result = apply_move_plan(payload, apply=apply, staging=staging)
    write_report("apply-moves-log.json", result)
    moved = sum(1 for row in result.get("moves") or [] if row.get("status") == "moved")
    print(f"status={'applied' if apply else 'dry-run'} moved={moved}")


if __name__ == "__main__":
    main()
