#!/usr/bin/env python3
"""Scaffold Celtic Music units (Scotland, Wales, Brittany, Diaspora, Comparative)."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CURRICULUM_PATH = ROOT / "lesson plans" / "curriculum.json"
CELTIC_ROOT = ROOT / "lesson plans" / "10-regions" / "celtic"

ID_SUFFIX = {
    "01-overview": "01-overview",
    "02-instruments-traditional-voices-i": "02-instruments-voices-i",
    "03-instruments-session-voices-ii": "03-instruments-voices-ii",
    "04-genres-forms": "04-genres-forms",
    "05-dance": "05-dance",
    "06-history-transmission": "06-history",
    "07-representative-depth": "07-representative-depth",
    "08-tunes": "08-tunes",
}
NATION_LESSONS = [
    ("01-overview", "Overview", 1, ["celtic", "tradition", "overview"]),
    ("02-instruments-traditional-voices-i", "Traditional Voices I", 2, ["instruments", "melody"]),
    ("03-instruments-session-voices-ii", "Session & Social Voices II", 3, ["instruments", "session"]),
    ("04-genres-forms", "Tunes, Forms, and Style", 4, ["forms", "style"]),
    ("05-dance", "Dance and Rhythm", 5, ["dance", "rhythm"]),
    ("06-history-transmission", "History, Revival, and Transmission", 6, ["history", "revival"]),
    ("07-representative-depth", "Representative Fusions and Scenes", 7, ["fusion", "scenes"]),
    ("08-tunes", "Tunes — Forms, History, and Recordings", 4.5, ["tunes", "recordings"]),
]

DIASPORA_LESSONS = [
    ("01-cape-breton", "Cape Breton Fiddle and Dance", 3, ["cape-breton", "diaspora", "fiddle"]),
    ("02-galicia-asturias", "Galicia & Asturias", 3, ["galicia", "asturias", "gaita"]),
    ("03-cornwall-man", "Cornwall & Isle of Man", 3, ["cornwall", "manx", "revival"]),
    ("04-pan-celtic-festivals", "Pan-Celtic Festivals and Institutions", 4, ["festivals", "lorient", "network"]),
    ("05-listening-across-borders", "Listening Across Borders", 4, ["comparative", "playlist"]),
]

COMPARATIVE_LESSONS = [
    ("01-what-celtic-means", "What \"Celtic Music\" Means", 3, ["celtic", "labels", "marketing"]),
    ("02-shared-instruments", "Shared Instruments Compared", 4, ["harp", "pipes", "fiddle"]),
    ("03-tune-forms-compared", "Tune Forms Compared", 4, ["jig", "reel", "strathspey", "gavotte"]),
    ("04-revivals-compared", "Revivals Compared", 5, ["revival", "archives", "broadcast"]),
]

NATIONS = {
    "scotland": {
        "unit": "celtic-scotland",
        "label": "Celtic — Scotland",
        "region": "scotland",
        "title_prefix": "Scottish Traditional Music",
        "compare_intro": (
            "If you completed the Ireland unit, you already know session etiquette, jig/reel vocabulary, "
            "and how revival institutions shape modern trad. Scottish music shares that Gaelic-and-diaspora "
            "family resemblance but emphasises strathspeys, pipe bands, bothy ballads, and ceilidh dance culture."
        ),
        "overview_body": (
            "Scottish traditional music spans Highland and Lowland streams: fiddle dance music, Highland bagpipes, "
            "Gaelic song, Scots song, and the social world of ceilidhs and folk clubs. Sessions exist in pubs and "
            "festivals, but pipe band competitions and Highland games remain uniquely visible public stages."
        ),
        "instruments_i": "fiddle, Highland bagpipes, smallpipes, whistle, and clàrsach (Scottish harp)",
        "instruments_ii": "accordion, piano, guitar, bodhrán-style percussion, and cello in folk ensembles",
        "forms": "reels, strathspeys, jigs, hornpipes, slow airs, and puirt à beul (mouth music)",
        "dance": "ceilidh sets, Highland dancing, step dance, and pipe band drumming",
        "history": "collectors, BBC broadcasting, the folk revival, and piping competitions",
        "fusion": "Battlefield Band, Capercaillie, pub sessions versus games season",
        "tunes": "The Mason's Apron, Drummond Castle, and classic strathspey/reel recordings",
    },
    "wales": {
        "unit": "celtic-wales",
        "label": "Celtic — Wales",
        "region": "wales",
        "title_prefix": "Welsh Traditional Music",
        "compare_intro": (
            "Irish trad foregrounds session tune sets and dance forms like reels and jigs. Welsh tradition equally "
            "values harp and fiddle, but hymnody, male voice choirs, eisteddfod culture, and bilingual song give "
            "the scene a distinct institutional spine."
        ),
        "overview_body": (
            "Welsh traditional music intertwines folk dance, harp repertoire, penillion singing, and chapel hymnody. "
            "The eisteddfod circuit celebrates competitive performance; folk clubs and twmpath dances keep social "
            "dance alive in communities across Wales and the diaspora."
        ),
        "instruments_i": "fiddle, triple harp, pibgorn, and crwth in historical context",
        "instruments_ii": "guitar, accordion, and contemporary folk ensemble voices",
        "forms": "plygi, hornpipes, waltzes, hymn tunes, and penillion counter-melody singing",
        "dance": "twmpath dances, clog stepping, and hwyl in communal singing",
        "history": "chapel influence, industrial south Wales, and the 1970s folk revival",
        "fusion": "Bob Delyn a'r Ebillion, festival culture, and choral crossover",
        "tunes": "Ar Lan y Môr, Cader Idris, and classic harp/fiddle recordings",
    },
    "brittany": {
        "unit": "celtic-brittany",
        "label": "Celtic — Brittany",
        "region": "brittany",
        "title_prefix": "Breton Traditional Music",
        "compare_intro": (
            "Irish sessions centre on melody instruments trading tune sets. Breton fest-noz culture pairs "
            "dance-first circular sets with call-and-response song (kan ha diskan) and distinctive binou-bombard timbres."
        ),
        "overview_body": (
            "Breton traditional music is dance-led: fest-noz nights, gavotte and plinn rhythms, and the paired "
            "sounds of bombard and biniou. Revival movements from the mid-twentieth century rebuilt regional pride "
            "alongside pan-Celtic festival networks."
        ),
        "instruments_i": "bombard, binou (Breton bagpipe), fiddle, and harp",
        "instruments_ii": "accordion, guitar, and bagad (pipe band) ensembles",
        "forms": "gavotte, plinn, mazurka, and son dance tunes",
        "dance": "fest-noz circle dances and regional choreographies",
        "history": "bagad revival, Alan Stivell's fusion era, and archival song collections",
        "fusion": "fest-noz floors versus concert-stage fusion bands",
        "tunes": "Suite Sudarmoricaine repertoire and classic fest-noz sets",
    },
}

QUIZ_TEMPLATE = [
    ("mcq", "Which description best fits the main social context emphasised in this lesson?", "Community dance and oral transmission", ["Concerto competitions only", "Community dance and oral transmission", "Strictly classical conservatory exams", "Electronic dance clubs only"]),
    ("truefalse", "This tradition is identical to Irish traditional music in repertoire and social context.", "False", ["True", "False"]),
    ("mcq", "Compared with Ireland, this unit stresses which additional emphasis?", "See Compared with Ireland section", ["No differences whatsoever", "See Compared with Ireland section", "Only classical opera", "Only hip-hop production"]),
    ("mcq", "A typical learner should prioritise:", "Listening to regional recordings before generic \"Celtic\" compilations", ["Only reading generic textbooks", "Listening to regional recordings before generic \"Celtic\" compilations", "Memorising one tune only", "Ignoring dance context"]),
    ("truefalse", "Sessions, festivals, and archives all play roles in modern transmission.", "True", ["True", "False"]),
    ("mcq", "Instrument focus in this lesson includes:", "Voices named in the lesson introduction", ["Only synthesizers", "Voices named in the lesson introduction", "Only orchestral brass", "Only piano études"]),
    ("mcq", "Dance rhythm topics in this lesson relate to:", "Social dance forms discussed in the body", ["Ballet syllabus only", "Social dance forms discussed in the body", "Marching band drill only", "DJ beatmatching only"]),
    ("truefalse", "Revival movements and media broadcasting shaped twentieth-century practice.", "True", ["True", "False"]),
    ("mcq", "When studying tune forms, you should:", "Connect metre and foot-tap feel to named dance types", ["Ignore metre entirely", "Connect metre and foot-tap feel to named dance types", "Assume all tunes are 4/4 rock beats", "Avoid learning by ear"]),
    ("mcq", "Fusion and modern scenes discussed here:", "Build on—not replace—living tradition", ["Erase all earlier repertoire", "Build on—not replace—living tradition", "Ban all acoustic instruments", "Eliminate festivals"]),
    ("truefalse", "The Compared with Ireland section highlights both shared heritage and national accent.", "True", ["True", "False"]),
    ("mcq", "Best next step after this lesson:", "Follow playlists and return to the paired Ireland lesson", ["Stop listening to recordings", "Follow playlists and return to the paired Ireland lesson", "Skip all prerequisites", "Avoid comparative study"]),
]


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "section"


def quiz_block(lesson_title: str) -> str:
    lines = ["## Quiz Questions", ""]
    for index, (qtype, prompt, answer, options) in enumerate(QUIZ_TEMPLATE, start=1):
        lines.append(f"### Q{index}. {prompt}")
        if qtype == "mcq":
            labels = ["A", "B", "C", "D"]
            for label, option in zip(labels, options):
                lines.append(f"- {label}) {option}")
            correct_label = labels[options.index(answer) if answer in options else 1]
            lines.append(f"**Answer:** {correct_label}) {answer}")
        else:
            lines.append("- A) True")
            lines.append("- B) False")
            correct = "A" if answer == "True" else "B"
            lines.append(f"**Answer:** {correct}) {answer}")
        lines.append(f"*Explanation grounded in {lesson_title}.*")
        lines.append("")
    return "\n".join(lines)


def lesson_markdown(
    *,
    lesson_id: str,
    title: str,
    nation_key: str,
    nation: dict,
    file_slug: str,
    tier: float,
    tags: list[str],
    prerequisites: list[str],
    body_focus: str,
    ireland_parallel: str,
) -> str:
    tag_str = ", ".join(tags + [nation_key, "celtic"])
    prereq = json.dumps(prerequisites)
    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: {nation['region']}
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {prereq}
status: manual
sources: ["Celtic music", "Music of {nation['label'].replace('Celtic — ', '')}"]
---

# {title}

**Track:** Celtic Music | **Region:** {nation['region']} | **Tier:** {tier}
**Prerequisites:** {", ".join(prerequisites)}

## Overview

{nation['overview_body']}

This lesson focuses on **{body_focus}** within {nation['title_prefix'].lower()}. Read it alongside the Ireland unit: shared Celtic family traits meet distinct national accent, repertoire, and institutions.

## Compared with Ireland

{nation['compare_intro']}

**Parallel Ireland lesson:** `{ireland_parallel}` — revisit that chapter when a comparison feels abstract. Note similarities (oral learning, dance-linked repertoire, revival media) and differences named in this section.

## Core material

{body_focus.capitalize()} in {nation['region']} trad is not a copy of Irish practice. Listen for rhythmic feel, language of song, institutional context (competitions, festivals, chapel, fest-noz), and which instruments lead in a room. Use regional recordings rather than generic \"Celtic\" compilations when possible.

### Listening and study habits

1. Identify one field recording and one modern ensemble track mentioned or implied in this lesson's topic.
2. Note the metre and dance association of at least two tune types discussed.
3. Compare session or social-dance etiquette with what you learned from Irish trad.
4. Follow the unit playlist entries in lesson metadata when available.

## Key points

- {nation['title_prefix']} is a living tradition with regional accents, not a museum exhibit.
- Compared with Ireland: shared tune families and diaspora links, distinct social stages and repertoire emphasis.
- {body_focus.capitalize()} connects to dance, song, and community context—not isolated technique only.
- Revival institutions, broadcasting, and festivals shape what learners hear today.
- Use comparative study to hear specificity; avoid flattening everything under \"Celtic\" marketing.

## Reading list

- Regional folk archive or national library listening guides (see lesson metadata links when present).
- Companion to Irish unit readings for cross-border context (Fintan Vallely, *Companion to Irish Traditional Music*).
- Wikipedia articles on Music of {nation['label'].replace('Celtic — ', '')} as orientation, verified against recordings.

{quiz_block(title)}
"""


