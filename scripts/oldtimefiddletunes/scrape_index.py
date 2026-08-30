#!/usr/bin/env python3
"""Scrape https://www.oldtimefiddletunes.net/ index into data/index.json."""

from __future__ import annotations

import argparse
import html as html_lib
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common import (  # noqa: E402
    INDEX_PATH,
    SITE_INDEX_URL,
    SITE_ORIGIN,
    absolute_url,
    ensure_dir,
    load_manifest,
    media_fingerprint,
    request_bytes,
    save_json,
    save_manifest,
    slug_from_pdf_url,
    slugify,
    utc_now_iso,
)

HEADING_RE = re.compile(r"<h([123])\b[^>]*>(.*?)</h\1>", re.I | re.S)
PDF_HREF_RE = re.compile(
    r'<a\s+[^>]*href\s*=\s*(?:"([^"]+\.pdf)"|\'([^\']+\.pdf)\')[^>]*>(.*?)</a>',
    re.I | re.S,
)
HREF_ANY_RE = re.compile(
    r'<a\s+[^>]*href\s*=\s*(?:"([^"]+)"|\'([^\']+)\')[^>]*>',
    re.I,
)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
KEY_TAIL_RE = re.compile(
    r"\b([A-G](?:[#b]|flat|sharp)?)\s*(mix|dor|m|maj|min|lyd|phr|loc)?\s*$",
    re.I,
)
SUB_KEY_RE = re.compile(
    r"([A-G])(?:\s|&nbsp;)*<(?:sub|SUP)[^>]*>\s*(mix|dor|m|maj|min|lyd|phr|loc)\s*</(?:sub|SUP)>",
    re.I,
)


def strip_tags(raw: str) -> str:
    text = TAG_RE.sub(" ", raw or "")
    text = html_lib.unescape(text)
    text = text.replace("\xa0", " ")
    return WS_RE.sub(" ", text).strip()


def section_slug(name: str) -> str:
    s = slugify(name)
    return s[:48] if s else "section"


def extract_key_and_notes(raw_html_after_title: str) -> tuple[str, str]:
    """Parse parenthetical attribution / key from text after the PDF title link."""
    key = ""
    # Prefer <sub>mix</sub> style keys
    m = SUB_KEY_RE.search(raw_html_after_title or "")
    if m:
        key = m.group(1).upper() + m.group(2).lower()
    text = strip_tags(raw_html_after_title or "")
    # Often "(Source Key)" immediately after title
    paren = re.search(r"^\s*\(([^)]*)\)", text)
    notes = ""
    if paren:
        notes = paren.group(1).strip()
        if not key:
            km = KEY_TAIL_RE.search(notes)
            if km:
                root = km.group(1)
                mode = (km.group(2) or "").lower()
                if root.lower().endswith("flat"):
                    root = root[0].upper() + "b"
                elif root.lower().endswith("sharp"):
                    root = root[0].upper() + "#"
                else:
                    root = root[0].upper() + root[1:]
                key = root + mode
    return key, notes


def classify_href(href: str) -> str | None:
    low = href.lower()
    if low.endswith(".pdf"):
        return "pdf"
    if low.endswith(".mid") or low.endswith(".midi"):
        return "midi"
    if low.endswith(".mp3") or low.endswith(".wav") or low.endswith(".ogg"):
        return "audio"
    if "youtu.be/" in low or "youtube.com/" in low:
        return "youtube"
    if "strum" in low or "backing" in low:
        return "backing"
    return None


VARIANT_TITLE_RE = re.compile(
    r"^(?:with\s+)?(?:w/)?harmony$|^melody\+harmony$|^harmony$",
    re.I,
)


