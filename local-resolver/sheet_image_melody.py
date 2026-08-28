"""Extract a single melody voice from OMR MusicXML and convert to ABC."""

from __future__ import annotations

import re
from typing import Any

MELODY_PART_NAMES = re.compile(r"(melody|voice|lead|solo|soprano|treble|part\s*1)", re.I)
BARS_PER_LINE = 4


def _part_average_pitch(part) -> float | None:
    pitches = []
    for element in part.recurse().notes:
        if hasattr(element, "pitch") and element.pitch is not None:
            pitches.append(float(element.pitch.midi))
        elif hasattr(element, "pitches"):
            for pitch in element.pitches:
                if pitch is not None:
                    pitches.append(float(pitch.midi))
    if not pitches:
        return None
    return sum(pitches) / len(pitches)


def _part_note_count(part) -> int:
    return sum(1 for _ in part.recurse().notes)


def _part_name(part) -> str:
    return str(getattr(part, "partName", None) or getattr(part, "id", None) or "")


def _choose_melody_part(score):
    parts = list(score.parts)
    if not parts:
        raise ValueError("MusicXML contains no parts")

    named = [part for part in parts if MELODY_PART_NAMES.search(_part_name(part))]
    if len(named) == 1:
        return named[0]
    if len(named) > 1:
        named.sort(key=lambda part: _part_average_pitch(part) or 0.0, reverse=True)
        return named[0]

    scored = []
    for index, part in enumerate(parts):
        avg_pitch = _part_average_pitch(part)
        note_count = _part_note_count(part)
        if note_count == 0:
            continue
        scored.append(
            (
                index,
                avg_pitch or 0.0,
                note_count,
                part,
            )
        )
    if not scored:
        return parts[0]
    scored.sort(key=lambda item: (-item[1], item[0]))
    return scored[0][3]


def _simplify_polyphony(part):
    from music21 import chord, note, stream

    measures = list(part.getElementsByClass(stream.Measure))
    if not measures:
        simplified = stream.Part()
        for element in part.flatten().notesAndRests:
            if isinstance(element, note.Note):
                simplified.append(element)
            elif isinstance(element, chord.Chord):
                highest = max(element.pitches, key=lambda pitch: pitch.midi)
                simplified.append(note.Note(highest, quarterLength=element.quarterLength))
            elif hasattr(element, "isRest") and element.isRest:
                simplified.append(element)
        return simplified

    simplified = stream.Part()
    for measure in measures:
        new_measure = stream.Measure(number=measure.number)
        for element in measure:
            if isinstance(element, (note.Note, chord.Chord)) or (
                hasattr(element, "isRest") and element.isRest
            ):
                continue
            new_measure.insert(0, element)
        for element in measure.notesAndRests:
            if isinstance(element, note.Note):
                new_measure.append(element)
            elif isinstance(element, chord.Chord):
                highest = max(element.pitches, key=lambda pitch: pitch.midi)
                new_measure.append(note.Note(highest, quarterLength=element.quarterLength))
            elif hasattr(element, "isRest") and element.isRest:
                new_measure.append(element)
        simplified.append(new_measure)
    return simplified


def _score_metadata(score) -> dict[str, str]:
    key_text = ""
    meter_text = ""
    try:
        key = score.analyze("key")
        if key:
            key_text = key.tonic.name.replace("-", "b")
            if key.mode == "minor":
                key_text += "m"
    except Exception:
        key_text = ""
    try:
        ts = score.flat.getTimeSignatures()[0]
        if ts:
            meter_text = f"{ts.numerator}/{ts.denominator}"
    except Exception:
        meter_text = ""
    return {"key": key_text, "meter": meter_text}


def _measure_quarter_lengths(part) -> list[float]:
    """Sum of note/rest quarterLengths per measure (chord tones counted once)."""
    out: list[float] = []
    for measure in getattr(part, "getElementsByClass", lambda *_: [])("Measure"):
        total = 0.0
        for element in measure.notesAndRests:
            ql = float(getattr(element, "quarterLength", 0.0) or 0.0)
            if ql <= 0:
                continue
            total += ql
        if total > 0.05:
            out.append(total)
    return out


