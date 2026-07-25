"""Extract image URLs from wikimusic markdown articles."""

from __future__ import annotations

import re
from pathlib import Path

WIKI_ROOT = Path.home() / "Downloads" / "wikimusic"
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\((https?://[^)]+)\)")


def images_from_markdown(text: str, limit: int = 3) -> list[str]:
    urls: list[str] = []
    for m in _IMAGE_RE.finditer(text):
        url = m.group(1)
        if "sound-openclipart" in url or url.endswith(".svg.png"):
            continue
        if url not in urls:
            urls.append(url)
        if len(urls) >= limit:
            break
    return urls


def images_for_article(title: str, topic_folders: list[str] | None = None) -> list[str]:
    folders = topic_folders or ["instruments", "history", "dance", "theory"]
    for folder in folders:
        path = WIKI_ROOT / folder / f"{title}.md"
        if path.exists():
            return images_from_markdown(path.read_text(encoding="utf-8", errors="replace"))
    return []
