"""Bulk import line formatting (mirrors src/bulkListFormat.js)."""

from __future__ import annotations

import re


def parse_bulk_line(line: str) -> dict[str, str] | None:
    trimmed = str(line or "").strip()
    if not trimmed:
        return None

    title_part = trimmed
    link = ""
    pipe_idx = trimmed.find("|")
    if pipe_idx >= 0:
        title_part = trimmed[:pipe_idx].strip()
        link = trimmed[pipe_idx + 1 :].strip()

    if re.match(r"^https?://", trimmed, re.I) and not title_part:
        return {"title": "", "artist": "", "link": trimmed}

    by_match = re.match(r"^(.+?)\s+by\s+(.+)$", title_part, re.I)
    if by_match:
        return {"title": by_match.group(1).strip(), "artist": by_match.group(2).strip(), "link": link}

    dash = re.match(r"^(.+?)\s*[—–-]\s*(.+)$", title_part)
    if dash:
        return {"title": dash.group(1).strip(), "artist": dash.group(2).strip(), "link": link}

    tab_parts = [p.strip() for p in title_part.split("\t") if p.strip()]
    if len(tab_parts) >= 2:
        return {
            "title": tab_parts[0],
            "artist": tab_parts[1],
            "link": link or (tab_parts[2] if len(tab_parts) > 2 else ""),
        }

    return {"title": title_part, "artist": "", "link": link}


def format_bulk_line(row: dict[str, str]) -> str:
    title = str(row.get("title") or "").strip()
    artist = str(row.get("artist") or "").strip()
    link = str(row.get("link") or "").strip()
    line = title
    if artist:
        line = f"{title} by {artist}"
    if link:
        line = f"{line} | {link}"
    return line.strip()


def normalize_bulk_text(text: str) -> list[str]:
    lines = re.split(r"\r?\n", str(text or ""))
    rows: list[str] = []
    for line in lines:
        parsed = parse_bulk_line(line)
        if not parsed or (not parsed.get("title") and not parsed.get("link")):
            continue
        rows.append(format_bulk_line(parsed))
    return rows
