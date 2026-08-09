"""Chord-sheet line classification and reconstruction for image OCR."""

from __future__ import annotations

import re
from typing import Any

from chords_fetch import (
    finalize_sheet_lines,
    is_chord_sheet_line,
    is_section_header,
    normalize_sheet_line,
    split_mixed_chord_line,
    token_is_chord,
)

__all__ = [
    "classify_lyric_chord_lines",
    "has_chord_lines",
    "split_into_blocks",
    "coalesce_section_header_blocks",
    "split_blocks_on_interior_headers",
    "normalize_lyric_blocks",
    "normalize_section_type",
    "build_sections_from_lines",
    "reconstruct_chord_sheet_details",
    "reconstruct_chords_over_words",
    "lines_to_chord_sheet_text",
    "estimate_chord_sheet_confidence",
]


def classify_lyric_chord_lines(lines: list[str]) -> list[dict[str, str]]:
    classified: list[dict[str, str]] = []
    for raw in lines or []:
        line = "" if raw is None else str(raw)
        trimmed = line.strip()
        if not trimmed:
            classified.append({"type": "blank", "text": ""})
            continue
        if is_section_header(trimmed):
            classified.append({"type": "header", "text": trimmed})
            continue
        if is_chord_sheet_line(trimmed):
            classified.append({"type": "chord", "text": line})
            continue
        classified.append({"type": "lyric", "text": line})
    return classified


def has_chord_lines(lines: list[str]) -> bool:
    return any(item["type"] == "chord" for item in classify_lyric_chord_lines(lines))


def split_into_blocks(lines: list[str]) -> list[list[str]]:
    source = list(lines or [])
    soft_single_blanks = _should_soft_join_single_blanks(source)
    blocks: list[list[str]] = []
    current: list[str] = []
    blank_run = 0
    for raw in source:
        line = "" if raw is None else str(raw)
        if not line.strip():
            blank_run += 1
            if not soft_single_blanks:
                if current:
                    blocks.append(current)
                    current = []
                continue
            if blank_run >= 2 and current:
                blocks.append(current)
                current = []
            continue
        blank_run = 0
        current.append(line)
    if current:
        blocks.append(current)
    return blocks


def _source_uses_double_blank_stanzas(lines: list[str]) -> bool:
    blank_run = 0
    for raw in lines or []:
        line = "" if raw is None else str(raw)
        if not line.strip():
            blank_run += 1
            if blank_run >= 2:
                return True
        else:
            blank_run = 0
    return False


def _has_consecutive_nonempty_lyric_lines(lines: list[str]) -> bool:
    source = list(lines or [])
    for i in range(len(source) - 1):
        line = str(source[i] or "").strip()
        next_line = str(source[i + 1] or "").strip()
        if line and next_line and not is_section_header(line) and not is_section_header(next_line):
            return True
    return False


def _source_uses_per_line_double_spacing(lines: list[str]) -> bool:
    source = list(lines or [])
    followed_by_blank = 0
    followed_by_nonempty = 0
    for i in range(len(source) - 1):
        line = str(source[i] or "").strip()
        if not line or is_section_header(line):
            continue
        next_line = str(source[i + 1] or "").strip()
        if not next_line:
            followed_by_blank += 1
        else:
            followed_by_nonempty += 1
    if followed_by_blank < 2:
        return False
    if followed_by_blank >= 3:
        return True
    if followed_by_blank == 2 and followed_by_nonempty == 0:
        return False
    return followed_by_blank > followed_by_nonempty


def _should_soft_join_single_blanks(lines: list[str]) -> bool:
    source = list(lines or [])
    if _source_uses_double_blank_stanzas(source):
        return True
    if _has_consecutive_nonempty_lyric_lines(source):
        return False
    return _source_uses_per_line_double_spacing(source)


def coalesce_section_header_blocks(blocks: list[list[str]]) -> list[list[str]]:
    merged: list[list[str]] = []
    source = list(blocks or [])
    i = 0
    while i < len(source):
        block = source[i]
        next_block = source[i + 1] if i + 1 < len(source) else None
        if (
            len(block) == 1
            and is_section_header(block[0])
            and next_block
            and len(next_block) > 0
            and not is_section_header(next_block[0])
        ):
            merged.append([block[0]] + list(next_block))
            i += 2
        elif block:
            merged.append(list(block))
            i += 1
        else:
            i += 1
    return merged


def split_blocks_on_interior_headers(blocks: list[list[str]]) -> list[list[str]]:
    split: list[list[str]] = []
    for block in blocks or []:
        current: list[str] = []
        for line in block or []:
            if current and is_section_header(line):
                split.append(current)
                current = [line]
            else:
                current.append(line)
        if current:
            split.append(current)
    return split


def normalize_lyric_blocks(lines: list[str]) -> list[list[str]]:
    return split_blocks_on_interior_headers(coalesce_section_header_blocks(split_into_blocks(lines)))


def normalize_section_type(header: str | None) -> str | None:
    if not header:
        return None
    cleaned = re.sub(r"[\[\]]", " ", str(header).lower())
    cleaned = re.sub(r"[^a-z\s-]", " ", cleaned).strip()
    if not cleaned:
        return None
    first = cleaned.split()[0]
    if first.startswith("pre"):
        return "prechorus"
    return first or None


