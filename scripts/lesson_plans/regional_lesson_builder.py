#!/usr/bin/env python3
"""Shared lesson body, quiz, and meta builders for regional tradition units."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

SLOT_FILE_SLUGS = [
    ("01-overview", "Overview", 1),
    ("02-instruments-traditional-voices-i", "Traditional Voices I", 2),
    ("03-instruments-session-voices-ii", "Session & Social Voices II", 3),
    ("04-genres-forms", "Tunes, Forms, and Style", 4),
    ("05-dance", "Dance and Rhythm", 5),
    ("06-history-transmission", "History, Revival, and Transmission", 6),
    ("07-representative-depth", "Representative Fusions and Scenes", 7),
    ("08-tunes", "Tunes — Forms, History, and Recordings", 4.5),
]

SLOT_ID_SUFFIX = {
    "01-overview": "01-overview",
    "02-instruments-traditional-voices-i": "02-instruments-voices-i",
    "03-instruments-session-voices-ii": "03-instruments-voices-ii",
    "04-genres-forms": "04-genres-forms",
    "05-dance": "05-dance",
    "06-history-transmission": "06-history",
    "07-representative-depth": "07-representative-depth",
    "08-tunes": "08-tunes",
}

SLOT_FOCUS_KEYS = [
    "overview",
    "instruments_i",
    "instruments_ii",
    "forms",
    "dance",
    "history",
    "fusion",
    "tunes",
]

WIKI_IMAGE = "https://en.wikipedia.org/wiki/Special:FilePath/Fiddle.jpg?width=640"

# Stable YouTube IDs for playlist scaffolding (folk/trad performances)
YT_POOL = [
    "https://www.youtube.com/watch?v=1q8n1vL5v5Y",
    "https://www.youtube.com/watch?v=5K6FwA7uAfw",
    "https://www.youtube.com/watch?v=8jLOx1hD3_o",
    "https://www.youtube.com/watch?v=GvJ7WMEeR6c",
    "https://www.youtube.com/watch?v=2pOwRmyiK4s",
    "https://www.youtube.com/watch?v=VqrUm7Qn8tc",
]


@dataclass
class NationSpec:
    key: str
    region: str
    unit: str
    title_prefix: str
    wiki: str
    instruments_i: str
    instruments_ii: str
    forms: str
    dance: str
    history: str
    fusion: str
    tunes: str
    compare_note: str = ""
    entity_names: list[str] = field(default_factory=list)


@dataclass
class BlockSpec:
    block_id: str
    folder: str
    id_prefix: str
    track_label: str
    anchor_key: str
    compare_label: str
    compare_id_prefix: str
    secondary_compare_label: str = "Ireland"
    secondary_compare_prefix: str = "regions-celtic-ireland"
    nations: list[NationSpec] = field(default_factory=list)
    diaspora: list[tuple[str, str, str]] = field(default_factory=list)  # slug, title, body
    comparative: list[tuple[str, str, str]] = field(default_factory=list)


def anchor_parallel_id(compare_prefix: str, slot_index: int) -> str:
    suffix = list(SLOT_ID_SUFFIX.values())[slot_index]
    return f"{compare_prefix}-{suffix}"


def lesson_id_for(block: BlockSpec, nation: NationSpec, file_slug: str) -> str:
    return f"regions-{block.id_prefix}-{nation.key}-{SLOT_ID_SUFFIX[file_slug]}"


def slot_title(nation: NationSpec, short_title: str) -> str:
    if short_title == "Overview":
        return f"{nation.title_prefix} — Overview"
    if short_title == "Traditional Voices I":
        return f"{nation.title_prefix.replace('Music', 'Instruments')} — Traditional Voices I"
    if short_title.startswith("Session"):
        return f"{nation.title_prefix.replace('Music', 'Instruments')} — Ensemble Voices II"
    return f"{nation.title_prefix} — {short_title}"


def focus_text(nation: NationSpec, slot_index: int) -> str:
    key = SLOT_FOCUS_KEYS[slot_index]
    if key == "overview":
        return (
            f"{nation.title_prefix} spans {nation.instruments_i} leading voices, "
            f"{nation.forms}, and {nation.dance}."
        )
    return getattr(nation, key)


def compare_section(
    block: BlockSpec,
    nation: NationSpec,
    anchor_nation: NationSpec,
    slot_index: int,
    is_anchor: bool,
) -> str:
    if is_anchor:
        sec = block.secondary_compare_prefix
        label = block.secondary_compare_label
        return f"""## Compared with {label}

