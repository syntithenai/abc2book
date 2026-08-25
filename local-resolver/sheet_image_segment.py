"""Multi-tune page segmentation from OCR title boxes."""

from __future__ import annotations

import re
from typing import Any

TITLE_KEY_HINT_RE = re.compile(
    r"\s*\(([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:/[A-G][#b]?)?|Harmony)\)\s*$",
    re.I,
)
CHORD_TOKEN_RE = re.compile(
    r"^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?(?:\d{0,2})?(?:/[A-G](?:#|b)?)?$",
    re.I,
)
SECTION_WORDS = {
    "verse",
    "chorus",
    "intro",
    "bridge",
    "outro",
    "harmony",
    "trad",
    "traditional",
}
GENRE_HEADER_RE = re.compile(r"^trad(?:itional)?(?:\.|\s|$)", re.I)
HARMONY_TITLE_RE = re.compile(
    r"(?:^|\s)(?:\(|\[)?\s*harmony\s*(?:\)|\])?\s*$|[-–—]\s*harmony\s*$",
    re.I,
)
# Form / nav / credit / footer lines that must never drive a split.
JUNK_SPLIT_RE = re.compile(
    r"(?:"
    r"\bd\.?\s*c\.?\s*al\s+fine\b|\bal\s+fine\b|\bto\s+coda\b|\bcoda\b|"
    r"\bstart\s+here\b|\bfinal\s+time\b|"
    r"\barr\.?\b|\bcollected\s+by\b|\bwords\s+by\b|"
    r"\btunebook\b|\beurosession\b|\bv\d+\.\d+|"
    r"\bspillefolk\b|\bchords\s+arr\b|"
    r"\btrad\.?\s+(?:italian|swedish?|austrian|manx|occitan)\b|"
    r"\b(?:italian|swedish?|austrian|manx)\s+trad\b"
    r")",
    re.I,
)


def normalize_title_key(text: str) -> str:
    cleaned = TITLE_KEY_HINT_RE.sub("", str(text or "")).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).lower()
    return cleaned


def is_harmony_title(text: str) -> bool:
    cleaned = str(text or "").strip()
    if not cleaned:
        return False
    if cleaned.lower() in {"harmony", "(harmony)"}:
        return True
    return bool(HARMONY_TITLE_RE.search(cleaned))


def _title_words(text: str) -> list[str]:
    cleaned = str(text or "").strip()
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned)
    words = [w for w in re.split(r"\s+", TITLE_KEY_HINT_RE.sub("", cleaned)) if w]
    return [w for w in words if sum(ch.isalpha() for ch in w) >= 2]


def is_junk_split_title(text: str) -> bool:
    """True for form markers, credits, footers, or OCR debris that should not split."""
    cleaned = str(text or "").strip()
    if not cleaned:
        return True
    if JUNK_SPLIT_RE.search(cleaned):
        return True
    if GENRE_HEADER_RE.match(cleaned):
        return True
    if re.match(r"^\d{3,4}\b", cleaned):
        return True
    if cleaned.lstrip().startswith(("=", "|", "[", "—", "–", "+", "‘", "’", ".", ",", ";")):
        return True
    if cleaned.rstrip().endswith(("]", "|", "{", "}")):
        return True
    # Mid-line OCR usually starts mid-word / lowercase.
    first_alpha = next((ch for ch in cleaned if ch.isalpha()), "")
    if first_alpha and first_alpha.islower() and not TITLE_KEY_HINT_RE.search(cleaned):
        return True
    # Trailing OCR debris on short composer-like lines.
    if re.search(r"\b(?:ee|aa)\s*$", cleaned, re.I):
        base = re.sub(r"\b(?:ee|aa)\s*$", "", cleaned, flags=re.I).strip()
        raw_words = [w for w in base.split() if w]
        # Keep titles with lowercase particles (a, de, du, lo, fra, ...).
        if not any(len(w) <= 3 and w.islower() for w in raw_words):
            base_words = _title_words(base)
            if len(base_words) == 2 and all(
                re.match(r"^[A-ZÀÂÄÆÉÈÊËÎÏÔŒÙÛÜŸÑÇØÅ][a-zàâäæéèêëîïôœùûüÿñçøå'-]+$", w)
                for w in base_words
            ):
                return True
    # High punctuation / symbol noise.
    nonspace = cleaned.replace(" ", "")
    letters = sum(1 for ch in cleaned if ch.isalpha())
    if nonspace and letters / len(nonspace) < 0.62:
        return True
    letter_chars = [ch for ch in cleaned if ch.isalpha()]
    if letter_chars:
        upper_ratio = sum(1 for ch in letter_chars if ch.isupper()) / len(letter_chars)
        if upper_ratio > 0.85 and not TITLE_KEY_HINT_RE.search(cleaned):
            return True
    # All-caps short abbreviations / OCR blobs.
    letters_only = re.sub(r"[^A-Za-zÀ-ÿ]", "", cleaned)
    alpha_words = _title_words(cleaned)
    if (
        letters_only
        and letters_only.isupper()
        and len(alpha_words) <= 3
        and len(letters_only) <= 18
        and not re.search(r"[a-zàâäæéèêëîïôœùûüÿñçøå]", cleaned)
        and not TITLE_KEY_HINT_RE.search(cleaned)
    ):
        return True
    return False


