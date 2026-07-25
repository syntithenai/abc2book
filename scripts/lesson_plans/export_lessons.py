#!/usr/bin/env python3
"""Export lesson markdown to app-ready JSON in public/lessons/."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from lesson_quiz_parse import (
    extract_quiz_markdown,
    parse_lesson_quiz_markdown_with_fallback,
    quality_pass_questions,
    strip_quiz_from_body,
)

ROOT = Path(__file__).resolve().parents[2]
LESSON_ROOT = ROOT / "lesson plans"
OUT_ROOT = ROOT / "public" / "lessons"
CURRICULUM_PATH = LESSON_ROOT / "curriculum.json"
IRELAND_META_PATH = LESSON_ROOT / "10-regions" / "celtic" / "ireland" / "lesson-meta.json"
SKIP_DIRS = {".reports", "wiki_index", "site"}
SKIP_FILES = {"README.md"}

ENTITY_MARKER_RE = re.compile(r"\[\[entity:([a-z0-9_-]+)\]\]", re.IGNORECASE)
INLINE_MARKER_RE = re.compile(
    r"\[\[(entity|track):([a-z0-9_-]+)(?:\|([^\]]+))?\]\]",
    re.IGNORECASE,
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
YOUTUBE_ID_RE = re.compile(r"(?:youtu\.be/|v=|/embed/)([A-Za-z0-9_-]{11})")


def ensure_yaml() -> None:
    try:
        import yaml  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml", "-q"])


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    import yaml

    if not raw.startswith("---\n"):
        return {}, raw
    end = raw.find("\n---\n", 4)
    if end == -1:
        return {}, raw
    block = raw[4:end]
    meta = yaml.safe_load(block) or {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, raw[end + 5 :]


def slugify_heading(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "section"


def parse_sections(body: str) -> list[dict]:
    sections: list[dict] = []
    matches = list(HEADING_RE.finditer(body))
    if not matches:
        return [{"id": "content", "title": "Content", "level": 1, "body": body.strip()}]
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        title = match.group(2).strip()
        sections.append({
            "id": slugify_heading(title),
            "title": title,
            "level": len(match.group(1)),
            "body": body[start:end].strip(),
        })
    return sections


def extract_key_points(meta: dict, body: str) -> list[str]:
    points: list[str] = []
    if isinstance(meta.get("key_points"), list):
        points.extend(str(p).strip() for p in meta["key_points"] if str(p).strip())
    m = re.search(r"^##\s+Key points\s*$", body, re.MULTILINE | re.IGNORECASE)
    if m:
        rest = body[m.end() :]
        next_h = re.search(r"^##\s+", rest, re.MULTILINE)
        block = rest[: next_h.start()] if next_h else rest
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("- "):
                points.append(line[2:].strip())
            elif line.startswith("* "):
                points.append(line[2:].strip())
    seen: set[str] = set()
    out: list[str] = []
    for p in points:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def extract_reading_list(meta: dict, body: str) -> list[dict]:
    items: list[dict] = []
    if isinstance(meta.get("reading_list"), list):
        for entry in meta["reading_list"]:
            if isinstance(entry, dict):
                items.append(dict(entry))
    m = re.search(r"^##\s+Reading list\s*$", body, re.MULTILINE | re.IGNORECASE)
    if m:
        rest = body[m.end() :]
        next_h = re.search(r"^##\s+", rest, re.MULTILINE)
        block = rest[: next_h.start()] if next_h else rest
        for line in block.splitlines():
            line = line.strip()
            if not line.startswith("- "):
                continue
            text = line[2:].strip()
            link = re.search(r"\[([^\]]+)\]\(([^)]+)\)", text)
            if link:
                items.append({"type": "link", "title": link.group(1), "url": link.group(2)})
            elif "*" in text:
                parts = text.split("*")
                items.append({
                    "type": "book",
                    "author": parts[0].strip().rstrip(","),
                    "title": parts[1].strip() if len(parts) > 1 else text,
                })
    return items


def parse_body_blocks(body: str) -> list[dict]:
    """Split section body into blocks. Track markers stay inline in markdown."""
    if not body.strip():
        return []
    blocks: list[dict] = []
    last = 0
    for match in INLINE_MARKER_RE.finditer(body):
        kind = match.group(1).lower()
        if kind == "track":
            continue
        if match.start() > last:
            text = body[last:match.start()]
            if text:
                blocks.append({"type": "markdown", "text": text})
        marker_id = match.group(2)
        if kind == "entity":
            blocks.append({"type": "entity", "id": marker_id})
        last = match.end()
    if last < len(body):
        blocks.append({"type": "markdown", "text": body[last:]})
    if not blocks:
        blocks.append({"type": "markdown", "text": body})
    return blocks


def _normalize_apostrophe(text: str) -> str:
    return (
        text.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("`", "'")
    )


def auto_link_entities(body: str, entities: list[dict]) -> str:
    if not body or not entities:
        return body
    linked = body
    for ent in sorted(entities, key=lambda e: len(str(e.get("name", ""))), reverse=True):
        eid = ent.get("id")
        name = ent.get("name")
        if not eid or not name:
            continue
        marker = f"[[entity:{eid}]]"
        if marker in linked:
            continue
        name_norm = _normalize_apostrophe(name)
        for candidate in {name, name_norm}:
            linked = re.sub(
                rf"\*\*{re.escape(candidate)}\*\*",
                marker,
                linked,
            )
    return linked


def _track_label_variants(label: str) -> list[str]:
    label = label.strip()
    variants = [label]
    lower = label.lower()
    if lower.startswith("the "):
        variants.append(label[4:].strip())
    else:
        variants.append("The " + label)
    return list(dict.fromkeys(variants))


def _normalize_track_label(label: str) -> str:
    return re.sub(r"\s+", " ", label.strip().lower())


def _entity_name_variants(name: str) -> list[str]:
    name = name.strip()
    if not name:
        return []
    variants = [name]
    if name.lower().startswith("the "):
        variants.append(name[4:].strip())
    else:
        variants.append("The " + name)
    return list(dict.fromkeys(variants))


def _entity_id_from_heading(title: str, entity_by_id: dict[str, dict], playlist: list[dict]) -> str | None:
    clean = re.sub(r"^\d+\.\s*", "", title.strip())
    if not clean:
        return None
    clean_lower = clean.lower()
    for eid, ent in entity_by_id.items():
        for variant in _entity_name_variants(str(ent.get("name") or "")):
            variant_lower = variant.lower()
            if variant_lower == clean_lower or variant_lower in clean_lower or clean_lower in variant_lower:
                return eid
    seen: set[str] = set()
    for track in playlist:
        eid = track.get("entity_id") or track.get("entityId")
        if not eid or eid in seen:
            continue
        seen.add(eid)
        ent = entity_by_id.get(eid) or {}
        fallback = str(ent.get("name") or eid.replace("-", " ").title())
        for variant in _entity_name_variants(fallback):
            variant_lower = variant.lower()
            if variant_lower == clean_lower or variant_lower in clean_lower or clean_lower in variant_lower:
                return eid
    return None


def _tune_title_pattern(variant: str) -> str:
    escaped = re.escape(variant)
    return (
        rf"(?:\*\*\"{escaped}\"\*\*|\*\*{escaped}\*\*|\*{escaped}\*|\"{escaped}\"|'{escaped}')"
    )


def _track_marker(track: dict, display: str) -> str:
    tid = track.get("id")
    if not tid:
        return display
    return f"[[track:{tid}|{display}]]"


TRACK_MARKER_ANY_RE = re.compile(
    r"\[\[track:([a-z0-9_-]+)(?:\|([^\]]+))?\]\]",
    re.IGNORECASE,
)


def _replace_tune_title(linked: str, variant: str, marker: str) -> str:
    pat = _tune_title_pattern(variant)
    return re.sub(pat, marker, linked, flags=re.IGNORECASE)


def _replace_existing_track_marker(linked: str, variant: str, marker: str) -> str:
    def repl(match: re.Match) -> str:
        display = match.group(2) or ""
        if display.lower() == variant.lower():
            return marker
        return match.group(0)

    return TRACK_MARKER_ANY_RE.sub(repl, linked)


def _link_entity_tune_context(linked: str, entity_name: str, track: dict, variants: list[str]) -> str:
    marker_by_variant = {variant: _track_marker(track, variant) for variant in variants}
    for variant in variants:
        tune_pat = _tune_title_pattern(variant)
        marker = marker_by_variant[variant]
        for ent_variant in _entity_name_variants(entity_name):
            escaped_ent = re.escape(ent_variant)
            patterns = [
                rf"(\*\*{escaped_ent}\*\*[^*\n]{{0,500}}){tune_pat}",
                rf"({escaped_ent},\s*){tune_pat}",
                rf"({escaped_ent}\s+and\s+){tune_pat}",
            ]
            for pattern in patterns:
                linked = re.sub(pattern, rf"\1{marker}", linked, flags=re.IGNORECASE)
            linked = _replace_existing_track_marker(linked, variant, marker)
    return linked


def _link_section_entity_tracks(
    linked: str,
    section_entity_id: str | None,
    playlist: list[dict],
    ambiguous_labels: set[str],
) -> str:
    if not section_entity_id:
        return linked
    for track in playlist:
        eid = track.get("entity_id") or track.get("entityId")
        if eid != section_entity_id:
            continue
        label = track.get("label") or ""
        if not label:
            continue
        for variant in _track_label_variants(label):
            norm = _normalize_track_label(variant)
            if norm not in ambiguous_labels:
                continue
            marker = _track_marker(track, variant)
            linked = _replace_tune_title(linked, variant, marker)
            linked = _replace_existing_track_marker(linked, variant, marker)
    return linked


def strip_entity_markers(body: str, entities: list[dict]) -> str:
    """Replace manual entity markers with plain names (no interactive links)."""
    entity_by_id = {e["id"]: e for e in entities if e.get("id")}

    def repl(match: re.Match) -> str:
        eid = match.group(1)
        ent = entity_by_id.get(eid)
        return str(ent.get("name", eid)) if ent else eid

    return re.sub(r"\[\[entity:([^\]]+)\]\]", repl, body)


def _apply_track_marker_patterns(linked: str, variant: str, marker: str, tid: str) -> str:
    if marker in linked:
        return linked
    return _replace_tune_title(linked, variant, marker)


def auto_link_tracks(body: str, playlist: list[dict], entities: list[dict] | None = None) -> str:
    if not body or not playlist:
        return body
    entity_by_id = {e["id"]: e for e in (entities or []) if e.get("id")}

    label_track_map: dict[str, list[dict]] = {}
    for track in playlist:
        label = track.get("label") or ""
        if not label:
            continue
        for variant in _track_label_variants(label):
            label_track_map.setdefault(_normalize_track_label(variant), []).append(track)

    ambiguous_labels = {
        norm for norm, tracks in label_track_map.items()
        if len({t.get("id") for t in tracks}) > 1
    }

    def link_chunk(chunk: str, section_entity_id: str | None) -> str:
        linked = chunk
        for track in playlist:
            eid = track.get("entity_id") or track.get("entityId")
            entity = entity_by_id.get(eid or "")
            label = track.get("label") or ""
            if not entity or not label:
                continue
            name = entity.get("name") or ""
            if not name:
                continue
            linked = _link_entity_tune_context(
                linked,
                name,
                track,
                _track_label_variants(label),
            )

        linked = _link_section_entity_tracks(linked, section_entity_id, playlist, ambiguous_labels)

        for track in sorted(playlist, key=lambda t: len(str(t.get("label", ""))), reverse=True):
            tid = track.get("id")
            label = track.get("label") or ""
            if not tid or not label:
                continue
            for variant in _track_label_variants(label):
                norm = _normalize_track_label(variant)
                if norm in ambiguous_labels:
                    continue
                marker = _track_marker(track, variant)
                linked = _apply_track_marker_patterns(linked, variant, marker, tid)
        return linked

    parts = re.split(r"(^## .+$)", body, flags=re.MULTILINE)
    if len(parts) == 1:
        return link_chunk(body, None)

    out: list[str] = []
    section_entity_id: str | None = None
    for part in parts:
        if part.startswith("## "):
            section_entity_id = _entity_id_from_heading(part[3:], entity_by_id, playlist)
            out.append(part)
            continue
        out.append(link_chunk(part, section_entity_id))
    return "".join(out)


def prepare_lesson_body(body: str, entities: list[dict], playlist: list[dict]) -> str:
    body = strip_entity_markers(body, entities)
    body = auto_link_tracks(body, playlist, entities)
    return body


def entity_order_from_body(body: str) -> list[str]:
    seen: set[str] = set()
    order: list[str] = []
    for match in INLINE_MARKER_RE.finditer(body):
        if match.group(1).lower() != "entity":
            continue
        eid = match.group(2)
        if eid not in seen:
            seen.add(eid)
            order.append(eid)
    return order


def entity_summary(entity: dict) -> str:
    if entity.get("summary"):
        return str(entity["summary"])[:120]
    blurb = str(entity.get("blurb") or "")
    if not blurb:
        return ""
    sentence = re.split(r"[.!?]\s+", blurb)[0]
    if len(sentence) > 120:
        return sentence[:117] + "..."
    return sentence


def normalize_entities(raw_entities: list | None) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw_entities, list):
        return out
    for ent in raw_entities:
        if not isinstance(ent, dict) or not ent.get("id"):
            continue
        item = dict(ent)
        if item.get("summary") is None and item.get("blurb"):
            item["summary"] = entity_summary(item)
        out.append(item)
    return out


def normalize_playlist(raw_playlist: list | None, entities: list[dict]) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw_playlist, list):
        return raw_playlist or []
    entity_by_id = {e["id"]: e for e in entities}
    for i, track in enumerate(raw_playlist):
        if not isinstance(track, dict):
            continue
        item = dict(track)
        eid = item.get("entity_id") or item.get("entityId")
        if eid and eid in entity_by_id and entity_by_id[eid].get("playlist_index") is None:
            entity_by_id[eid]["playlist_index"] = i
        label = item.get("label") or item.get("title") or ""
        subtitle = ""
        if eid and eid in entity_by_id:
            subtitle = entity_by_id[eid].get("name") or ""
        item.setdefault("subtitle", subtitle)
        item.setdefault("label", label or subtitle or f"Track {i + 1}")
        out.append(item)
    return out


def merge_ireland_meta(lesson_id: str, meta: dict) -> dict:
    if not IRELAND_META_PATH.exists():
        return meta
    overlay = json.loads(IRELAND_META_PATH.read_text(encoding="utf-8"))
    extra = overlay.get(lesson_id)
    if not isinstance(extra, dict):
        return meta
    merged = dict(meta)
    for key in ("entities", "playlist", "tunes", "key_points", "reading_list", "quiz_questions"):
        if key in extra:
            merged[key] = extra[key]
    return merged


def build_lesson_payload(path: Path, slot: dict | None) -> dict:
    raw = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(raw)
    lesson_id = meta.get("id") or (slot.get("id") if slot else path.stem)
    meta = merge_ireland_meta(str(lesson_id), meta)

    entities = normalize_entities(meta.get("entities"))
    playlist = normalize_playlist(meta.get("playlist"), entities)
    body = prepare_lesson_body(body, entities, playlist)
    entity_order = entity_order_from_body(body)
    for ent in entities:
        if ent["id"] not in entity_order and ent.get("type") in ("artist", "band", "organization"):
            entity_order.append(ent["id"])

    sections = parse_sections(strip_quiz_from_body(body))
    for section in sections:
        section["blocks"] = parse_body_blocks(section["body"])
        del section["body"]

    key_points = extract_key_points(meta, body)
    reading_list = extract_reading_list(meta, body)

    quiz_body = extract_quiz_markdown(body)
    quiz_questions = meta.get("quiz_questions")
    parsed_raw = parse_lesson_quiz_markdown_with_fallback(quiz_body)
    quiz_questions = quality_pass_questions(parsed_raw, str(lesson_id))
    quiz_payload = None
    if quiz_questions:
        quiz_payload = {
            "id": str(lesson_id) + "-quiz",
            "title": (meta.get("title") or (slot.get("title") if slot else path.stem.replace("-", " ").title())) + " quiz",
            "questions": quiz_questions,
        }

    title = meta.get("title") or (slot.get("title") if slot else path.stem.replace("-", " ").title())
    return {
        "id": lesson_id,
        "title": title,
        "track": meta.get("track") or (slot.get("track") if slot else ""),
        "tier": meta.get("tier") or (slot.get("tier") if slot else ""),
        "region": meta.get("region") or (slot.get("region") if slot else ""),
        "difficulty": meta.get("difficulty") or (slot.get("difficulty") if slot else ""),
        "prerequisites": meta.get("prerequisites") or (slot.get("prerequisites") if slot else []),
        "tags": meta.get("tags") or (slot.get("tags") if slot else []),
        "path": path.relative_to(LESSON_ROOT).as_posix(),
        "sections": sections,
        "entities": entities,
        "entity_order": entity_order,
        "playlist": playlist,
        "tunes": meta.get("tunes") or [],
        "key_points": key_points,
        "reading_list": reading_list,
        "quiz_markdown": quiz_body,
        "quiz_questions": quiz_questions or [],
        "quiz": quiz_payload,
    }


def build_search_record(lesson: dict) -> dict:
  """Compact search row — metadata only, no lesson body prose."""
  title = str(lesson.get("title") or "")
  section_titles = [
      str(s.get("title") or "").strip()
      for s in lesson.get("sections", [])
      if s.get("title")
  ]
  entity_names = [
      str(e.get("name") or "").strip()
      for e in lesson.get("entities", [])
      if e.get("name")
  ]
  key_points = [
      str(kp).strip() for kp in lesson.get("key_points", []) if str(kp).strip()
  ][:8]
  playlist_labels = [
      str(t.get("label") or "").strip()
      for t in lesson.get("playlist", [])
      if t.get("label")
  ][:12]
  tags = lesson.get("tags") or []
  snippet_bits = entity_names[:3] + key_points[:1]
  snippet = ", ".join(bit for bit in snippet_bits if bit)[:280] or title
  return {
      "id": lesson["id"],
      "title": title,
      "snippet": snippet,
      "section_titles": section_titles,
      "entity_names": entity_names,
      "key_points": key_points,
      "playlist_labels": playlist_labels,
      "tags": tags,
  }


def humanize_section(name: str) -> str:
    if re.match(r"^\d{2}-", name):
        name = name[3:]
    return name.replace("-", " ").title()


def build_manifest(slots: list[dict], lessons_by_id: dict[str, dict]) -> dict:
    tracks: dict[str, dict] = {}
    units: dict[str, dict] = {}
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    track_defs = curriculum.get("tracks", {})
    unit_defs = curriculum.get("units", {})

    for slot in slots:
        track_id = slot.get("track", "other")
        unit_id = slot.get("unit", "")
        if track_id not in tracks:
            tdef = track_defs.get(track_id, {})
            tracks[track_id] = {
                "id": track_id,
                "label": tdef.get("label", humanize_section(track_id)),
                "units": {},
            }
        if unit_id and unit_id not in tracks[track_id]["units"]:
            udef = unit_defs.get(unit_id, {})
            tracks[track_id]["units"][unit_id] = {
                "id": unit_id,
                "label": udef.get("label", humanize_section(unit_id)),
                "region": udef.get("region", slot.get("region", "")),
                "lessons": [],
            }
        lesson = lessons_by_id.get(slot["id"])
        if not lesson:
            continue
        lesson_entry = {
            "id": lesson["id"],
            "title": lesson["title"],
            "tier": lesson.get("tier"),
            "prerequisites": lesson.get("prerequisites", []),
            "path": f"{lesson['id']}.json",
        }
        if unit_id:
            tracks[track_id]["units"][unit_id]["lessons"].append(lesson_entry)
        else:
            tracks[track_id].setdefault("lessons", []).append(lesson_entry)

    track_list = []
    for track_id, track in tracks.items():
        units_list = list(track.get("units", {}).values())
        for unit in units_list:
            unit["lessons"].sort(key=lambda l: l["id"])
        track_list.append({
            "id": track_id,
            "label": track["label"],
            "units": units_list,
            "lessons": track.get("lessons", []),
        })
    track_list.sort(key=lambda t: t["id"])
    return {"version": 1, "tracks": track_list}


def build_quizzes_index(manifest: dict, lessons_by_id: dict[str, dict]) -> dict:
    entries: list[dict] = []
    for track in manifest.get("tracks", []):
        for unit in track.get("units", []):
            for lesson_ref in unit.get("lessons", []):
                lesson = lessons_by_id.get(lesson_ref.get("id", ""))
                if not lesson:
                    continue
                questions = []
                if isinstance(lesson.get("quiz"), dict):
                    questions = lesson["quiz"].get("questions") or []
                elif isinstance(lesson.get("quiz_questions"), list):
                    questions = lesson["quiz_questions"]
                if not questions:
                    continue
                entries.append({
                    "id": lesson["id"],
                    "title": lesson.get("title", ""),
                    "trackId": track.get("id", ""),
                    "trackLabel": track.get("label", ""),
                    "unitId": unit.get("id", ""),
                    "unitLabel": unit.get("label", ""),
                    "questionCount": len(questions),
                    "tags": lesson.get("tags", []),
                    "path": lesson_ref.get("path", lesson["id"] + ".json"),
                })
    return {"version": 1, "quizzes": entries}


def collect_lesson_paths() -> list[Path]:
    paths: list[Path] = []
    for path in sorted(LESSON_ROOT.rglob("*.md")):
        rel = path.relative_to(LESSON_ROOT)
        if rel.parts and rel.parts[0] in SKIP_DIRS:
            continue
        if rel.name in SKIP_FILES:
            continue
        paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Export lessons to public/lessons JSON")
    parser.add_argument("--ireland-only", action="store_true", help="Export only Ireland unit")
    args = parser.parse_args()
    ensure_yaml()

    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    slots = curriculum.get("slots", [])
    slot_by_output: dict[str, dict] = {}
    slot_by_id: dict[str, dict] = {}
    for slot in slots:
        slot_by_id[slot["id"]] = slot
        if slot.get("output"):
            slot_by_output[slot["output"]] = slot

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "ireland").mkdir(parents=True, exist_ok=True)

    lessons_by_id: dict[str, dict] = {}
    search_index: list[dict] = []

    for path in collect_lesson_paths():
        rel = path.relative_to(LESSON_ROOT).as_posix()
        slot = slot_by_output.get(rel)
        if args.ireland_only and not (slot and slot.get("unit") == "celtic-ireland"):
            if "celtic/ireland" not in rel:
                continue
        lesson = build_lesson_payload(path, slot)
        lessons_by_id[lesson["id"]] = lesson
        out_name = lesson["id"] + ".json"
        if lesson.get("region") == "ireland" or (slot and slot.get("unit") == "celtic-ireland"):
            (OUT_ROOT / "ireland" / out_name).write_text(
                json.dumps(lesson, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        else:
            (OUT_ROOT / out_name).write_text(
                json.dumps(lesson, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        search_index.append(build_search_record(lesson))

    manifest_slots = [s for s in slots if not args.ireland_only or s.get("unit") == "celtic-ireland"]
    manifest = build_manifest(manifest_slots if args.ireland_only else slots, lessons_by_id)
    (OUT_ROOT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_ROOT / "search-index.json").write_text(
        json.dumps(search_index, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    quizzes_index = build_quizzes_index(manifest, lessons_by_id)
    (OUT_ROOT / "quizzes-index.json").write_text(
        json.dumps(quizzes_index, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(lessons_by_id)} lessons to {OUT_ROOT}")


if __name__ == "__main__":
    main()