def build_sections_from_lines(lines: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for item in classify_lyric_chord_lines(lines):
        if item["type"] == "blank":
            if current and current.get("lines"):
                sections.append(current)
                current = None
            continue
        if item["type"] == "header":
            if current and current.get("lines"):
                sections.append(current)
            current = {
                "header": item["text"],
                "type": normalize_section_type(item["text"]),
                "lines": [],
            }
            continue
        if current is None:
            current = {"header": "", "type": None, "lines": []}
        current["lines"].append(item)
    if current and current.get("lines"):
        sections.append(current)
    return sections


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _group_ocr_boxes_into_lines(
    boxes: list[dict[str, Any]],
    y_tolerance: float | None = None,
) -> list[list[dict[str, Any]]]:
    if not boxes:
        return []
    heights = [max(1.0, float(box.get("height") or 8.0)) for box in boxes]
    tolerance = y_tolerance if y_tolerance is not None else max(8.0, _median(heights) * 0.6)
    sorted_boxes = sorted(boxes, key=lambda box: (float(box.get("y") or 0.0), float(box.get("x") or 0.0)))
    lines: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_y: float | None = None
    for box in sorted_boxes:
        y = float(box.get("y") or 0.0)
        if current and current_y is not None and abs(y - current_y) > tolerance:
            lines.append(sorted(current, key=lambda item: float(item.get("x") or 0.0)))
            current = []
            current_y = None
        current.append(box)
        current_y = y if current_y is None else (current_y + y) / 2.0
    if current:
        lines.append(sorted(current, key=lambda item: float(item.get("x") or 0.0)))
    return lines


def _line_text_from_boxes(line_boxes: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    prev_right: float | None = None
    for box in line_boxes:
        text = normalize_sheet_line(str(box.get("text") or ""))
        if not text:
            continue
        x = float(box.get("x") or 0.0)
        width = float(box.get("width") or 0.0)
        if prev_right is not None and x - prev_right > max(12.0, width * 0.35):
            parts.append(" " * max(1, int((x - prev_right) / 8.0)))
        elif parts and not parts[-1].endswith(" "):
            parts.append(" ")
        parts.append(text)
        prev_right = x + width
    return normalize_sheet_line("".join(parts))


def _line_details_from_boxes(line_boxes: list[dict[str, Any]]) -> dict[str, Any]:
    text = _line_text_from_boxes(line_boxes)
    tokens: list[dict[str, Any]] = []
    cursor = 0
    for box in line_boxes:
        token_text = normalize_sheet_line(str(box.get("text") or ""))
        if not token_text:
            continue
        start = cursor
        end = start + len(token_text)
        cursor = end + 1
        tokens.append({
            "text": token_text,
            "start": start,
            "end": end,
            "x": float(box.get("x") or 0.0),
            "y": float(box.get("y") or 0.0),
            "width": float(box.get("width") or 1.0),
            "height": float(box.get("height") or 1.0),
            "confidence": float(box.get("confidence") or 0.0),
        })
    return {
        "text": text,
        "tokens": tokens,
        "boxes": [
            {
                "text": normalize_sheet_line(str(box.get("text") or "")),
                "x": float(box.get("x") or 0.0),
                "y": float(box.get("y") or 0.0),
                "width": float(box.get("width") or 1.0),
                "height": float(box.get("height") or 1.0),
                "confidence": float(box.get("confidence") or 0.0),
            }
            for box in line_boxes
            if normalize_sheet_line(str(box.get("text") or ""))
        ],
    }


def reconstruct_chord_sheet_details(ocr_boxes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    line_groups = _group_ocr_boxes_into_lines(ocr_boxes)
    details = []
    for group in line_groups:
        detail = _line_details_from_boxes(group)
        if detail["text"]:
            details.append(detail)
    return details


def reconstruct_chords_over_words(ocr_boxes: list[dict[str, Any]]) -> list[str]:
    raw_lines = [detail["text"] for detail in reconstruct_chord_sheet_details(ocr_boxes)]
    return finalize_sheet_lines([line for line in raw_lines if line is not None])


def lines_to_chord_sheet_text(lines: list[str]) -> str:
    output: list[str] = []
    for line in lines or []:
        if line == "":
            if output and output[-1] != "":
                output.append("")
            continue
        output.append(str(line))
    while output and output[-1] == "":
        output.pop()
    return "\n".join(output)


def estimate_chord_sheet_confidence(lines: list[str], ocr_boxes: list[dict[str, Any]] | None = None) -> float:
    classified = classify_lyric_chord_lines(lines)
    non_blank = [item for item in classified if item["type"] != "blank"]
    if not non_blank:
        return 0.0
    score = 0.35
    if has_chord_lines(lines):
        score += 0.25
    lyric_count = sum(1 for item in non_blank if item["type"] == "lyric")
    chord_count = sum(1 for item in non_blank if item["type"] == "chord")
    header_count = sum(1 for item in non_blank if item["type"] == "header")
    if lyric_count:
        score += 0.2
    if chord_count:
        score += 0.1
    if header_count:
        score += 0.05
    if ocr_boxes:
        confidences = [float(box.get("confidence") or 0.0) for box in ocr_boxes if box.get("text")]
        if confidences:
            score = min(1.0, score * 0.6 + (sum(confidences) / len(confidences)) * 0.4)
    unknown_lines = sum(
        1
        for item in non_blank
        if item["type"] == "lyric" and not re.search(r"[A-Za-z]", item["text"])
    )
    if unknown_lines:
        score -= min(0.25, unknown_lines * 0.05)
    return max(0.0, min(1.0, score))


def chord_tokens_all_parse(tokens: list[str]) -> bool:
    cleaned = [token for token in tokens if token]
    return bool(cleaned) and all(token_is_chord(token) for token in cleaned)


def is_chord_line(line: str) -> bool:
    return is_chord_sheet_line(line)