def is_strong_split_title(text: str) -> bool:
    """True when a line is a confident tune boundary (not harmony continuation)."""
    cleaned = str(text or "").strip()
    if not cleaned or not looks_like_title_line(cleaned):
        return False
    if is_harmony_title(cleaned):
        return False
    if is_junk_split_title(cleaned):
        return False
    if TITLE_KEY_HINT_RE.search(cleaned):
        base = TITLE_KEY_HINT_RE.sub("", cleaned).strip()
        if JUNK_SPLIT_RE.search(base) or is_junk_split_title(base):
            return False
        base_words = _title_words(base)
        if not base_words:
            return False
        # Reject chord-row leftovers that only happen to end in (Am).
        if len(base_words) <= 2 and all(len(w) <= 4 for w in base_words):
            return False
        return True

    alpha_words = _title_words(cleaned)
    if len(alpha_words) < 2:
        return False
    if len(alpha_words) > 6:
        return False
    if cleaned.count("(") != cleaned.count(")"):
        return False

    first = alpha_words[0]
    if CHORD_TOKEN_RE.match(first) or re.match(r"^[A-G][#b]?$", first, re.I):
        return False

    # Prefer Latin-script folk titles; reject mostly Greek/Cyrillic OCR debris.
    letters = [ch for ch in cleaned if ch.isalpha()]
    latin = sum(1 for ch in letters if "A" <= ch.upper() <= "Z" or "À" <= ch <= "ÿ")
    if letters and latin / len(letters) < 0.7:
        return False

    # Require some lowercase (real printed titles OCR with mixed case).
    if not re.search(r"[a-zàâäæéèêëîïôœùûüÿñçøå]", cleaned):
        return False

    chordish = sum(
        1 for w in alpha_words
        if CHORD_TOKEN_RE.match(w) or re.match(r"^[A-G][#b]?m?\d*$", w, re.I)
    )
    if chordish >= 2 and chordish >= len(alpha_words) * 0.35:
        return False
    if any(re.search(r"[A-G][#b]?m?[A-G]", w) for w in alpha_words):
        return False

    long_words = sum(1 for w in alpha_words if len(w) >= 4)
    avg_len = sum(len(w) for w in alpha_words) / len(alpha_words)
    two_word_title = (
        len(alpha_words) == 2
        and len(alpha_words[0]) >= 5
        and len(alpha_words[1]) >= 3
        and sum(len(w) for w in alpha_words) >= 9
    )
    three_plus = len(alpha_words) >= 3 and long_words >= 2
    if (long_words >= 2 or two_word_title or three_plus) and avg_len >= 3.0:
        return True
    return False


def looks_like_person_name_title(text: str) -> bool:
    """True for bare First Last lines (usually composer credits under a title)."""
    # Strip common OCR tails before testing.
    cleaned = re.sub(r"\b(?:ee|aa)\s*$", "", str(text or ""), flags=re.I).strip()
    alpha_words = _title_words(cleaned)
    if len(alpha_words) != 2:
        return False
    return all(
        re.match(r"^[A-ZÀÂÄÆÉÈÊËÎÏÔŒÙÛÜŸÑÇØÅ][a-zàâäæéèêëîïôœùûüÿñçøå'-]+$", w)
        for w in alpha_words
    )