def parse_index_html(html: str) -> list[dict]:
    """Parse the single-page index into tune dicts."""
    # Build section map by character offset of headings
    sections: list[tuple[int, str]] = []
    for m in HEADING_RE.finditer(html):
        title = strip_tags(m.group(2))
        if title:
            sections.append((m.start(), title))

    def section_at(pos: int) -> str:
        current = "Old Time Fiddle Tunes"
        for start, name in sections:
            if start <= pos:
                current = name
            else:
                break
        return current

    tunes: list[dict] = []
    seen_slugs: set[str] = set()
    pdf_matches = list(PDF_HREF_RE.finditer(html))
    for i, m in enumerate(pdf_matches):
        pdf_href = m.group(1) or m.group(2) or ""
        title = strip_tags(m.group(3) or "")
        if not title:
            continue
        start = m.end()
        end = pdf_matches[i + 1].start() if i + 1 < len(pdf_matches) else len(html)
        next_h = HEADING_RE.search(html, start, end)
        if next_h:
            end = min(end, next_h.start())
        chunk = html[start:end]
        lead = chunk[:800]
        key, notes = extract_key_and_notes(lead)

        pdf_url = absolute_url(pdf_href)
        slug = slug_from_pdf_url(pdf_url)

        midi_url = ""
        audio_urls: list[str] = []
        youtube_urls: list[str] = []
        backing_urls: list[str] = []
        for hm in HREF_ANY_RE.finditer(chunk):
            href = absolute_url(hm.group(1) or hm.group(2) or "")
            kind = classify_href(href)
            if kind == "midi" and not midi_url:
                midi_url = href
            elif kind == "audio":
                if href not in audio_urls:
                    audio_urls.append(href)
            elif kind == "youtube":
                if href not in youtube_urls:
                    youtube_urls.append(href)
            elif kind == "backing":
                if href not in backing_urls:
                    backing_urls.append(href)

        # Fold "with harmony" style PDFs into the previous primary tune
        if VARIANT_TITLE_RE.match(title) and tunes:
            prev = tunes[-1]
            alts = list(prev.get("altPdfUrls") or [])
            if pdf_url not in alts and pdf_url != prev.get("pdfUrl"):
                alts.append(pdf_url)
            prev["altPdfUrls"] = alts
            if midi_url and not prev.get("midiUrl"):
                prev["midiUrl"] = midi_url
            for u in audio_urls:
                if u not in prev["audioUrls"]:
                    prev["audioUrls"].append(u)
            for u in youtube_urls:
                if u not in prev["youtubeUrls"]:
                    prev["youtubeUrls"].append(u)
            for u in backing_urls:
                if u not in prev["backingUrls"]:
                    prev["backingUrls"].append(u)
            prev["fingerprint"] = media_fingerprint(prev)
            continue

        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        section = section_at(m.start())
        tune = {
            "slug": slug,
            "title": title,
            "key": key,
            "notes": notes,
            "section": section,
            "sectionTag": section_slug(section),
            "pdfUrl": pdf_url,
            "altPdfUrls": [],
            "midiUrl": midi_url,
            "audioUrls": audio_urls,
            "youtubeUrls": youtube_urls,
            "backingUrls": backing_urls,
            "sourcePage": SITE_INDEX_URL,
        }
        tune["fingerprint"] = media_fingerprint(tune)
        tunes.append(tune)
    return tunes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--html",
        type=Path,
        help="Use local HTML file instead of fetching the live index",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=INDEX_PATH,
        help=f"Output index JSON (default: {INDEX_PATH})",
    )
    args = parser.parse_args(argv)

    ensure_dir(args.out.parent)
    if args.html:
        html = args.html.read_text(encoding="utf-8", errors="replace")
        status = 200
    else:
        status, _meta, body = request_bytes(SITE_INDEX_URL)
        if status != 200:
            print(f"Failed to fetch index: HTTP {status}", file=sys.stderr)
            return 1
        html = body.decode("latin-1", errors="replace")

    tunes = parse_index_html(html)
    payload = {
        "source": "oldtimefiddletunes.net",
        "fetched_at": utc_now_iso(),
        "index_url": SITE_INDEX_URL,
        "tune_count": len(tunes),
        "tunes": tunes,
    }
    save_json(args.out, payload)

    manifest = load_manifest()
    entries = manifest.setdefault("entries", {})
    for tune in tunes:
        slug = tune["slug"]
        prev = entries.get(slug) or {}
        entries[slug] = {
            "slug": slug,
            "title": tune["title"],
            "fingerprint": tune["fingerprint"],
            "pdfUrl": tune["pdfUrl"],
            "midiUrl": tune.get("midiUrl") or "",
            "updated_at": utc_now_iso(),
            "previous_fingerprint": prev.get("fingerprint"),
        }
    save_manifest(manifest)

    with_midi = sum(1 for t in tunes if t.get("midiUrl"))
    with_audio = sum(1 for t in tunes if t.get("audioUrls"))
    with_yt = sum(1 for t in tunes if t.get("youtubeUrls"))
    print(
        f"Wrote {len(tunes)} tunes → {args.out} "
        f"(midi={with_midi} audio={with_audio} youtube={with_yt})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
