#!/usr/bin/env python3
"""Cluster indexed wiki corpus by region, topic, and pedagogical depth."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "lesson plans" / "wiki_index" / "wiki.db"
REPORT_DIR = ROOT / "lesson plans" / ".reports"


def load_rows(db_path: Path) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT title, topic_folder, importance, region_tags, word_count, chunk_count
        FROM articles
        ORDER BY importance DESC
        """
    ).fetchall()
    conn.close()
    return rows


def build_report(db_path: Path) -> dict:
    rows = load_rows(db_path)
    by_topic = Counter()
    by_region = Counter()
    high_value = []
    region_depth: dict[str, dict] = defaultdict(lambda: {"articles": 0, "words": 0, "chunks": 0, "top": []})

    for row in rows:
        by_topic[row["topic_folder"]] += 1
        regions = json.loads(row["region_tags"] or "[]")
        if not regions:
            regions = ["global"]
        imp = float(row["importance"])
        if imp >= 0.5:
            high_value.append(row["title"])
        for r in regions:
            by_region[r] += 1
            bucket = region_depth[r]
            bucket["articles"] += 1
            bucket["words"] += int(row["word_count"])
            bucket["chunks"] += int(row["chunk_count"])
            if len(bucket["top"]) < 8:
                bucket["top"].append({"title": row["title"], "importance": imp})

    # Recommend Track B branches: regions with enough material for 4+ lesson tiers.
    track_b_candidates = []
    for region, data in sorted(region_depth.items(), key=lambda x: -x[1]["chunks"]):
        if region == "global":
            continue
        tiers = 1
        if data["articles"] >= 8:
            tiers = 2
        if data["articles"] >= 15:
            tiers = 3
        if data["articles"] >= 25:
            tiers = 4
        if data["chunks"] >= 80:
            tiers = max(tiers, 5)
        if data["chunks"] >= 120:
            tiers = 6
        track_b_candidates.append(
            {
                "region": region,
                "articles": data["articles"],
                "chunks": data["chunks"],
                "estimated_tiers": tiers,
                "recommended": tiers >= 4,
                "sample_articles": [t["title"] for t in data["top"][:5]],
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "db_path": str(db_path),
        "indexed_articles": len(rows),
        "high_value_articles": len(high_value),
        "by_topic": dict(by_topic),
        "by_region": dict(by_region.most_common(30)),
        "track_b_candidates": track_b_candidates[:25],
        "noise_note": (
            f"{len(rows) - len(high_value)} articles indexed below importance 0.5 "
            "are retained for reference but excluded from default lesson retrieval."
        ),
    }


def render_markdown(report: dict) -> str:
    lines = [
        "# Wiki Corpus Report",
        "",
        f"Generated: {report['generated_at']}",
        "",
        "## Progress metric",
        "",
        f"- **Indexed articles:** {report['indexed_articles']}",
        f"- **High-value articles (importance ≥ 0.5):** {report['high_value_articles']}",
        f"- {report['noise_note']}",
        "",
        "## By topic folder",
        "",
    ]
    for topic, count in sorted(report["by_topic"].items(), key=lambda x: -x[1]):
        lines.append(f"- **{topic}:** {count}")
    lines.extend(["", "## By region tag (top)", ""])
    for region, count in report["by_region"].items():
        lines.append(f"- **{region}:** {count}")
    lines.extend(["", "## Track B regional branch candidates", ""])
    lines.append("| Region | Articles | Chunks | Est. tiers | Recommended |")
    lines.append("|--------|----------|--------|------------|-------------|")
    for row in report["track_b_candidates"]:
        lines.append(
            f"| {row['region']} | {row['articles']} | {row['chunks']} | "
            f"{row['estimated_tiers']} | {'yes' if row['recommended'] else 'wait'} |"
        )
    lines.extend(["", "## Next steps", ""])
    recommended = [r for r in report["track_b_candidates"] if r["recommended"]]
    if recommended:
        lines.append("**Ready for multi-tier regional units:**")
        for r in recommended[:8]:
            lines.append(f"- {r['region']} — e.g. {', '.join(r['sample_articles'][:3])}")
    else:
        lines.append("Pilot with **celtic/ireland**; expand when more regional depth is indexed.")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Wiki corpus cluster report")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    if not args.db.exists():
        print(f"Index not found: {args.db}. Run wiki_index/build_index.py first.", file=sys.stderr)
        sys.exit(1)
    report = build_report(args.db)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / "corpus_report.json"
    md_path = REPORT_DIR / "corpus_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    print(render_markdown(report))


if __name__ == "__main__":
    main()
