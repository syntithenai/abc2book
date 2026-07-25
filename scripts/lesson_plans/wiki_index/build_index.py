#!/usr/bin/env python3
"""Build SQLite FTS5 index from wikimusic markdown corpus."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "lesson_plans"))

from wiki_index.chunk_parser import chunk_article, parse_article_file
from wiki_index.importance import score_article
from wiki_index.regions import tag_regions

WIKI_BASE = Path("/home/stever/Downloads/wikimusic")
DEFAULT_DB = ROOT / "lesson plans" / "wiki_index" / "wiki.db"
STATUS_PATH = ROOT / "lesson plans" / "index_status.json"
TOPIC_FOLDERS = ("theory", "instruments", "history", "dance")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS articles (
            title TEXT NOT NULL,
            topic_folder TEXT NOT NULL,
            source_path TEXT NOT NULL,
            source_url TEXT,
            importance REAL NOT NULL,
            region_tags TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            chunk_count INTEGER NOT NULL,
            categories TEXT,
            PRIMARY KEY (title, topic_folder)
        );
        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id TEXT PRIMARY KEY,
            article_title TEXT NOT NULL,
            topic_folder TEXT NOT NULL,
            section TEXT NOT NULL,
            text TEXT NOT NULL,
            source_path TEXT NOT NULL,
            importance REAL NOT NULL,
            region_tags TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            FOREIGN KEY (article_title, topic_folder) REFERENCES articles(title, topic_folder)
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            chunk_id UNINDEXED,
            article_title,
            topic_folder,
            section,
            region_tags,
            text
        );
        """
    )
    return conn


def load_categories() -> dict[str, list[str]]:
    state_path = WIKI_BASE / "meta" / "crawl_state.json"
    if not state_path.exists():
        return {}
    state = json.loads(state_path.read_text(encoding="utf-8"))
    pages = state.get("pages", {})
    return {
        title: info.get("categories", [])
        for title, info in pages.items()
        if isinstance(info, dict)
    }


def rebuild_index(db_path: Path, min_importance: float = 0.0) -> dict:
    categories_by_title = load_categories()
    conn = connect(db_path)
    conn.execute("DELETE FROM chunks")
    conn.execute("DELETE FROM articles")
    conn.execute("DELETE FROM chunks_fts")

    stats = {
        "files_scanned": 0,
        "articles_indexed": 0,
        "chunks_indexed": 0,
        "articles_skipped_low_importance": 0,
        "by_topic": {},
        "by_region": {},
    }

    for topic in TOPIC_FOLDERS:
        folder = WIKI_BASE / topic
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            stats["files_scanned"] += 1
            meta, body = parse_article_file(path, topic)
            cats = categories_by_title.get(meta.title, [])
            importance = score_article(meta.title, topic, cats)
            if importance < min_importance:
                stats["articles_skipped_low_importance"] += 1
                continue
            sample = body[:2000]
            regions = tag_regions(meta.title, sample, cats)
            chunks = chunk_article(meta, body)
            if not chunks:
                continue
            word_count = sum(c.word_count for c in chunks)
            conn.execute(
                """
                INSERT INTO articles(title, topic_folder, source_path, source_url,
                    importance, region_tags, word_count, chunk_count, categories)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    meta.title,
                    topic,
                    meta.source_path,
                    meta.source_url,
                    importance,
                    json.dumps(regions),
                    word_count,
                    len(chunks),
                    json.dumps(cats[:8]),
                ),
            )
            stats["articles_indexed"] += 1
            stats["by_topic"][topic] = stats["by_topic"].get(topic, 0) + 1
            for r in regions:
                stats["by_region"][r] = stats["by_region"].get(r, 0) + 1
            for ch in chunks:
                conn.execute(
                    """
                    INSERT INTO chunks(chunk_id, article_title, topic_folder, section,
                        text, source_path, importance, region_tags, word_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ch.chunk_id,
                        ch.article_title,
                        ch.topic_folder,
                        ch.section,
                        ch.text,
                        ch.source_path,
                        importance,
                        json.dumps(regions),
                        ch.word_count,
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO chunks_fts(chunk_id, article_title, topic_folder, section, region_tags, text)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ch.chunk_id,
                        ch.article_title,
                        ch.topic_folder,
                        ch.section,
                        json.dumps(regions),
                        ch.text,
                    ),
                )
                stats["chunks_indexed"] += 1

    conn.commit()
    conn.close()
    return stats


def write_status(db_path: Path, build_stats: dict) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    manifest_generated = 0
    regions_dir = ROOT / "lesson plans" / "10-regions"
    if regions_dir.is_dir():
        manifest_generated = len(list(regions_dir.rglob("*.md")))

    row = conn.execute(
        "SELECT COUNT(*) AS n, AVG(importance) AS avg_imp FROM articles WHERE importance >= 0.5"
    ).fetchone()
    chunk_row = conn.execute("SELECT COUNT(*) AS n FROM chunks").fetchone()
    conn.close()

    status = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "progress_metric": "indexed_chunks",
        "indexed_articles": build_stats.get("articles_indexed", 0),
        "indexed_chunks": chunk_row["n"] if chunk_row else 0,
        "high_value_articles": row["n"] if row else 0,
        "mean_importance_high_value": round(row["avg_imp"] or 0, 3),
        "manifest_lessons_generated": manifest_generated,
        "files_scanned": build_stats.get("files_scanned", 0),
        "articles_skipped_low_importance": build_stats.get("articles_skipped_low_importance", 0),
        "by_topic": build_stats.get("by_topic", {}),
        "by_region": build_stats.get("by_region", {}),
        "db_path": str(db_path),
        "note": "Corpus progress is measured by indexed pedagogical chunks, not raw download count.",
    }
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(status, indent=2), encoding="utf-8")
    return status


def main() -> None:
    parser = argparse.ArgumentParser(description="Build wiki FTS index for lesson plans")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--min-importance", type=float, default=0.0)
    args = parser.parse_args()
    stats = rebuild_index(args.db, args.min_importance)
    Path(args.db.parent / ".last_build_stats.json").write_text(
        json.dumps(stats, indent=2), encoding="utf-8"
    )
    status = write_status(args.db, stats)
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