def diaspora_markdown(lesson_id: str, title: str, file_slug: str, tier: float, tags: list[str], prerequisites: list[str], body: str) -> str:
    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: celtic-diaspora
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {json.dumps(prerequisites)}
status: manual
sources: ["Celtic diaspora", "Celtic music"]
---

# {title}

**Track:** Celtic Music | **Unit:** Diaspora & fringe | **Tier:** {tier}

## Overview

{body}

## Compared with Ireland

Irish diaspora scenes (New York, Chicago, London) exported session culture and tune repertoire worldwide. This lesson traces how **{title.lower()}** relates to that network while developing its own accent.

## Key points

- Diaspora traditions remix Irish and Scottish roots with local dance floors and radio.
- Comparative listening prevents mistaking one region's accent for the whole \"Celtic\" label.
- Festivals and archives connect fringe regions to the pan-Celtic circuit.

{quiz_block(title)}
"""


def comparative_markdown(lesson_id: str, title: str, file_slug: str, tier: float, tags: list[str], prerequisites: list[str], body: str) -> str:
    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: celtic-comparative
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {json.dumps(prerequisites)}
status: manual
sources: ["Pan-Celtic comparative study", "Celtic music"]
---

# {title}

**Track:** Celtic Music | **Unit:** Pan-Celtic comparative | **Tier:** {tier}

## Overview

{body}

## Compared with Ireland

Use Ireland as the reference tradition you studied first: when this lesson names a shared instrument or tune form, ask how Irish session practice differs from Scottish, Welsh, or Breton contexts.

## Key points

- \"Celtic\" is a useful map, not a single repertoire.
- Ireland provides one deep anchor; other nations add necessary contrast.
- Marketing labels often flatten regional specificity—compare recordings, not only album covers.

{quiz_block(title)}
"""