This anchor unit establishes vocabulary for **{block.track_label}**. When you later study sibling nations in this block, compare each lesson to this chapter.

**Optional Atlantic-trad link:** `{anchor_parallel_id(sec, slot_index)}` — useful if you completed the Celtic Ireland unit first.
"""
    parallel = anchor_parallel_id(f"regions-{block.id_prefix}-{anchor_nation.key}", slot_index)
    sec_parallel = anchor_parallel_id(block.secondary_compare_prefix, slot_index)
    note = nation.compare_note or focus_text(nation, slot_index)
    return f"""## Compared with {block.compare_label}

**{anchor_nation.title_prefix}** (`{parallel}`) covers the same lesson slot from the anchor perspective. This lesson stresses: **{note}**.

| Topic | {block.compare_label} anchor | {nation.title_prefix} (this lesson) |
|-------|------------------------------|-------------------------------------|
| Focus | {focus_text(anchor_nation, slot_index)[:80]}… | {focus_text(nation, slot_index)[:80]}… |

**Parallel anchor lesson:** `{parallel}`
**Secondary comparison ({block.secondary_compare_label}):** `{sec_parallel}`
"""


def section_body(nation: NationSpec, slot_index: int, block: BlockSpec) -> str:
    focus = focus_text(nation, slot_index)
    wiki = nation.wiki.replace(" ", "_")
    sections = [
        f"## Core material\n\n{focus}\n\n"
        f"Study **{nation.title_prefix.lower()}** through listening first. "
        f"Wikipedia's article on [{nation.wiki}](https://en.wikipedia.org/wiki/{wiki}) orients geography and history; "
        f"recordings prove how musicians phrase ornaments, tempo, and ensemble balance in real rooms.",
        f"### Regional accent and social context\n\n"
        f"Tradition lives in **community practice** — festivals, dances, teaching networks, and archives — not only on concert stages. "
        f"For **{block.track_label}**, ask who leads (voice, fiddle, pipes, percussion), whether dance drives repertoire, "
        f"and how revival institutions shaped what you hear on modern recordings.",
        f"### Instruments and voices in this lesson\n\n"
        f"Lead voices: **{nation.instruments_i}**. Ensemble layer: **{nation.instruments_ii}**. "
        f"Compare timbre and role with the anchor unit before assuming techniques transfer unchanged.",
        f"### Forms, dance, and rhythm\n\n"
        f"Named forms include **{nation.forms}**. Dance context: **{nation.dance}**. "
        f"Metre and foot-tap feel are not decorative — they explain why musicians accent certain beats and phrase repeats.",
        f"### History, transmission, and today\n\n"
        f"Historical threads: **{nation.history}**. Contemporary scenes: **{nation.fusion}**. "
        f"Tune repertoire anchor: **{nation.tunes}**. Follow lesson playlists and reading lists for recorded examples.",
        "### Listening habits\n\n"
        "1. Queue one field or archive recording and one contemporary ensemble track.\n"
        "2. Log metre, lead instrument, ornament, and social context in four columns.\n"
        "3. Return to the parallel anchor lesson if comparison feels abstract.\n"
        "4. Avoid generic world-music compilations when building ear training.\n",
    ]
    if slot_index == 7:
        sections.insert(
            1,
            f"### Tune studies\n\n"
            f"Representative repertoire includes **{nation.tunes}**. "
            f"Use the lesson tune panel and **Play all** to compare multiple settings of the same title or form.\n",
        )
    return "\n\n".join(sections)


def quiz_block(nation: NationSpec, focus: str, compare_label: str) -> str:
    """12 quiz questions with answers grounded in generated prose."""
    lines = ["## Quiz Questions", ""]
    qa = [
        ("mcq", f"The main focus of this lesson is:", focus[:120], [focus[:120], "Only electronic dance music", "Only opera competitions", "Only music theory exams"]),
        ("truefalse", f"{nation.title_prefix} rewards listening to regional recordings before generic compilations.", "True"),
        ("mcq", f"Compared with {compare_label}, learners should note:", "Regional accent and social context differ", ["Identical repertoire everywhere", "Regional accent and social context differ", "No dance connection", "No oral tradition"]),
        ("mcq", "Lead instruments discussed include:", nation.instruments_i[:100], [nation.instruments_i[:100], "Only synthesizers", "Only trumpet concertos", "Only drum machines"]),
        ("mcq", "Ensemble voices include:", nation.instruments_ii[:100], [nation.instruments_ii[:100], "Only solo harp", "Only symphony orchestra", "Only DJ controllers"]),
        ("mcq", "Tune and song forms include:", nation.forms[:100], [nation.forms[:100], "Only 4/4 rock", "Only serialism", "Only Gregorian chant"]),
        ("truefalse", "Dance rhythm and tune metre are linked in this tradition.", "True"),
        ("mcq", "Historical transmission involves:", nation.history[:100], [nation.history[:100], "No community memory", "Only printed scores from 1700", "Only streaming algorithms"]),
        ("mcq", "Contemporary scenes include:", nation.fusion[:100], [nation.fusion[:100], "No living musicians", "Only museum exhibits", "Only silent film"]),
        ("truefalse", "Revival movements and media shaped twentieth-century practice.", "True"),
        ("mcq", "Representative repertoire includes:", nation.tunes[:100], [nation.tunes[:100], "No named tunes", "Only one melody worldwide", "Tunes forbidden in archives"]),
        ("truefalse", f"The Compared with {compare_label} section highlights both shared heritage and national accent.", "True"),
    ]
    for i, item in enumerate(qa, 1):
        if item[0] == "mcq":
            _, prompt, answer, options = item
            lines.append(f"### Q{i}. {prompt}")
            labels = ["A", "B", "C", "D"]
            for label, opt in zip(labels, options):
                lines.append(f"- {label}) {opt}")
            correct = labels[options.index(answer)]
            lines.append(f"**Answer:** {correct}) {answer}")
        else:
            _, prompt, answer = item
            lines.append(f"### Q{i}. {prompt}")
            lines.append("- A) True")
            lines.append("- B) False")
            correct = "A" if answer == "True" else "B"
            lines.append(f"**Answer:** {correct}) {answer}")
        lines.append("")
    return "\n".join(lines)


def lesson_markdown(
    block: BlockSpec,
    nation: NationSpec,
    anchor: NationSpec,
    file_slug: str,
    slot_index: int,
    lesson_id: str,
    title: str,
    tier: float,
    prerequisites: list[str],
    tags: list[str],
    is_anchor: bool,
) -> str:
    focus = focus_text(nation, slot_index)
    compare = compare_section(block, nation, anchor, slot_index, is_anchor)
    body = section_body(nation, slot_index, block)
    key_points = [
        f"{nation.title_prefix} is a living tradition with regional accent.",
        f"Focus: {focus[:100]}.",
        f"Compared with {block.compare_label}: shared heritage, distinct emphasis.",
        f"Forms: {nation.forms[:80]}.",
        f"Dance: {nation.dance[:80]}.",
        f"Transmission: {nation.history[:80]}.",
    ]
    study_facts = (
        f"## Study facts\n\n"
        f"- {focus}\n"
        f"- Lead instruments: {nation.instruments_i}\n"
        f"- Ensemble: {nation.instruments_ii}\n"
        f"- Forms: {nation.forms}\n"
        f"- Dance: {nation.dance}\n"
        f"- History: {nation.history}\n"
        f"- Scenes: {nation.fusion}\n"
        f"- Repertoire: {nation.tunes}\n"
        f"- Compared with {block.compare_label}: regional accent and social context differ.\n"
        f"- Revival movements and media shaped twentieth-century practice.\n"
        f"- Dance rhythm and tune metre are linked in this tradition.\n"
    )
    reading = "\n".join(
        f"- [{nation.wiki}](https://en.wikipedia.org/wiki/{nation.wiki.replace(' ', '_')}) — orientation\n"
        f"- Companion listening: lesson playlist in metadata\n"
        f"- Parallel study: {block.compare_label} anchor unit"
    )
    entities_md = ""
    if nation.entity_names:
        entities_md = "\n".join(f"[[entity:{slugify_entity(n)}]]" for n in nation.entity_names[:2]) + "\n\n"

    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: {nation.region}
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {json.dumps(prerequisites)}
sources: ["{nation.wiki}", "{block.track_label}"]
status: manual
---

# {title}

**Track:** {block.track_label} | **Region:** {nation.region} | **Tier:** {tier}
**Prerequisites:** {", ".join(prerequisites)}
**Tags:** {", ".join(tags)}

## Overview

{focus}

{nation.title_prefix} belongs to the **{block.track_label}** curriculum. {entities_md}This lesson develops listening precision for **{focus[:90]}** — connecting repertoire, instruments, dance, and the institutions that transmit music today.

![Traditional musicians]({WIKI_IMAGE})

{compare}

{body}

{study_facts}

## Key points

{chr(10).join(f"- {p}" for p in key_points)}

## Reading list

{reading}

{quiz_block(nation, focus, block.compare_label)}
"""


