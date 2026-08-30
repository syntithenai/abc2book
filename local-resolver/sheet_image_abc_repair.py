"""Post-OMR ABC cleanup: decimals, weak detection, safe render fixes, title key hints."""

from __future__ import annotations

import re
from fractions import Fraction

_TITLE_KEY_RE = re.compile(
    r"\(([A-G][#b]?)(\s*(?:maj(?:or)?|min(?:or)?|m|dorian|mix(?:olydian)?|lydian|phrygian))?(?:\d)?(?:\s*/[^)]*)?\)",
    re.I,
)
_DECIMAL_DURATION_RE = re.compile(r"[A-Ga-g](?:,*)(?:\'*)\d+\.\d+")
_ANN_PREFIX = "\x00ANN"
_ANN_SUFFIX = "\x00"


def fix_decimal_durations(abc: str) -> str:
    """Convert invalid OMR decimals like G0.75 → G3/4."""

    def to_frac(val: float) -> str:
        frac = Fraction(val).limit_denominator(16)
        if frac.denominator == 1:
            return str(frac.numerator)
        return f"{frac.numerator}/{frac.denominator}"

    def repl(match: re.Match) -> str:
        return match.group(1) + to_frac(float(match.group(2)))

    return re.sub(
        r"((?:\^[A-Ga-g]|_[A-Ga-g]|=?[A-Ga-g]|[zZ])[,']*)(\d+\.\d+)",
        repl,
        abc or "",
    )


def _abc_music_body(abc: str) -> str:
    text = abc or ""
    body = text
    for line in text.splitlines():
        if line.startswith("K:"):
            idx = text.find(line)
            if idx >= 0:
                body = text[idx + len(line) :]
            break
    return body


def looks_weak_abc(abc: str) -> bool:
    if not abc or len(abc) < 20:
        return True
    body = _abc_music_body(abc)
    body_no_chords = re.sub(r'"[^"\n]*"', "", body)
    notes = len(re.findall(r"[A-Ga-g]", body_no_chords))
    if notes < 8:
        return True
    if re.search(r'"{3,}|^\s*""|(?<=[|: ])""[A-G]|""(?=")', abc):
        return True
    if re.search(r'(?<!["A-Ga-g])(?:Am|Em|Dm|Bm|F#m|C#m){2,}', abc):
        return True
    if _DECIMAL_DURATION_RE.search(abc):
        return True
    bar_separators = len(re.findall(r"\|", body_no_chords))
    if bar_separators >= 12 and notes < bar_separators:
        return True
    rest_bars = len(re.findall(r"\|\s*[zZ]\d*\s*(?:\||$)", body_no_chords))
    if rest_bars >= 2 and rest_bars * 4 >= max(notes, 1):
        return True
    rest_only_bar_segments = len(
        re.findall(
            r"\|\s*(?:[zZ]\d*\s*)+\|",
            body_no_chords,
        )
    )
    if rest_only_bar_segments >= 2:
        return True
    rest_tokens = len(re.findall(r"\b[zZ]\d*\b", body_no_chords))
    if rest_tokens >= 3 and rest_tokens >= notes // 2:
        return True
    return False


def abc_quality_warnings(abc: str, *, expected_meter: str | None = None) -> list[str]:
    warnings: list[str] = []
    text = abc or ""
    if looks_weak_abc(text):
        warnings.append("weak_abc")
    if expected_meter:
        m = re.search(r"^M:\s*([^\n]+)", text, re.M)
        got = (m.group(1).strip() if m else "")
        if got and got != expected_meter.strip():
            warnings.append(f"meter_mismatch:{got}!={expected_meter.strip()}")
    if re.search(r'"{3,}|^\s*""|(?<=[|: ])""[A-G]|""(?=")', text):
        warnings.append("mangled_quote_chords")
    if _DECIMAL_DURATION_RE.search(text):
        warnings.append("decimal_durations")
    note_letters = len(re.findall(r"[A-Ga-g]", text))
    staff_hints = len(re.findall(r"\|", text))
    if staff_hints >= 12 and note_letters < staff_hints:
        warnings.append("sparse_notes_for_barlines")
    return warnings


