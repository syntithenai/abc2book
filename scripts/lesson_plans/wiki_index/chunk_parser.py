"""Parse wiki markdown articles into metadata and chunks."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from wiki_index.text_clean import clean_wiki_chunk, is_substantive


@dataclass
class ArticleMeta:
    title: str
    topic_folder: str
    source_path: str
    source_url: str = ""
    scrape_version: int = 0
    image_count: int = 0


@dataclass
class Chunk:
    chunk_id: str
    article_title: str
    topic_folder: str
    section: str
    text: str
    source_path: str
    word_count: int
    heading_level: int = 2


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return {}, raw
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            key, val = line.split(":", 1)
            meta[key.strip()] = val.strip()
    return meta, raw[m.end() :]


def _title_from_path(path: Path) -> str:
    return path.stem


def parse_article_file(path: Path, topic_folder: str) -> tuple[ArticleMeta, str]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    fm, body = _parse_frontmatter(raw)
    title = _title_from_path(path)
    # Skip boilerplate header before first real content section.
    if body.startswith("# "):
        parts = body.split("\n---\n", 1)
        body = parts[1] if len(parts) > 1 else body
    meta = ArticleMeta(
        title=title,
        topic_folder=topic_folder,
        source_path=str(path),
        source_url=fm.get("source_url", ""),
        scrape_version=int(fm.get("scrape_version", "0") or 0),
        image_count=int(fm.get("image_count", "0") or 0),
    )
    return meta, body.strip()


def _chunk_id(meta: ArticleMeta, heading: str, idx: int, text: str) -> str:
    digest = hashlib.md5(f"{meta.source_path}:{heading}:{idx}:{text[:64]}".encode()).hexdigest()[:10]
    return f"{meta.topic_folder}::{meta.title}::{idx}::{digest}"


def chunk_article(meta: ArticleMeta, body: str, max_words: int = 600) -> list[Chunk]:
    """Split article body on headings; sub-split long sections."""
    chunks: list[Chunk] = []
    sections: list[tuple[str, int, str]] = []

    matches = list(HEADING_RE.finditer(body))
    if not matches:
        preamble = body.strip()
        if preamble:
            sections.append(("Overview", 0, preamble))
    else:
        preamble = body[: matches[0].start()].strip()
        if preamble:
            sections.append(("Overview", 0, preamble))
        for i, m in enumerate(matches):
            level = len(m.group(1))
            heading = m.group(2).strip()
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
            sections.append((heading, level, body[start:end].strip()))

    idx = 0
    for heading, level, text in sections:
        text = clean_wiki_chunk(text)
        if not text:
            continue
        words = text.split()
        if len(words) <= max_words and is_substantive(text, min_words=25):
            idx += 1
            cid = _chunk_id(meta, heading or "body", idx, text)
            chunks.append(
                Chunk(
                    chunk_id=cid,
                    article_title=meta.title,
                    topic_folder=meta.topic_folder,
                    section=heading or "Overview",
                    text=text,
                    source_path=meta.source_path,
                    word_count=len(words),
                    heading_level=level,
                )
            )
            continue
        if not is_substantive(text, min_words=25):
            continue
        # Split long sections on paragraphs.
        paras = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
        buf: list[str] = []
        buf_words = 0
        for para in paras:
            pw = len(para.split())
            if buf_words + pw > max_words and buf:
                idx += 1
                joined = "\n\n".join(buf)
                cid = _chunk_id(meta, heading or "body", idx, text)
                chunks.append(
                    Chunk(
                        chunk_id=cid,
                        article_title=meta.title,
                        topic_folder=meta.topic_folder,
                        section=heading or "Overview",
                        text=joined,
                        source_path=meta.source_path,
                        word_count=buf_words,
                        heading_level=level,
                    )
                )
                buf = [para]
                buf_words = pw
            else:
                buf.append(para)
                buf_words += pw
        if buf:
            idx += 1
            joined = "\n\n".join(buf)
            cid = _chunk_id(meta, heading or "body", idx, text)
            chunks.append(
                Chunk(
                    chunk_id=cid,
                    article_title=meta.title,
                    topic_folder=meta.topic_folder,
                    section=heading or "Overview",
                    text=joined,
                    source_path=meta.source_path,
                    word_count=buf_words,
                    heading_level=level,
                )
            )
    return chunks