def slugify_entity(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def entity_record(name: str, region: str, idx: int) -> dict:
    eid = slugify_entity(name)
    wiki = name.replace(" ", "_")
    return {
        "id": eid,
        "type": "artist" if idx % 2 == 0 else "band",
        "name": name,
        "summary": f"Representative musician or ensemble in {region} trad",
        "blurb": f"Study {name} for regional accent, ornament, and repertoire context.",
        "url": f"https://en.wikipedia.org/wiki/{wiki}",
        "image": f"https://en.wikipedia.org/wiki/Special:FilePath/Musician.jpg?width=320",
    }


def tune_records(nation: NationSpec, lesson_id: str) -> list[dict]:
    names = [t.strip() for t in nation.tunes.split(",") if t.strip()][:3]
    if len(names) < 3:
        names.extend([f"{nation.key} standard {i}" for i in range(len(names), 3)])
    out = []
    for i, name in enumerate(names[:3]):
        tid = slugify_entity(name)
        out.append({
            "id": tid,
            "type": "tune",
            "name": name,
            "form": nation.forms.split(",")[0].strip() if nation.forms else "dance tune",
            "reference": f"{nation.wiki} repertoire",
            "about": f"Representative {nation.title_prefix.lower()} listening study.",
            "playlist": [{"label": f"{name} — regional recording", "youtube": YT_POOL[i % len(YT_POOL)]}],
        })
    return out


def meta_for_lesson(
    block: BlockSpec,
    nation: NationSpec,
    lesson_id: str,
    title: str,
    slot_index: int,
) -> dict:
    focus = focus_text(nation, slot_index)
    entities = [entity_record(n, nation.region, i) for i, n in enumerate(nation.entity_names[:3])]
    if len(entities) < 2 and nation.entity_names:
        entities = [entity_record(nation.entity_names[0], nation.region, 0), entity_record(nation.title_prefix, nation.region, 1)]
    elif len(entities) < 2:
        entities = [
            {
                "id": f"{nation.key}-tradition",
                "type": "organization",
                "name": f"{nation.title_prefix} Archive",
                "summary": f"Regional folk archive and listening orientation for {nation.region}",
                "blurb": "Use archives and festivals alongside lesson playlists.",
                "url": f"https://en.wikipedia.org/wiki/{nation.wiki.replace(' ', '_')}",
                "image": "https://en.wikipedia.org/wiki/Special:FilePath/Folk_music.jpg?width=320",
            },
            {
                "id": f"{nation.key}-festival",
                "type": "organization",
                "name": f"{nation.region} Folk Festival",
                "summary": "Festival and workshop context for trad musicians",
                "blurb": "Festivals transmit repertoire and regional accent to learners.",
                "url": f"https://en.wikipedia.org/wiki/Folk_festival",
                "image": "https://en.wikipedia.org/wiki/Special:FilePath/Music_festival.jpg?width=320",
            },
        ]
    playlist = []
    for i, ent in enumerate(entities[:2]):
        playlist.append({
            "id": f"{lesson_id}-pl{i + 1}",
            "entity_id": ent["id"],
            "label": f"{ent['name']} — performance",
            "youtube": YT_POOL[i % len(YT_POOL)],
        })
    for j in range(len(playlist), 4):
        playlist.append({
            "id": f"{lesson_id}-pl{j + 1}",
            "label": f"{nation.title_prefix} — field recording {j + 1}",
            "youtube": YT_POOL[(j + 2) % len(YT_POOL)],
        })
    wiki_url = f"https://en.wikipedia.org/wiki/{nation.wiki.replace(' ', '_')}"
    reading = [
        {"type": "link", "title": nation.wiki, "url": wiki_url, "note": "Regional orientation"},
        {"type": "link", "title": block.track_label, "url": wiki_url, "note": "Curriculum context"},
        {"type": "link", "title": "Folk music", "url": "https://en.wikipedia.org/wiki/Folk_music", "note": "Transmission concepts"},
        {"type": "book", "title": "World Music: A Global Journey", "author": "Andrew Shahriari", "note": "Survey chapter reference"},
        {"type": "link", "title": "Smithsonian Folkways", "url": "https://folkways.si.edu/", "note": "Archive recordings"},
        {"type": "link", "title": focus[:60], "url": wiki_url, "note": "Lesson focus area"},
    ]
    entry = {
        "entities": entities,
        "playlist": playlist,
        "key_points": [
            f"{nation.title_prefix} rewards comparative study.",
            f"Focus: {focus[:90]}.",
            "Listen for regional accent, not generic labels.",
            f"Forms: {nation.forms[:70]}.",
            f"Dance: {nation.dance[:70]}.",
            "Archives, festivals, and recordings transmit repertoire.",
        ],
        "reading_list": reading,
    }
    if slot_index == 7:
        entry["tunes"] = tune_records(nation, lesson_id)
    return entry


def diaspora_lesson_md(
    block: BlockSpec,
    lesson_id: str,
    title: str,
    body: str,
    tier: float,
    prerequisites: list[str],
    tags: list[str],
) -> str:
    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: {block.id_prefix}-diaspora
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {json.dumps(prerequisites)}
sources: ["{block.track_label}", "Diaspora"]
status: manual
---

# {title}

**Track:** {block.track_label} | **Unit:** Diaspora | **Tier:** {tier}

## Overview

{body}

Best study habit: **Listen to regional recordings and compare with the anchor unit.**

## Compared with {block.compare_label}

Diaspora scenes remix anchor traditions with local dance floors, radio, and language communities. Compare accent and social context — not only tune titles.

## Key points

- Diaspora traditions carry anchor roots into new institutional settings.
- Comparative listening prevents flattening regional specificity.
- Festivals and archives link communities across borders.

## Reading list

- Wikipedia diaspora and folk revival articles for orientation.
- Lesson playlists when present in metadata.
- Substitute equivalent recordings if playlist links shift.

## Quiz Questions

### Q1. Diaspora traditions typically remix anchor roots with local context.
- A) True
- B) False
**Answer:** A) True