def parse_title_key(title: str) -> tuple[str, str] | None:
    """Extract key hint from title like (Gm), (Dm), (Am dorian/G). Returns (root, mode)."""
    matches = list(_TITLE_KEY_RE.finditer(title or ""))
    for match in reversed(matches):
        root = (match.group(1) or "").upper()
        mode_raw = (match.group(2) or "").strip().lower()
        full = match.group(0)[1:-1]
        if re.search(r"dorian", full, re.I):
            return root, "dorian"
        if mode_raw in {"m", "min", "minor"}:
            return root, "minor"
        if mode_raw in {"maj", "major"}:
            return root, "major"
        compact = re.sub(r"\s+", "", full)
        if re.search(r"dorian", full, re.I):
            return root, "dorian"
        if compact.endswith("m") and not compact.endswith("maj"):
            return root, "minor"
        if re.search(r"\bm\b", full, re.I) and not re.search(r"maj", full, re.I):
            return root, "minor"
        return root, "major"
    return None


def abc_key_header(root: str, mode: str) -> str:
    r = root[0].upper() + (root[1:] if len(root) > 1 else "")
    mode = (mode or "major").lower()
    if mode == "major":
        return r
    if mode == "minor":
        return r + "m"
    return r + mode


def set_abc_header(abc: str, field: str, value: str) -> str:
    lines = (abc or "").splitlines()
    key = field + ":"
    out: list[str] = []
    seen = False
    for line in lines:
        if line.startswith(key):
            if not seen:
                out.append(f"{key}{value}")
                seen = True
            continue
        out.append(line)
    if not seen:
        out.insert(0, f"{key}{value}")
    return "\n".join(out).strip() + "\n"


def apply_title_key_hint(abc: str, title: str) -> str:
    """Seed K: from title parenthetical when HOMR key looks like a default guess."""
    hint = parse_title_key(title)
    if not hint:
        return abc
    target = abc_key_header(*hint)
    m = re.search(r"^K:\s*([^\n]+)", abc or "", re.M)
    current = (m.group(1).strip() if m else "").split()[0]
    if not current or current in {"Bb", "C", "G"} or current != target:
        return set_abc_header(abc, "K", target)
    return abc


def _is_music_body_line(line: str) -> bool:
    s = (line or "").strip()
    if not s or s.startswith("%"):
        return False
    return not re.match(r"^[A-Za-z]:", s)


def strip_blank_lines_before_music(abc: str) -> str:
    lines = (abc or "").splitlines()
    first_music = None
    for i, line in enumerate(lines):
        if _is_music_body_line(line):
            first_music = i
            break
    if first_music is None:
        return abc or ""
    header = lines[:first_music]
    body = lines[first_music:]
    while header and not header[-1].strip():
        header.pop()
    while body and not body[0].strip():
        body.pop(0)
    return "\n".join(header + body).strip() + "\n"


def convert_session_line_breaks(abc: str) -> str:
    """Session ! line-breaks → newlines (preserves !fermata! etc.)."""
    text = abc or ""

    def _is_music_body_line_local(line: str) -> bool:
        return _is_music_body_line(line)

    parts = re.split(r"(\r?\n)", text)
    out: list[str] = []
    for part in parts:
        if part in ("\n", "\r\n"):
            out.append(part)
            continue
        if not _is_music_body_line_local(part):
            out.append(part)
            continue
        anns: list[str] = []

        def _protect(m: re.Match) -> str:
            anns.append(m.group(0))
            return f"{_ANN_PREFIX}{len(anns)-1}{_ANN_SUFFIX}"

        protected = re.sub(r"!([A-Za-z][A-Za-z0-9_]*)!", _protect, part)
        converted = protected.replace("!", "\n")

        def _restore(m: re.Match) -> str:
            idx = int(m.group(1))
            return anns[idx] if 0 <= idx < len(anns) else ""

        out.append(
            re.sub(
                re.escape(_ANN_PREFIX) + r"(\d+)" + re.escape(_ANN_SUFFIX),
                _restore,
                converted,
            )
        )
    return "".join(out)


