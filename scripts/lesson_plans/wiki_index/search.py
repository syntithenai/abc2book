"""FTS search over wiki index."""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[3] / "lesson plans" / "wiki_index" / "wiki.db"


@dataclass
class SearchHit:
    chunk_id: str
    article_title: str
    topic_folder: str
    section: str
    text: str
    importance: float
    region_tags: list[str]
    score: float

    @property
    def word_count(self) -> int:
        return len(self.text.split())


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _fts_query(raw: str) -> str:
    tokens = re.findall(r"[A-Za-z0-9]+", raw.lower())
    tokens = [t for t in tokens if len(t) > 2][:12]
    if not tokens:
        return ""
    return " OR ".join(tokens)


def search_chunks(
    query: str,
    *,
    db_path: Path = DEFAULT_DB,
    limit: int = 12,
    min_importance: float = 0.5,
    topic_folder: str | None = None,
    region: str | None = None,
    article_titles: list[str] | None = None,
) -> list[SearchHit]:
    fts_q = _fts_query(query)
    conn = _connect(db_path)
    hits: list[SearchHit] = []

    if fts_q:
        rows = conn.execute(
            """
            SELECT c.chunk_id, c.article_title, c.topic_folder, c.section, c.text,
                   c.importance, c.region_tags,
                   bm25(chunks_fts) AS rank
            FROM chunks_fts f
            JOIN chunks c ON c.chunk_id = f.chunk_id
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (fts_q, limit * 4),
        ).fetchall()
    else:
        rows = []

    if not rows and article_titles:
        placeholders = ",".join("?" for _ in article_titles)
        rows = conn.execute(
            f"""
            SELECT chunk_id, article_title, topic_folder, section, text,
                   importance, region_tags, 0 AS rank
            FROM chunks
            WHERE article_title IN ({placeholders})
            ORDER BY importance DESC, word_count DESC
            LIMIT ?
            """,
            (*article_titles, limit * 4),
        ).fetchall()

    for row in rows:
        imp = float(row["importance"])
        if imp < min_importance:
            continue
        if topic_folder and row["topic_folder"] != topic_folder:
            continue
        regions = json.loads(row["region_tags"] or "[]")
        if region and region not in regions:
            continue
        if article_titles and row["article_title"] not in article_titles:
            continue
        rank = float(row["rank"] or 0)
        score = imp * 10 - rank
        hits.append(
            SearchHit(
                chunk_id=row["chunk_id"],
                article_title=row["article_title"],
                topic_folder=row["topic_folder"],
                section=row["section"],
                text=row["text"],
                importance=imp,
                region_tags=regions,
                score=score,
            )
        )

    hits.sort(key=lambda h: h.score, reverse=True)
    conn.close()
    return hits[:limit]


def search_chunks_breadth(
    article_titles: list[str],
    *,
    db_path: Path = DEFAULT_DB,
    limit: int = 24,
    chunks_per_article: int = 2,
    min_importance: float = 0.35,
    topic_folder: str | None = None,
    region: str | None = None,
) -> list[SearchHit]:
    """Fetch top chunks per article for wide representative surveys."""
    conn = _connect(db_path)
    hits: list[SearchHit] = []
    placeholders = ",".join("?" for _ in article_titles)

    for title in article_titles:
        rows = conn.execute(
            f"""
            SELECT chunk_id, article_title, topic_folder, section, text,
                   importance, region_tags, 0 AS rank
            FROM chunks
            WHERE article_title = ?
            ORDER BY importance DESC, word_count DESC
            LIMIT ?
            """,
            (title, chunks_per_article * 3),
        ).fetchall()
        added = 0
        for row in rows:
            imp = float(row["importance"])
            if imp < min_importance:
                continue
            if topic_folder and row["topic_folder"] != topic_folder:
                continue
            regions = json.loads(row["region_tags"] or "[]")
            hits.append(
                SearchHit(
                    chunk_id=row["chunk_id"],
                    article_title=row["article_title"],
                    topic_folder=row["topic_folder"],
                    section=row["section"],
                    text=row["text"],
                    importance=imp,
                    region_tags=regions,
                    score=imp,
                )
            )
            added += 1
            if added >= chunks_per_article:
                break

    conn.close()
    hits.sort(key=lambda h: (h.importance, h.word_count), reverse=True)
    return hits[:limit]