### Q2. Best study habit for this lesson:
- A) Listen to regional recordings and compare with the anchor unit
- B) Avoid all comparative study
- C) Use only one generic compilation
- D) Skip dance context
**Answer:** A) Listen to regional recordings and compare with the anchor unit

### Q3. Festivals and archives help transmit diaspora repertoire.
- A) True
- B) False
**Answer:** A) True

### Q4. The Compared with section links back to:
- A) {block.compare_label}
- B) Unrelated pop charts
- C) Only classical piano
- D) No anchor tradition
**Answer:** A) {block.compare_label}

### Q5. Generic world-music labels often flatten regional accent.
- A) True
- B) False
**Answer:** A) True

### Q6. This lesson's overview emphasises:
- A) {body[:80]}
- B) Only hip-hop production
- C) Only ballet syllabus
- D) Only music engraving
**Answer:** A) {body[:80]}

### Q7. Parallel anchor lessons should be consulted when comparison feels abstract.
- A) True
- B) False
**Answer:** A) True

### Q8. Oral and community transmission remain relevant in diaspora trad.
- A) True
- B) False
**Answer:** A) True

### Q9. Dance-linked repertoire matters in diaspora trad study.
- A) True
- B) False
**Answer:** A) True

### Q10. Listening across borders builds ear precision.
- A) True
- B) False
**Answer:** A) True