def clean_segment_title(text: str) -> str:
    """Normalize OCR title for filenames/manifest."""
    cleaned = str(text or "").strip().lstrip("/ ").strip()
    if not cleaned:
        return ""
    if is_harmony_title(cleaned):
        base = HARMONY_TITLE_RE.sub("", cleaned).strip(" -–—")
        return base or cleaned
    # Trim trailing OCR debris after a closing paren.
    if ")" in cleaned:
        head, _, tail = cleaned.rpartition(")")
        if head and (not tail.strip() or len(tail.strip()) <= 3):
            cleaned = head + ")"
    # "Amazone Cyrille Brotto" -> "Amazone" when second/third look like composer names.
    words = cleaned.split()
    if (
        len(words) == 3
        and not TITLE_KEY_HINT_RE.search(cleaned)
        and words[0][0].isupper()
        and len(words[0]) >= 4
        and all(w[0].isupper() and len(w) >= 4 for w in words[1:])
    ):
        return words[0]
    return cleaned


def looks_like_title_line(text: str) -> bool:
    cleaned = str(text or "").strip()
    if not cleaned or len(cleaned) < 3:
        return False
    if cleaned.isdigit():
        return False
    if re.match(r"^page\s+\d+$", cleaned, re.I):
        return False
    if re.match(r"^\d+\s*[/|]\s*\d+$", cleaned):
        return False
    lowered = cleaned.lower().strip(" .")
    if lowered in SECTION_WORDS:
        return False
    if CHORD_TOKEN_RE.match(cleaned):
        return False
    tokens = cleaned.replace(",", " ").split()
    if tokens and all(CHORD_TOKEN_RE.match(tok) for tok in tokens):
        return False
    if len(cleaned) > 120:
        return False

    # Reject staff/music OCR debris.
    if re.search(r"[_\-]{3,}", cleaned):
        return False
    if re.search(r"(.)\1{3,}", cleaned):
        return False
    if re.search(r"SSS|Error SS|——|—{2,}|jm mn|Buer mm|Ha;|tå -", cleaned, re.I):
        return False

    letters = sum(1 for ch in cleaned if ch.isalpha())
    digits = sum(1 for ch in cleaned if ch.isdigit())
    if letters < 4:
        return False
    nonspace = cleaned.replace(" ", "")
    if letters / max(1, len(nonspace)) < 0.55:
        return False
    if digits > letters:
        return False

    words = [w for w in re.split(r"\s+", TITLE_KEY_HINT_RE.sub("", cleaned)) if w]
    alpha_words = [w for w in words if sum(ch.isalpha() for ch in w) >= 2]
    if len(alpha_words) < 1:
        return False
    if len(alpha_words) == 1 and len(alpha_words[0]) < 5 and not TITLE_KEY_HINT_RE.search(cleaned):
        return False
    return True


def _box_center_x(box: dict[str, Any]) -> float:
    return float(box.get("x", 0)) + float(box.get("width", 0)) / 2.0


def _box_top(box: dict[str, Any]) -> float:
    return float(box.get("y", 0))


def _box_bottom(box: dict[str, Any]) -> float:
    return float(box.get("y", 0)) + float(box.get("height", 0))


def _cluster_lines(boxes: list[dict[str, Any]], y_tol: float = 18.0) -> list[dict[str, Any]]:
    """Cluster OCR word boxes into horizontal lines."""
    ordered = sorted(
        [b for b in boxes if str(b.get("text") or "").strip()],
        key=lambda b: (_box_top(b), float(b.get("x", 0))),
    )
    lines: list[dict[str, Any]] = []
    for box in ordered:
        top = _box_top(box)
        placed = False
        for line in lines:
            if abs(top - line["top"]) <= y_tol:
                line["boxes"].append(box)
                line["top"] = min(line["top"], top)
                line["bottom"] = max(line["bottom"], _box_bottom(box))
                placed = True
                break
        if not placed:
            lines.append({
                "boxes": [box],
                "top": top,
                "bottom": _box_bottom(box),
            })

    result: list[dict[str, Any]] = []
    for line in lines:
        boxes_sorted = sorted(line["boxes"], key=lambda b: float(b.get("x", 0)))
        text = " ".join(str(b.get("text") or "").strip() for b in boxes_sorted).strip()
        if not text:
            continue
        left = min(float(b.get("x", 0)) for b in boxes_sorted)
        right = max(float(b.get("x", 0)) + float(b.get("width", 0)) for b in boxes_sorted)
        height = max(1.0, line["bottom"] - line["top"])
        confs = [float(b.get("confidence") or 0.0) for b in boxes_sorted]
        result.append({
            "text": text,
            "top": line["top"],
            "bottom": line["bottom"],
            "left": left,
            "right": right,
            "height": height,
            "centerX": (left + right) / 2.0,
            "confidence": sum(confs) / max(1, len(confs)),
        })
    result.sort(key=lambda item: item["top"])
    return result


