#!/usr/bin/env python3
"""List payment events and optionally grant comp credit (admin)."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

from billing import BILLING_DB_PATH, ensure_db, grant_purchase


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(BILLING_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def cmd_list(args: argparse.Namespace) -> int:
    ensure_db()
    query = "SELECT provider, event_id, email, amount_cents, created_at FROM payment_events"
    params: list[object] = []
    if args.provider:
        query += " WHERE provider = ?"
        params.append(args.provider)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(int(args.limit))
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    for row in rows:
        print(
            f"{row['created_at']:.0f}\t{row['provider']}\t{row['event_id']}\t{row['email']}\t{row['amount_cents']}"
        )
    return 0


def cmd_comp(args: argparse.Namespace) -> int:
    event_id = f"comp_{int(time.time())}_{args.email}"
    result = grant_purchase(
        args.email,
        int(args.cents),
        provider="comp",
        provider_event_id=event_id,
        detail={"reason": args.reason or "manual comp"},
    )
    if not result.get("ok"):
        print(result, file=sys.stderr)
        return 1
    print(f"Granted {args.cents} cents to {args.email} (event {event_id})")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Billing admin utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List payment_events")
    list_parser.add_argument("--provider", default="")
    list_parser.add_argument("--limit", type=int, default=50)
    list_parser.set_defaults(func=cmd_list)

    comp_parser = sub.add_parser("comp", help="Grant comp credit")
    comp_parser.add_argument("email")
    comp_parser.add_argument("cents", type=int)
    comp_parser.add_argument("--reason", default="")
    comp_parser.set_defaults(func=cmd_comp)

    args = parser.parse_args()
    if not os.path.isfile(BILLING_DB_PATH) and args.command == "list":
        print("No billing database yet", file=sys.stderr)
        return 1
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
