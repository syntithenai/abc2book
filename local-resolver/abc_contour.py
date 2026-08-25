"""ABC pitch-contour / incipit helpers for melody matching."""

from __future__ import annotations

import re
import unicodedata

# Pitch class relative to C (ignoring octave); sharps/flats via accidentals.
_NOTE_BASE = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
}

_HEADER_LINE_RE = re.compile(r"^[A-Za-z]:")
_NOTE_RE = re.compile(
    r"(?:\^|=|_)?"
    r"[A-Ga-g]"
    r"[',]*"
)
_SKIP_RE = re.compile(
    r'(?:"[^"]*")'  # chords
    r"|(?:![^!]*!)"  # decorations
    r"|(?:\{[^}]*\})"  # grace
    r"|(?:\[[^\]]*\])"  # chords / fingerings
    r"|(?:%[^\n]*)"  # comments
)


def _fold(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def strip_abc_headers(abc_text: str) -> str:
    """Return body after the first K: line (melody notes)."""
    lines = str(abc_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    body_start = 0
    for idx, line in enumerate(lines):
        if line.upper().startswith("K:"):
            body_start = idx + 1
            break
    body_lines = []
    for line in lines[body_start:]:
        if _HEADER_LINE_RE.match(line) and not line.upper().startswith("W:"):
            # Mid-tune header (key change etc.) — keep following notes.
            if line.upper().startswith("K:"):
                continue
            continue
        body_lines.append(line)
    return "\n".join(body_lines)


def _midi_from_token(token: str) -> int | None:
    if not token:
        return None
    accidental = 0
    i = 0
    if token[0] in "^=_":
        accidental = 1 if token[0] == "^" else (-1 if token[0] == "_" else 0)
        i = 1
    if i >= len(token):
        return None
    letter = token[i]
    i += 1
    base = _NOTE_BASE.get(letter.upper())
    if base is None:
        return None
    octave = 5 if letter.isupper() else 6
    while i < len(token):
        if token[i] == "'":
            octave += 1
        elif token[i] == ",":
            octave -= 1
        else:
            break
        i += 1
    return (octave * 12) + base + accidental


def extract_pitch_midi_sequence(abc_text: str, max_notes: int = 64) -> list[int]:
    """Extract absolute MIDI-ish pitch numbers from ABC body (first voice)."""
    body = strip_abc_headers(abc_text)
    body = _SKIP_RE.sub(" ", body)
    # Drop barlines and rhythm digits / length markers for pitch-only contour.
    body = re.sub(r"[|/\\]", " ", body)
    pitches: list[int] = []
    for match in _NOTE_RE.finditer(body):
        midi = _midi_from_token(match.group(0))
        if midi is None:
            continue
        pitches.append(midi)
        if len(pitches) >= max_notes:
            break
    return pitches


def pitches_to_interval_string(pitches: list[int], max_intervals: int = 48) -> str:
    """Encode successive intervals as signed digits (-9..9) for compact matching."""
    if len(pitches) < 2:
        return ""
    chars: list[str] = []
    for prev, cur in zip(pitches, pitches[1:]):
        delta = max(-9, min(9, cur - prev))
        # Map -9..9 onto a single printable char.
        chars.append(chr(ord("a") + delta + 9))
        if len(chars) >= max_intervals:
            break
    return "".join(chars)


def pitches_to_parsons_code(pitches: list[int], max_steps: int = 48) -> str:
    """Classic Parsons contour: * then U/D/R for up/down/repeat."""
    if not pitches:
        return ""
    out = ["*"]
    for prev, cur in zip(pitches, pitches[1:]):
        if cur > prev:
            out.append("U")
        elif cur < prev:
            out.append("D")
        else:
            out.append("R")
        if len(out) > max_steps:
            break
    return "".join(out)


def abc_to_contour(abc_text: str, max_notes: int = 64) -> dict:
    pitches = extract_pitch_midi_sequence(abc_text, max_notes=max_notes)
    return {
        "pitches": pitches,
        "intervals": pitches_to_interval_string(pitches),
        "parsons": pitches_to_parsons_code(pitches),
    }


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            cur.append(min(ins, delete, sub))
        prev = cur
    return prev[-1]


def contour_similarity(query: dict | str, candidate: dict | str) -> float:
    """
    Score 0..100 comparing interval strings (preferred) with Parsons fallback.
    Accepts contour dicts or raw interval/parsons strings.
    """
    if isinstance(query, str):
        q_int, q_par = query, ""
    else:
        q_int = str((query or {}).get("intervals") or "")
        q_par = str((query or {}).get("parsons") or "")
    if isinstance(candidate, str):
        c_int, c_par = candidate, ""
    else:
        c_int = str((candidate or {}).get("intervals") or "")
        c_par = str((candidate or {}).get("parsons") or "")

    if q_int and c_int:
        # Compare shared prefix window (incipit).
        window = min(24, len(q_int), len(c_int))
        if window < 4:
            return 0.0
        qa = q_int[:window]
        # Slide candidate window a little for pickup notes.
        best = 0.0
        for offset in range(0, min(6, max(1, len(c_int) - window + 1))):
            ca = c_int[offset : offset + window]
            dist = _levenshtein(qa, ca)
            score = 100.0 * (1.0 - (dist / max(len(qa), 1)))
            if score > best:
                best = score
        return best

    if q_par and c_par:
        window = min(24, len(q_par), len(c_par))
        if window < 5:
            return 0.0
        qa = q_par[:window]
        ca = c_par[:window]
        dist = _levenshtein(qa, ca)
        return 100.0 * (1.0 - (dist / max(len(qa), 1)))

    return 0.0


def normalize_title_for_contour_index(title: str) -> str:
    text = _fold(title).lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()