def _infer_meter_from_bar_lengths(bar_quarters: list[float]) -> str | None:
    """Guess M: from median bar length in quarter notes (L:1/4 units).

    Examples: 3/8 → 1.5 quarters (three eighths); 6/8 → 3.0; 2/4 → 2.0.
    """
    if len(bar_quarters) < 2:
        return None
    ordered = sorted(bar_quarters)
    mid = ordered[len(ordered) // 2]
    # (target_quarters, meter)
    candidates = (
        (0.75, "3/8"),  # rare: three 16ths under wrong scaling
        (1.0, "2/4"),
        (1.5, "3/8"),   # three eighths
        (2.0, "2/4"),
        (3.0, "6/8"),   # six eighths (also 3/4)
        (4.0, "4/4"),
    )
    best = None
    best_dist = 1e9
    for target, meter in candidates:
        dist = abs(mid - target)
        if dist < best_dist:
            best_dist = dist
            best = meter
    if best_dist > 0.35:
        return None
    # 3.0 quarters: prefer 6/8 for folk jigs over 3/4 when bars look even.
    if abs(mid - 3.0) <= 0.25:
        best = "6/8"
    if abs(mid - 1.5) <= 0.2:
        best = "3/8"
    return best


def _duration_suffix(quarter_length: float) -> str:
    """ABC duration relative to L:1/4 (unit = one quarter note)."""
    ql = float(quarter_length or 0.0)
    # Snap near-miss floating durations from MusicXML/homr before emitting decimals.
    snap_points = (
        4.0, 3.0, 2.0, 1.5, 1.0, 0.75, 0.5, 0.375, 0.25, 0.125, 0.0625,
    )
    for point in snap_points:
        if abs(ql - point) <= max(0.02, point * 0.08):
            ql = point
            break
    mapping = {
        4.0: "4",
        3.0: "3",
        2.0: "2",
        1.5: "3/2",
        1.0: "",
        0.75: "3/4",
        0.5: "/2",
        0.375: "3/8",
        0.25: "/4",
        0.125: "/8",
        0.0625: "/16",
    }
    if ql in mapping:
        return mapping[ql]
    # Prefer exact simple fractions over raw decimals (e.g. 0.333 -> avoid "0.333").
    for denom in (2, 3, 4, 6, 8, 12, 16):
        numer = round(ql * denom)
        if numer > 0 and abs(ql - (numer / denom)) < 0.02:
            if numer == denom:
                return ""
            if numer == 1:
                return f"/{denom}"
            return f"{numer}/{denom}"
    return str(round(ql, 3)).rstrip("0").rstrip(".")


def _pitch_to_abc(note_element) -> str:
    pitch = note_element.pitch
    accidental = ""
    if pitch.accidental is not None:
        alter = pitch.accidental.alter
        if alter == 1:
            accidental = "^"
        elif alter == -1:
            accidental = "_"
        elif alter == 2:
            accidental = "^^"
        elif alter == -2:
            accidental = "__"
    step = pitch.step
    octave = int(pitch.octave)
    if octave >= 5:
        body = step.lower()
        if octave > 5:
            body += "'" * (octave - 5)
    else:
        body = step.upper()
        if octave < 4:
            body += "," * (4 - octave)
    return accidental + body


def _element_to_abc_token(element) -> str | None:
    from music21 import chord, note

    duration = _duration_suffix(float(getattr(element, "quarterLength", 1.0) or 1.0))
    if isinstance(element, note.Note):
        return _pitch_to_abc(element) + duration
    if isinstance(element, chord.Chord):
        highest = max(element.pitches, key=lambda pitch: pitch.midi)
        return _pitch_to_abc(note.Note(highest)) + duration
    if hasattr(element, "isRest") and element.isRest:
        return "z" + duration
    return None


def _measure_needs_system_break(measure) -> bool:
    from music21 import layout

    for print_obj in measure.getElementsByClass("Print"):
        if getattr(print_obj, "newSystem", False) or getattr(print_obj, "newPage", False):
            return True
    for layout_obj in measure.getElementsByClass(layout.SystemLayout):
        if getattr(layout_obj, "isNew", False):
            return True
    for layout_obj in measure.getElementsByClass(layout.PageLayout):
        if getattr(layout_obj, "isNew", False):
            return True
    return False


def _measure_to_abc_text(measure) -> str:
    tokens = []
    for element in measure.notesAndRests:
        token = _element_to_abc_token(element)
        if token:
            tokens.append(token)
    return " ".join(tokens) if tokens else "z"


def _join_measure_line(measures: list[str], *, final_line: bool) -> str:
    if not measures:
        return ""
    parts: list[str] = []
    for index, measure_text in enumerate(measures):
        parts.append(measure_text)
        if final_line and index == len(measures) - 1:
            parts.append("|]")
        else:
            parts.append("|")
    return " ".join(parts)


def _part_to_abc_body(part) -> str:
    from music21 import stream

    measures = list(part.getElementsByClass(stream.Measure))
    if not measures:
        tokens: list[str] = []
        for element in part.flatten().notesAndRests:
            token = _element_to_abc_token(element)
            if token:
                tokens.append(token)
        if not tokens:
            return ""
        return " ".join(tokens) + " |]"

    lines: list[str] = []
    current_line: list[str] = []
    for measure in measures:
        if _measure_needs_system_break(measure) and current_line:
            lines.append(_join_measure_line(current_line, final_line=False))
            current_line = []

        current_line.append(_measure_to_abc_text(measure))
        if len(current_line) >= BARS_PER_LINE:
            lines.append(_join_measure_line(current_line, final_line=False))
            current_line = []

    if current_line:
        lines.append(_join_measure_line(current_line, final_line=True))

    return "\n".join(lines)


def extract_main_melody_from_musicxml(musicxml_text: str) -> dict[str, Any]:
    from music21 import converter

    score = converter.parseData(musicxml_text.encode("utf-8"), format="musicxml")
    melody_part = _choose_melody_part(score)
    simplified = _simplify_polyphony(melody_part)
    warnings: list[str] = []
    if _part_note_count(melody_part) != _part_note_count(simplified):
        warnings.append("polyphony_simplified")

    metadata = _score_metadata(score)
    abc_body = _part_to_abc_body(simplified)
    if not abc_body.strip():
        raise ValueError("Melody extraction produced no notes")

    # Token durations use L:1/4 semantics ("" = quarter). Emit matching header
    # so consumers do not misread eighths as sixteenths.
    meter = metadata.get("meter") or ""
    bar_ql = _measure_quarter_lengths(simplified)
    inferred = _infer_meter_from_bar_lengths(bar_ql)
    # HOMR often omits time signatures or stamps 4/4; prefer bar-length guess.
    if inferred and (not meter or meter == "4/4"):
        if meter == "4/4" and inferred != "4/4":
            warnings.append(f"meter_inferred:{inferred}_was_{meter}")
        meter = inferred
    if not meter:
        meter = inferred or "2/4"
    key = metadata.get("key") or "C"
    abc_with_headers = f"M:{meter}\nL:1/4\nK:{key}\n{abc_body}"

    return {
        "abc": abc_with_headers,
        "musicXml": musicxml_text,
        "key": key,
        "meter": meter,
        "warnings": warnings,
        "partName": _part_name(melody_part),
        "confidence": 0.75 if warnings else 0.85,
    }


def _extract_note_body(abc_text: str) -> str:
    lines = [line.rstrip() for line in str(abc_text or "").splitlines()]
    body: list[str] = []
    in_body = False
    for line in lines:
        if line.startswith("K:"):
            in_body = True
            continue
        if not in_body:
            continue
        if line.startswith("w:"):
            break
        if line.startswith("V:") or line.startswith("%%"):
            continue
        body.append(line)
    return "\n".join(body).strip()