def ensure_final_barline(abc: str) -> str:
    lines = (abc or "").splitlines()
    if not lines:
        return abc or ""
    last_music = None
    for i in range(len(lines) - 1, -1, -1):
        if _is_music_body_line(lines[i]):
            last_music = i
            break
    if last_music is None:
        return abc or ""
    line = lines[last_music].rstrip()
    if re.search(r"(?:\|\]|\|\|)\s*$", line):
        return "\n".join(lines).strip() + "\n"
    if re.search(r"(?:\|:|:\||::)\s*$", line):
        return "\n".join(lines).strip() + "\n"
    if line.endswith("|"):
        lines[last_music] = line + "|"
    else:
        lines[last_music] = line + "||"
    return "\n".join(lines).strip() + "\n"


def safe_autofix_abc(abc: str) -> str:
    text = convert_session_line_breaks(abc or "")
    text = strip_blank_lines_before_music(text)
    text = ensure_final_barline(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def meter_hint_from_title(title: str) -> str | None:
    """Guess M: from tune-type words in the title (bourrée, waltz, etc.)."""
    text = (title or "").lower()
    text = text.replace("é", "e").replace("è", "e").replace("ê", "e")
    if re.search(r"bourr?ee|polka|schottische|scottische|freylekh", text):
        return "2/4"
    if re.search(r"waltz|valse|slangpolska|mazurka", text):
        return "3/4"
    if re.search(r"\bjig\b", text):
        return "6/8"
    if re.search(r"\breel\b|\bhornpipe\b", text):
        return "4/4"
    if re.search(r"an dro|plinn", text):
        return "4/4"
    return None


def apply_section_repeat_heuristic(abc: str, *, section_bars: int | None = None) -> str:
    """Wrap N-bar sections as |: … :| when ABC has no repeat marks."""
    from sheet_image_structure import apply_section_repeat_to_abc

    meter_m = re.search(r"^M:\s*(\S+)", abc or "", re.M)
    meter = (meter_m.group(1) if meter_m else "").strip()
    return apply_section_repeat_to_abc(abc, meter=meter, section_bars=section_bars)


def repair_omr_abc(
    abc: str,
    title: str = "",
    *,
    meter_hint: str | None = None,
    key_override: str | None = None,
) -> str:
    """Normalize OMR ABC headers and section repeats (EuroSession repair_abc parity)."""
    text = fix_decimal_durations(abc or "")
    text = set_abc_header(text, "L", "1/4")
    if key_override:
        text = set_abc_header(text, "K", key_override)
    else:
        hint = parse_title_key(title)
        if hint:
            text = set_abc_header(text, "K", abc_key_header(*hint))
        elif re.search(r"^K:\s*Bb\b", text, re.M):
            text = set_abc_header(text, "K", "C")
    resolved_meter = (meter_hint or "").strip()
    if not resolved_meter:
        resolved_meter = meter_hint_from_title(title) or ""
    if resolved_meter and re.match(r"^\d+/\d+$", resolved_meter):
        text = set_abc_header(text, "M", resolved_meter)
    text = apply_section_repeat_heuristic(text)
    return text


def polish_omr_abc(
    abc: str,
    *,
    title: str = "",
    meter_hint: str | None = None,
    key_override: str | None = None,
) -> tuple[str, list[str]]:
    """Standard post-OMR cleanup for resolver output."""
    text = repair_omr_abc(
        abc or "",
        title or "",
        meter_hint=meter_hint,
        key_override=key_override,
    )
    if title and not key_override:
        text = apply_title_key_hint(text, title)
    text = safe_autofix_abc(text)
    expected_meter = (meter_hint or meter_hint_from_title(title) or "").strip() or None
    warnings = abc_quality_warnings(text, expected_meter=expected_meter)
    return text, warnings