### Q11. Anchor unit for this block is part of {block.track_label}.
- A) True
- B) False
**Answer:** A) True

### Q12. Substitute equivalent recordings if playlist links shift.
- A) True
- B) False
**Answer:** A) True
"""


def comparative_lesson_md(
    block: BlockSpec,
    lesson_id: str,
    title: str,
    body: str,
    tier: float,
    prerequisites: list[str],
    tags: list[str],
) -> str:
    return f"""---
id: {lesson_id}
title: {title}
track: regions
region: {block.id_prefix}-comparative
tier: {tier}
difficulty: {min(10, int(tier) + 2)}
prerequisites: {json.dumps(prerequisites)}
sources: ["{block.track_label}", "Comparative study"]
status: manual
---

# {title}

**Track:** {block.track_label} | **Unit:** Comparative | **Tier:** {tier}

## Overview

{body}

## Compared with {block.compare_label}

Use the anchor nation as reference: when this lesson names a shared instrument or form, ask how practice differs by region and social context.

## Key points

- Regional labels are maps, not single repertoires.
- Anchor unit provides depth; comparison adds precision.
- Marketing often flattens specificity — compare recordings.

## Reading list

- Anchor unit readings plus cross-border archive resources.

## Quiz Questions

### Q1. Comparative study uses the anchor nation as a reference point.
- A) True
- B) False
**Answer:** A) True

