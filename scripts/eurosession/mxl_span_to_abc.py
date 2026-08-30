#!/usr/bin/env python3
"""Slice eurosessions-tunebook.mxl measure spans and convert to ABC via xml2abc."""

from __future__ import annotations

import argparse
import copy
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_abc_candidates import candidate_id  # noqa: E402
from match_mxl_spans import load_score, mxl_key_meter_at  # noqa: E402

MXL_SOURCE = "musicxml:eurosessions-tunebook.mxl"
SCRIPT_DIR = Path(__file__).resolve().parent
XML2ABC_CLI = SCRIPT_DIR / "xml2abc-cli.js"
# xml2abc emits note/rest suffixes like C/0 when <divisions> is missing (divs=0).
ZERO_DURATION_RE = re.compile(r"/0(?!\d)")
# MuseScore score-level default when no real composer was entered.
_GENERIC_COMPOSER_RE = re.compile(
    r"^composer\s*/\s*arranger$",
    re.I,
)


def is_generic_composer(value: str | None) -> bool:
    """True for empty or MuseScore placeholder composer credits."""
    s = re.sub(r"\s+", " ", (value or "").strip())
    return not s or bool(_GENERIC_COMPOSER_RE.match(s))


def strip_generic_composer_headers(abc: str) -> str:
    """Drop C: lines that are MuseScore 'Composer / arranger' placeholders."""
    lines = []
    for line in (abc or "").splitlines():
        if line.startswith("C:") and is_generic_composer(line[2:]):
            continue
        lines.append(line)
    return "\n".join(lines)


def strip_generic_creators_from_score(root: ET.Element) -> None:
    """Remove MuseScore placeholder <creator type="composer"> from identification."""
    ident = root.find("identification")
    if ident is None:
        return
    for creator in list(ident.findall("creator")):
        if (creator.get("type") or "").lower() != "composer":
            continue
        if is_generic_composer(creator.text):
            ident.remove(creator)


def import_key_for_tune(page: int, tune_index: int) -> str:
    return f"p{int(page):02d}_t{int(tune_index):02d}"


def merge_attributes(base: ET.Element | None, incoming: ET.Element) -> ET.Element:
    """Merge MusicXML <attributes> blocks: later children override same tags.

    MusicXML attributes are incremental — a later block may only carry <key>/<time>
    and omit sticky fields like <divisions>. Replacing the whole block drops those
    and causes xml2abc to emit broken /0 durations.
    """
    if base is None:
        return copy.deepcopy(incoming)
    merged = copy.deepcopy(base)
    # Tags present in incoming replace all prior children of that tag.
    incoming_tags = {child.tag for child in incoming}
    for tag in incoming_tags:
        for old in list(merged.findall(tag)):
            merged.remove(old)
    for child in incoming:
        merged.append(copy.deepcopy(child))
    return merged


def attributes_at_or_before(root: ET.Element, measure: int) -> ET.Element | None:
    """Return merged <attributes> effective at measure (sticky fields preserved)."""
    part = root.find("part")
    if part is None:
        return None
    attrs_copy: ET.Element | None = None
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        if n > measure:
            break
        attrs = m.find("attributes")
        if attrs is not None:
            attrs_copy = merge_attributes(attrs_copy, attrs)
    return attrs_copy


def _ensure_first_measure_attributes(measure: ET.Element, carry_attrs: ET.Element | None) -> None:
    """Ensure the first sliced measure has a complete attributes block."""
    if carry_attrs is None:
        return
    existing = measure.find("attributes")
    if existing is None:
        measure.insert(0, copy.deepcopy(carry_attrs))
        return
    # First measure already has partial attributes (e.g. key/time only) —
    # merge sticky fields from carry (divisions, clef, …) into it.
    merged = merge_attributes(carry_attrs, existing)
    measure.remove(existing)
    measure.insert(0, merged)


def slice_score_xml(root: ET.Element, m0: int, m1: int) -> str:
    """Build minimal MusicXML for part-1 measures m0..m1 (inclusive)."""
    src_part = root.find("part")
    if src_part is None:
        raise ValueError("score has no <part>")

    by_num = {int(m.get("number") or 0): m for m in src_part.findall("measure")}
    span_nums = [n for n in range(int(m0), int(m1) + 1) if n in by_num]
    if not span_nums:
        raise ValueError(f"no measures in span {m0}..{m1}")

    new_root = ET.Element("score-partwise", version=root.get("version", "4.0"))
    for child in root:
        if child.tag != "part":
            new_root.append(copy.deepcopy(child))
    strip_generic_creators_from_score(new_root)

    part = ET.SubElement(new_root, "part", id=src_part.get("id", "P1"))
    # Carry state *before* the first span measure so first-measure attrs can still
    # override; then merge those into the first measure if needed.
    carry_before = attributes_at_or_before(root, span_nums[0] - 1)
    carry_at = attributes_at_or_before(root, span_nums[0])

    for out_i, n in enumerate(span_nums, start=1):
        m = copy.deepcopy(by_num[n])
        m.set("number", str(out_i))
        if out_i == 1:
            # Prefer full effective attrs at m0; fall back to prior sticky state.
            carry = carry_at if carry_at is not None else carry_before
            _ensure_first_measure_attributes(m, carry)
        part.append(m)

    xml_body = ET.tostring(new_root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_body


def musicxml_to_abc(xml_text: str, *, title: str = "") -> str:
    """Convert MusicXML text to ABC using Node xml2abc-cli.js."""
    if not XML2ABC_CLI.is_file():
        raise FileNotFoundError(f"missing {XML2ABC_CLI}")

    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-8") as tmp:
        tmp.write(xml_text)
        tmp_path = tmp.name

    cmd = ["node", str(XML2ABC_CLI)]
    if title:
        cmd.extend(["--title", title])
    cmd.append(tmp_path)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "xml2abc failed").strip()
        raise RuntimeError(err)
    abc = (proc.stdout or "").strip()
    if not abc:
        raise RuntimeError("xml2abc produced empty ABC")
    if ZERO_DURATION_RE.search(abc):
        raise RuntimeError(
            "xml2abc produced /0 durations (missing MusicXML <divisions> in slice)"
        )
    return abc


