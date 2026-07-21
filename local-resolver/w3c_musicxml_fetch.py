"""Curated W3C / MusicXML.com educational example scores."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from archive_source_config import notation_source_enabled
from chords_fetch import normalize_match_text, score_title_artist_match
from mediawiki_fetch import fetch_binary, musicxml_from_binary_response

W3C_FETCH_TIMEOUT_SECONDS = 20.0
MAX_W3C_CANDIDATES = 3

INDEX_PATH = Path(__file__).resolve().parent / "fixtures" / "archives" / "w3c_musicxml_index.json"

DEFAULT_W3C_INDEX = [
    {
        "title": "Ode to Joy",
        "composer": "Ludwig van Beethoven",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/ode-to-joy.musicxml",
        "keywords": ["ode", "joy", "beethoven", "symphony", "9"],
    },
    {
        "title": "Minuet in G",
        "composer": "Johann Sebastian Bach",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/minuet-in-g.musicxml",
        "keywords": ["minuet", "bach", "g major"],
    },
    {
        "title": "Twinkle Twinkle Little Star",
        "composer": "Traditional",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/twinkle-twinkle-little-star.musicxml",
        "keywords": ["twinkle", "traditional", "nursery"],
    },
]


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def load_w3c_index():
    if INDEX_PATH.is_file():
        try:
            data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list) and data:
                return data
        except Exception:
            pass
    return list(DEFAULT_W3C_INDEX)


def is_w3c_musicxml_url(url):
    text = str(url or "").strip().lower()
    return "musicxml.com" in text and (
        text.endswith(".musicxml") or text.endswith(".xml") or text.endswith(".mxl")
    )


def annotate_w3c_candidate(music_xml, title="", artist="", source_url=""):
    tune_meta = {
        "name": title or "",
        "composer": artist or "",
        "srcUrl": source_url or "",
        "meta": {"importFormat": "musicxml", "archive": "w3c"},
    }
    return {
        "abc": "",
        "musicXml": music_xml,
        "title": title or "",
        "artist": artist or "",
        "source": "musicxml.com",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }


def match_w3c_index_entries(title, artist="", limit=MAX_W3C_CANDIDATES):
    title_key = normalize_match_text(title)
    artist_key = normalize_match_text(artist)
    scored = []
    for entry in load_w3c_index():
        if not isinstance(entry, dict):
            continue
        entry_title = str(entry.get("title") or "")
        entry_artist = str(entry.get("composer") or "")
        score = score_title_artist_match(entry_title, entry_artist, title, artist)
        keywords = entry.get("keywords") or []
        if isinstance(keywords, list):
            for keyword in keywords:
                key = normalize_match_text(keyword)
                if key and (key in title_key or key in artist_key):
                    score += 8
        if score >= 35:
            scored.append((score, entry))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[:limit]]


async def fetch_w3c_musicxml_url(url, on_progress=None, client=None):
    if not is_w3c_musicxml_url(url):
        raise ValueError("Not a supported W3C MusicXML example URL")
    await _emit_progress(on_progress, "w3c", "Fetching MusicXML example...", 0.5)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=W3C_FETCH_TIMEOUT_SECONDS)
    try:
        response = await fetch_binary(client, url, referer="https://www.musicxml.com/")
        music_xml = await musicxml_from_binary_response(response)
        if not music_xml:
            raise ValueError("Could not download MusicXML example")
        await _emit_progress(on_progress, "w3c", "MusicXML example ready", 1.0)
        return annotate_w3c_candidate(music_xml, source_url=url)
    finally:
        if owns_client:
            await client.aclose()


async def collect_w3c_examples_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("w3c"):
        return []
    await _emit_progress(on_progress, "w3c", "Searching MusicXML examples...", 0.2)
    entries = match_w3c_index_entries(title, artist)
    candidates = []
    for entry in entries:
        url = str(entry.get("url") or "").strip()
        if not url:
            continue
        try:
            candidate = await fetch_w3c_musicxml_url(url, on_progress=on_progress, client=client)
            candidate["title"] = str(entry.get("title") or candidate.get("title") or "")
            candidate["artist"] = str(entry.get("composer") or candidate.get("artist") or "")
            tune_meta = dict(candidate.get("tuneMeta") or {})
            tune_meta["name"] = candidate["title"]
            tune_meta["composer"] = candidate["artist"]
            candidate["tuneMeta"] = tune_meta
            candidates.append(candidate)
        except Exception:
            continue
    return candidates