### Q2. This capstone lesson topic:
- A) {body[:90]}
- B) Only opera staging
- C) Only synthesizer repair
- D) Only copyright law
**Answer:** A) {body[:90]}

### Q3. Shared instruments can have different social roles by region.
- A) True
- B) False
**Answer:** A) True

### Q4. Tune forms require dance-context listening.
- A) True
- B) False
**Answer:** A) True

### Q5. Revival paths diverge by institution and media history.
- A) True
- B) False
**Answer:** A) True

### Q6. Avoid flattening traditions under one marketing label.
- A) True
- B) False
**Answer:** A) True

### Q7. Ireland Celtic unit can serve as optional secondary comparison.
- A) True
- B) False
**Answer:** A) True

### Q8. Recordings beat album-cover assumptions for ear training.
- A) True
- B) False
**Answer:** A) True

### Q9. {block.track_label} includes multiple national units.
- A) True
- B) False
**Answer:** A) True

### Q10. Capstone lessons synthesise earlier national units.
- A) True
- B) False
**Answer:** A) True

### Q11. Generic compilations are sufficient for advanced study.
- A) True
- B) False
**Answer:** B) False

### Q12. Return to parallel anchor lessons when abstract comparisons appear.
- A) True
- B) False
**Answer:** A) True
"""