def meta_skeleton(lesson_id: str, title: str, key_points: list[str]) -> dict:
    return {
        "entities": [],
        "playlist": [],
        "key_points": key_points,
        "reading_list": [
            {"type": "link", "title": title + " — orientation", "url": "https://en.wikipedia.org/wiki/Celtic_music"},
        ],
    }


def ireland_parallel_id(index: int) -> str:
    mapping = {
        0: "regions-celtic-ireland-01-overview",
        1: "regions-celtic-ireland-02-instruments-voices-i",
        2: "regions-celtic-ireland-03-instruments-voices-ii",
        3: "regions-celtic-ireland-04-genres-forms",
        4: "regions-celtic-ireland-05-dance",
        5: "regions-celtic-ireland-06-history",
        6: "regions-celtic-ireland-07-representative-depth",
        7: "regions-celtic-ireland-08-tunes",
    }
    return mapping.get(index, "regions-celtic-ireland-01-overview")


def nation_body_focus(nation: dict, index: int) -> str:
    keys = ["overview_body", "instruments_i", "instruments_ii", "forms", "dance", "history", "fusion", "tunes"]
    key = keys[index]
    return nation.get(key, nation["overview_body"])


def scaffold_nation(nation_key: str, nation: dict) -> list[dict]:
    unit_dir = CELTIC_ROOT / nation_key
    unit_dir.mkdir(parents=True, exist_ok=True)
    meta: dict[str, dict] = {}
    slots: list[dict] = []
    prev_id = "regions-celtic-ireland-07-representative-depth"
    for index, (file_slug, short_title, tier, extra_tags) in enumerate(NATION_LESSONS):
        lesson_id = f"regions-celtic-{nation_key}-{ID_SUFFIX[file_slug]}"
        title = f"{nation['title_prefix']} — {short_title}" if short_title != "Overview" else f"{nation['title_prefix']} — Overview"
        if short_title == "Traditional Voices I":
            title = f"{nation['title_prefix'].replace('Music', 'Instruments')} — Traditional Voices I"
        if short_title == "Session & Social Voices II":
            title = f"{nation['title_prefix'].replace('Music', 'Instruments')} — Session Voices II"
        prerequisites = [prev_id] if index else ["regions-celtic-ireland-01-overview"]
        if index == 0:
            prerequisites = ["regions-celtic-ireland-01-overview"]
        tags = [nation_key, "celtic"] + extra_tags
        output = f"10-regions/celtic/{nation_key}/{file_slug}.md"
        slot = {
            "id": lesson_id,
            "unit": nation["unit"],
            "track": "regions",
            "tier": tier,
            "region": nation["region"],
            "title": title,
            "difficulty": min(10, int(tier) + 2),
            "prerequisites": prerequisites,
            "tags": tags,
            "output": output,
            "status": "manual",
        }
        slots.append(slot)
        body = lesson_markdown(
            lesson_id=lesson_id,
            title=title,
            nation_key=nation_key,
            nation=nation,
            file_slug=file_slug,
            tier=tier,
            tags=tags,
            prerequisites=prerequisites,
            body_focus=nation_body_focus(nation, index),
            ireland_parallel=ireland_parallel_id(index),
        )
        (unit_dir / f"{file_slug}.md").write_text(body, encoding="utf-8")
        meta[lesson_id] = meta_skeleton(
            lesson_id,
            title,
            [
                f"{nation['title_prefix']} rewards comparative study with Ireland.",
                f"Focus: {nation_body_focus(nation, index)}.",
                "Listen for regional accent, not generic Celtic cliché.",
                "Sessions, festivals, and archives all transmit repertoire.",
                "Dance metre and tune form belong together in study.",
            ],
        )
        prev_id = lesson_id
    (unit_dir / "lesson-meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return slots


def main() -> None:
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    curriculum["tracks"]["regions"]["label"] = "Celtic Music"
    units = curriculum.setdefault("units", {})
    units["celtic-ireland"]["label"] = "Celtic — Ireland"
    units["celtic-scotland"] = {"track": "regions", "label": "Celtic — Scotland", "region": "scotland", "status": "draft"}
    units["celtic-wales"] = {"track": "regions", "label": "Celtic — Wales", "region": "wales", "status": "draft"}
    units["celtic-brittany"] = {"track": "regions", "label": "Celtic — Brittany", "region": "brittany", "status": "draft"}
    units["celtic-diaspora"] = {"track": "regions", "label": "Celtic — Diaspora & fringe", "region": "celtic-diaspora", "status": "draft"}
    units["celtic-comparative"] = {"track": "regions", "label": "Celtic — Comparative", "region": "celtic-comparative", "status": "draft"}

    new_slots: list[dict] = []
    for nation_key, nation in NATIONS.items():
        new_slots.extend(scaffold_nation(nation_key, nation))

    diaspora_dir = CELTIC_ROOT / "diaspora"
    diaspora_dir.mkdir(parents=True, exist_ok=True)
    diaspora_meta: dict[str, dict] = {}
    prev = "regions-celtic-brittany-08-tunes"
    diaspora_bodies = {
        "01-cape-breton": "Cape Breton fiddle style synthesises Scottish and Irish roots with step-dance rhythm and square/set dance culture in Nova Scotia.",
        "02-galicia-asturias": "Galician gaita and Asturian pipe traditions participate in pan-Celtic networks while retaining Iberian dance forms like the muiñeira.",
        "03-cornwall-man": "Cornish and Manx revivals rebuild regional identity through festivals, dance, and conscious language/music activism.",
        "04-pan-celtic-festivals": "Lorient, Celtic Connections, and cross-touring ensembles link national scenes without merging them into one style.",
        "05-listening-across-borders": "A guided comparative playlist approach: same tune family heard in Ireland, Scotland, Brittany, and diaspora settings.",
    }
    for file_slug, short_title, tier, extra_tags in DIASPORA_LESSONS:
        lesson_id = f"regions-celtic-diaspora-{file_slug}"
        title = short_title
        prerequisites = [prev]
        body = diaspora_bodies[file_slug]
        output = f"10-regions/celtic/diaspora/{file_slug}.md"
        slot = {
            "id": lesson_id,
            "unit": "celtic-diaspora",
            "track": "regions",
            "tier": tier,
            "region": "celtic-diaspora",
            "title": title,
            "difficulty": min(10, int(tier) + 2),
            "prerequisites": prerequisites,
            "tags": ["celtic", "diaspora"] + extra_tags,
            "output": output,
            "status": "manual",
        }
        new_slots.append(slot)
        (diaspora_dir / f"{file_slug}.md").write_text(
            diaspora_markdown(lesson_id, title, file_slug, tier, slot["tags"], prerequisites, body),
            encoding="utf-8",
        )
        diaspora_meta[lesson_id] = meta_skeleton(lesson_id, title, [
            "Diaspora scenes remix Irish/Scottish roots.",
            "Compare accents—not only tune names.",
            "Festivals link fringe regions to wider Celtic network.",
            "Use Ireland unit as reference tradition.",
            "Playlist study beats generic compilations.",
        ])
        prev = lesson_id
    (diaspora_dir / "lesson-meta.json").write_text(json.dumps(diaspora_meta, indent=2) + "\n", encoding="utf-8")

    comp_dir = CELTIC_ROOT / "comparative"
    comp_dir.mkdir(parents=True, exist_ok=True)
    comp_meta: dict[str, dict] = {}
    prev = "regions-celtic-diaspora-05-listening-across-borders"
    comp_bodies = {
        "01-what-celtic-means": "Marketing \"Celtic\" often flattens Ireland, Scotland, Wales, Brittany, and diaspora scenes into one sound. Traditions are related—not identical.",
        "02-shared-instruments": "Harp, bagpipes, and fiddle appear across nations with different construction, repertoire, and social roles.",
        "03-tune-forms-compared": "Jigs, reels, strathspeys, gavottes, and plygi share family resemblance; metre and dance context differ.",
        "04-revivals-compared": "Collectors, broadcasters, competitions, and archives shaped each nation's twentieth-century revival differently.",
    }
    for file_slug, short_title, tier, extra_tags in COMPARATIVE_LESSONS:
        lesson_id = f"regions-celtic-comparative-{file_slug}"
        title = short_title
        prerequisites = [prev] if file_slug != "01-what-celtic-means" else ["regions-celtic-ireland-01-overview"]
        body = comp_bodies[file_slug]
        output = f"10-regions/celtic/comparative/{file_slug}.md"
        slot = {
            "id": lesson_id,
            "unit": "celtic-comparative",
            "track": "regions",
            "tier": tier,
            "region": "celtic-comparative",
            "title": title,
            "difficulty": min(10, int(tier) + 2),
            "prerequisites": prerequisites,
            "tags": ["celtic", "comparative"] + extra_tags,
            "output": output,
            "status": "manual",
        }
        new_slots.append(slot)
        (comp_dir / f"{file_slug}.md").write_text(
            comparative_markdown(lesson_id, title, file_slug, tier, slot["tags"], prerequisites, body),
            encoding="utf-8",
        )
        comp_meta[lesson_id] = meta_skeleton(lesson_id, title, [
            "Ireland is the anchor; comparison adds precision.",
            "Shared instruments differ by social role.",
            "Tune forms require dance-context listening.",
            "Revival paths diverge by institution.",
            "Avoid Celtic marketing cliché.",
        ])
        prev = lesson_id
    (comp_dir / "lesson-meta.json").write_text(json.dumps(comp_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    existing_ids = {slot["id"] for slot in curriculum.get("slots", [])}
    for slot in new_slots:
        if slot["id"] not in existing_ids:
            curriculum.setdefault("slots", []).append(slot)
    CURRICULUM_PATH.write_text(json.dumps(curriculum, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Scaffolded {len(new_slots)} Celtic lessons")


if __name__ == "__main__":
    main()