def set_abc_header(abc: str, header: str, value: str) -> str:
    lines = (abc or "").splitlines()
    pat = re.compile(rf"^{re.escape(header)}:\s*", re.I)
    replaced = False
    out: list[str] = []
    for line in lines:
        if pat.match(line):
            if not replaced:
                out.append(f"{header}:{value}")
                replaced = True
            continue
        out.append(line)
    if not replaced:
        insert_at = 0
        for i, line in enumerate(out):
            if line.startswith("X:"):
                insert_at = i + 1
                break
        out.insert(insert_at, f"{header}:{value}")
    return "\n".join(out)


def apply_abc_headers(
    abc: str,
    *,
    title: str,
    key: str,
    meter: str,
    subtitle: str | None = None,
    composer: str | None = None,
) -> str:
    text = (abc or "").strip()
    if not text:
        return text
    text = strip_generic_composer_headers(text)
    text = set_abc_header(text, "T", title)
    sub = (subtitle or "").strip()
    if sub and sub.lower() not in (title or "").lower():
        lines = text.splitlines()
        t_idx = next((i for i, line in enumerate(lines) if line.startswith("T:")), 0)
        if not any(line.startswith("T:") and line[2:].strip() == sub for line in lines):
            lines.insert(t_idx + 1, f"T:{sub}")
        text = "\n".join(lines)
    comp = (composer or "").strip()
    if comp and not is_generic_composer(comp):
        text = set_abc_header(text, "C", comp)
    text = set_abc_header(text, "M", meter or "4/4")
    text = set_abc_header(text, "K", key or "C")
    if not re.search(r"^L:", text, re.M):
        text = set_abc_header(text, "L", "1/8")
    if not re.search(r"^X:", text, re.M):
        text = "X:1\n" + text
    return text.strip() + "\n"


def span_to_abc(
    mxl: Path,
    m0: int,
    m1: int,
    *,
    title: str = "",
    key: str | None = None,
    meter: str | None = None,
    subtitle: str | None = None,
    composer: str | None = None,
    root: ET.Element | None = None,
) -> str:
    score_root = root if root is not None else load_score(mxl)
    xml_text = slice_score_xml(score_root, int(m0), int(m1))
    abc = musicxml_to_abc(xml_text, title=title or "Tune")
    if key is None or meter is None:
        mxl_key, mxl_meter = mxl_key_meter_at(score_root, int(m0))
        key = key or mxl_key
        meter = meter or mxl_meter
    return apply_abc_headers(
        abc,
        title=title or "Tune",
        key=key or "C",
        meter=meter or "4/4",
        subtitle=subtitle,
        composer=composer,
    )


def mxl_candidate_row(abc: str, *, title: str, matched_title: str = "") -> dict:
    abc = (abc or "").strip()
    return {
        "id": candidate_id(MXL_SOURCE, abc),
        "source": MXL_SOURCE,
        "matchedTitle": matched_title or title,
        "url": "",
        "score": 1.0,
        "chords": len(re.findall(r'"\s*[A-G]', abc, re.I)),
        "hasChords": bool(re.search(r'"\s*[A-G]', abc, re.I)),
        "abc": abc,
        "notationIssues": [],
    }


def upsert_mxl_candidate(candidates: list[dict], abc: str, *, title: str, matched_title: str = "") -> tuple[list[dict], str]:
    row = mxl_candidate_row(abc, title=title, matched_title=matched_title)
    out = [c for c in (candidates or []) if str(c.get("source") or "") != MXL_SOURCE]
    out.insert(0, row)
    return out, row["id"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert MXL measure span to ABC")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--m0", type=int, required=True)
    parser.add_argument("--m1", type=int, required=True)
    parser.add_argument("--title", default="Tune")
    parser.add_argument("--subtitle", default="", help="ABC subtitle T: line")
    parser.add_argument("--composer", default="", help="ABC composer C: line")
    parser.add_argument("--key", default="", help="ABC K: header (default: from MXL attributes)")
    parser.add_argument("--meter", default="", help="ABC M: header (default: from MXL attributes)")
    parser.add_argument("--out", default="", help="Write ABC to file instead of stdout")
    args = parser.parse_args()

    abc = span_to_abc(
        Path(args.mxl),
        args.m0,
        args.m1,
        title=args.title,
        key=args.key or None,
        meter=args.meter or None,
        subtitle=args.subtitle or None,
        composer=args.composer or None,
    )
    if args.out:
        Path(args.out).write_text(abc, encoding="utf-8")
        print(f"wrote {args.out} ({len(abc)} chars)")
    else:
        print(abc, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
