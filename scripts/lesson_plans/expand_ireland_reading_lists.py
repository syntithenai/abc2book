#!/usr/bin/env python3
"""Add supplementary reading-list entries to Ireland lesson-meta.json."""

from __future__ import annotations

import json
from pathlib import Path

META_PATH = Path(__file__).resolve().parents[2] / "lesson plans" / "10-regions" / "celtic" / "ireland" / "lesson-meta.json"

EXTRA_READING: dict[str, list[dict]] = {
    "regions-celtic-ireland-01-overview": [
        {"type": "book", "title": "Last Night's Fun", "author": "Ciaran Carson", "note": "Sessions, craic, and Belfast trad culture"},
        {"type": "book", "title": "Irish Music: A Fascinating Hobby", "author": "Brendan Breathnach", "note": "Classic introduction to tune types and session life"},
        {"type": "book", "title": "Tuned Out: Traditional Music and Identity in Northern Ireland", "author": "Martin Stokes", "note": "Ethnomusicology of regional identity"},
        {"type": "link", "title": "TG4 — Irish-language media", "url": "https://www.tg4.ie/", "note": "Programmes on sean-nós and Gaeltacht culture"},
        {"type": "link", "title": "RTÉ Raidió na Gaeltachta", "url": "https://www.rte.ie/rnag/", "note": "Irish-language radio with traditional music"},
        {"type": "link", "title": "Fleadh Cheoil archive", "url": "https://comhaltas.ie/music/detail/fleadh_cheoil/", "note": "Competition history and results"},
        {"type": "link", "title": "UNESCO — Uilleann piping", "url": "https://ich.unesco.org/en/RL/uilleann-piping-01207", "note": "Intangible heritage listing"},
        {"type": "link", "title": "The Session", "url": "https://thesession.org/", "note": "Tune database and session etiquette discussions"},
    ],
    "regions-celtic-ireland-02-instruments-voices-i": [
        {"type": "book", "title": "The Irish Flute", "author": "Fintan Vallely", "note": "Wooden flute technique and repertoire"},
        {"type": "book", "title": "The Tin Whistle", "author": "Fintan Vallely", "note": "Whistle ornamentation and repertoire"},
        {"type": "book", "title": "The Irish Fiddle", "author": "Fintan Vallely", "note": "Regional bowing and ornament"},
        {"type": "link", "title": "Willie Clancy Summer School", "url": "https://www.willieclancy.com/", "note": "Piping and fiddle masterclasses"},
        {"type": "link", "title": "ITMA — Michael Coleman recordings", "url": "https://www.itma.ie/", "note": "78 rpm transfers and biographical notes"},
        {"type": "link", "title": "Cairdeas na bhFidiléirí", "url": "https://www.donegalfiddle.com/", "note": "Donegal fiddle preservation"},
        {"type": "link", "title": "Na Píobairí Uilleann — tutors", "url": "https://pipers.ie/teachers/", "note": "Registered pipe teachers worldwide"},
        {"type": "link", "title": "Trinity College harp", "url": "https://www.tcd.ie/library/manuscripts/book-of-kells/", "note": "Medieval harp context (Book of Kells collection)"},
    ],
    "regions-celtic-ireland-03-instruments-voices-ii": [
        {"type": "book", "title": "The Irish Bouzouki", "author": "Fintan Vallely", "note": "Adapted instrument in Irish accompaniment"},
        {"type": "book", "title": "The Irish Concertina", "author": "Fintan Vallely", "note": "Anglo concertina in trad"},
        {"type": "link", "title": "Comhaltas — bodhrán tutors", "url": "https://comhaltas.ie/", "note": "Branch classes and workshops"},
        {"type": "link", "title": "Bothy Band discography", "url": "https://en.wikipedia.org/wiki/The_Bothy_Band", "note": "Iconic 1970s ensemble sound"},
        {"type": "link", "title": "The Chieftains", "url": "https://www.thechieftains.com/", "note": "Long-running ensemble recordings"},
        {"type": "link", "title": "ITMA — sean-nós song", "url": "https://www.itma.ie/digitallibrary/", "note": "Field recordings and song archives"},
        {"type": "link", "title": "TG4 — Fleadh TV", "url": "https://www.tg4.ie/", "note": "Competition and concert broadcasts"},
        {"type": "link", "title": "Crúit Éireann / Harp Ireland", "url": "https://harpireland.ie/", "note": "Harp teachers and festivals"},
    ],
    "regions-celtic-ireland-04-genres-forms": [
        {"type": "book", "title": "The Dance Music of Ireland", "author": "Brendan Breathnach", "note": "Ceol Rince na hÉireann tune collections"},
        {"type": "book", "title": "Irish Music: 400 Years of Musical History", "author": "Harry Long", "note": "Historical survey of forms"},
        {"type": "link", "title": "The Session — reels", "url": "https://thesession.org/tunes/reels", "note": "Repertoire by tune type"},
        {"type": "link", "title": "The Session — jigs", "url": "https://thesession.org/tunes/jigs", "note": "Double and single jigs"},
        {"type": "link", "title": "ITMA — Sliabh Luachra", "url": "https://www.itma.ie/", "note": "Polka and slide recordings"},
        {"type": "link", "title": "Comhaltas tune books", "url": "https://comhaltas.ie/music/", "note": "Published collections by form"},
        {"type": "link", "title": "Slow air resources", "url": "https://www.itma.ie/digitallibrary/", "note": "Song airs and instrumental settings"},
        {"type": "link", "title": "O'Neill's 1850 — IMSLP", "url": "https://imslp.org/wiki/Music_of_Ireland_(O%27Neill,_Francis)", "note": "Public-domain tune book scan"},
    ],
    "regions-celtic-ireland-05-dance": [
        {"type": "book", "title": "Irish Dancing", "author": "Arthur Flynn", "note": "Step dance history and competition"},
        {"type": "book", "title": "The Story of Irish Dance", "author": "Helen Brennan", "note": "From céilí to stage spectacle"},
        {"type": "link", "title": "CLRG — syllabus", "url": "https://www.clrg.ie/", "note": "Competition rules and grades"},
        {"type": "link", "title": "An Coimisiún — world championships", "url": "https://www.clrg.ie/", "note": "Oireachtas Rince na Cruinne"},
        {"type": "link", "title": "Set dancing — Dublin", "url": "https://www.setdancingnews.net/", "note": "Regional set dance figures"},
        {"type": "link", "title": "Bill Lynch — céilí band archive", "url": "https://www.itma.ie/", "note": "Dance-band recordings at ITMA"},
        {"type": "link", "title": "TG4 — Fleadh dance", "url": "https://www.tg4.ie/", "note": "Televised competition footage"},
        {"type": "link", "title": "Feis Ceoil", "url": "https://www.feisceoil.ie/", "note": "Classical and traditional competition festival"},
    ],
    "regions-celtic-ireland-06-history": [
        {"type": "book", "title": "A Hidden Order: The Oral History of Irish Traditional Music", "author": "Harry Long", "note": "Transmission and collectors"},
        {"type": "book", "title": "The Chief: The Life of Francis O'Neill", "author": "Nicholas Carolan", "note": "Chicago police chief and tune collector"},
        {"type": "link", "title": "ITMA — Petrie collection", "url": "https://www.itma.ie/", "note": "19th-century manuscript sources"},
        {"type": "link", "title": "Bunting manuscripts", "url": "https://www.itma.ie/digitallibrary/", "note": "Harp festival transcriptions"},
        {"type": "link", "title": "Willie Clancy Summer School history", "url": "https://www.willieclancy.com/about/", "note": "Miltown Malbay festival origins"},
        {"type": "link", "title": "Comhaltas founding", "url": "https://comhaltas.ie/about/", "note": "1951 Mullingar meeting"},
        {"type": "link", "title": "Library of Congress — Irish collections", "url": "https://www.loc.gov/collections/", "note": "Field recordings and 78s"},
        {"type": "link", "title": "Irish emigration and music", "url": "https://www.itma.ie/", "note": "Diaspora archives and research"},
    ],
    "regions-celtic-ireland-07-representative-depth": [
        {"type": "book", "title": "Irish Folk, Trad and Blues: A Secret History", "author": "Colin Harper", "note": "Expanded edition context"},
        {"type": "book", "title": "Noisy at the Wrong Times", "author": "Mark Hodkinson", "note": "Shane MacGowan and The Pogues"},
        {"type": "link", "title": "Planxty", "url": "https://en.wikipedia.org/wiki/Planxty", "note": "1970s supergroup influence"},
        {"type": "link", "title": "The Dubliners", "url": "https://en.wikipedia.org/wiki/The_Dubliners", "note": "Ballad group legacy"},
        {"type": "link", "title": "Sinead O'Connor — trad connections", "url": "https://www.itma.ie/", "note": "ITMA interviews and archives"},
        {"type": "link", "title": "Moving Hearts", "url": "https://en.wikipedia.org/wiki/Moving_Hearts", "note": "Christy Moore and fusion"},
        {"type": "link", "title": "Irish showband archive", "url": "https://www.itma.ie/", "note": "Big Tom era recordings"},
        {"type": "link", "title": "RTÉ — Irish music documentaries", "url": "https://www.rte.ie/culture/", "note": "Television history features"},
    ],
    "regions-celtic-ireland-08-tunes": [
        {"type": "book", "title": "The Dance Music of Ireland (vols 1–5)", "author": "Brendan Breathnach", "note": "Standard reference settings"},
        {"type": "book", "title": "The Northern Fiddler", "author": "Caoimhín Mac Aoidh", "note": "Donegal repertoire and players"},
        {"type": "link", "title": "The Session — tune comments", "url": "https://thesession.org/tunes", "note": "Alternate versions and keys"},
        {"type": "link", "title": "ITMA — tune manuscripts", "url": "https://www.itma.ie/digitallibrary/", "note": "Historical settings"},
        {"type": "link", "title": "Comhaltas tune of the week", "url": "https://comhaltas.ie/music/", "note": "Learning resources"},
        {"type": "link", "title": "Alan Ng's tunography", "url": "http://www.irishtrad.com/", "note": "Tune title index and discography"},
        {"type": "link", "title": "Feadóga Stáin — Mary Bergin", "url": "https://www.itma.ie/", "note": "Whistle repertoire recordings"},
        {"type": "link", "title": "O'Neill 1001 — online index", "url": "https://www.irishtune.info/", "note": "Cross-reference O'Neill numbers"},
    ],
}


def dedupe_items(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        key = (item.get("title", "") + "|" + item.get("url", "")).lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def main() -> None:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    for lesson_id, extras in EXTRA_READING.items():
        if lesson_id not in meta:
            continue
        current = list(meta[lesson_id].get("reading_list") or [])
        merged = dedupe_items(current + extras)
        meta[lesson_id]["reading_list"] = merged
        print(f"{lesson_id}: {len(current)} -> {len(merged)} reading items")
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