def select_title_lines(
    lines: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    """Pick centered title-like lines suitable for multi-tune splits."""
    if not lines or image_width <= 0 or image_height <= 0:
        return []

    candidate_heights = [
        float(line.get("height") or 0)
        for line in lines
        if looks_like_title_line(str(line.get("text") or ""))
    ]
    heights = candidate_heights or [float(line.get("height") or 0) for line in lines]
    median_h = sorted(heights)[len(heights) // 2] if heights else 12.0
    mid_x = image_width / 2.0
    titles: list[dict[str, Any]] = []

    for line in lines:
        text = str(line.get("text") or "").strip()
        if not looks_like_title_line(text):
            continue
        height = float(line.get("height") or 0)
        min_height = max(12.0, median_h * 0.9)
        if TITLE_KEY_HINT_RE.search(text):
            min_height = max(10.0, median_h * 0.75)
        if height < min_height:
            continue
        center_x = float(line.get("centerX") or 0)
        if abs(center_x - mid_x) > image_width * 0.22:
            continue
        width = float(line.get("right", 0)) - float(line.get("left", 0))
        if width < image_width * 0.15:
            continue
        if width > image_width * 0.92:
            continue
        if float(line.get("top") or 0) > image_height * 0.94:
            continue
        score = float(line.get("confidence") or 0.0)
        if TITLE_KEY_HINT_RE.search(text):
            score += 0.2
        item = dict(line)
        item["score"] = score
        titles.append(item)

    titles.sort(key=lambda item: item["top"])
    deduped: list[dict[str, Any]] = []
    for title in titles:
        if deduped and abs(title["top"] - deduped[-1]["top"]) < max(28.0, median_h * 1.8):
            if title.get("score", 0) >= deduped[-1].get("score", 0):
                deduped[-1] = title
            continue
        deduped.append(title)

    filtered: list[dict[str, Any]] = []
    for title in deduped:
        if filtered:
            gap = float(title["top"]) - float(filtered[-1]["bottom"])
            if gap < max(40.0, image_height * 0.03):
                if title.get("score", 0) > filtered[-1].get("score", 0):
                    filtered[-1] = title
                continue
        filtered.append(title)
    return filtered


def select_strong_title_lines(
    lines: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    """Centered title lines that are strong enough to drive a page split."""
    candidates = select_title_lines(lines, image_width, image_height)
    return [
        title for title in candidates
        if is_strong_split_title(str(title.get("text") or ""))
    ]


def segments_from_title_lines(
    titles: list[dict[str, Any]],
    image_height: int,
    pad_px: int = 8,
) -> list[dict[str, Any]]:
    """Build vertical segments covering each title through the next title."""
    if image_height <= 0:
        return []
    if not titles:
        return [{
            "title": "",
            "top": 0,
            "bottom": image_height,
            "confidence": 0.0,
            "index": 0,
        }]

    segments: list[dict[str, Any]] = []
    for index, title in enumerate(titles):
        top = max(0, int(float(title["top"]) - pad_px))
        if index + 1 < len(titles):
            next_top = float(titles[index + 1]["top"])
            bottom = int(max(top + 1, (float(title["bottom"]) + next_top) / 2.0))
        else:
            bottom = image_height
        bottom = min(image_height, max(bottom, int(float(title["bottom"]) + pad_px)))
        segments.append({
            "title": str(title.get("text") or "").strip(),
            "top": top,
            "bottom": bottom,
            "confidence": float(title.get("confidence") or 0.0),
            "index": index,
            "titleTop": float(title.get("top") or top),
            "titleBottom": float(title.get("bottom") or top),
        })
    return segments


def segment_page_from_ocr_boxes(
    boxes: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    lines = _cluster_lines(boxes or [])
    titles = select_title_lines(lines, image_width, image_height)
    return segments_from_title_lines(titles, image_height)


def crop_box_for_segment(segment: dict[str, Any], image_width: int, image_height: int) -> tuple[int, int, int, int]:
    top = max(0, int(segment.get("top") or 0))
    bottom = min(image_height, int(segment.get("bottom") or image_height))
    if bottom <= top:
        bottom = min(image_height, top + 1)
    return 0, top, image_width, bottom
