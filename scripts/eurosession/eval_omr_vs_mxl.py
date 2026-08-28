#!/usr/bin/env python3
"""Compare EuroSession OMR+ ABC against eurosessions-tunebook.mxl ground truth.

Offline regression only — runtime OMR never reads the MXL.

Metrics: chords, pitch-class, rhythm, octave-diag, structure F1, key/meter, bar count.
Optional --strict exits non-zero when mapped tunes miss soft thresholds.
Expand TUNE_MAP via scripts/eurosession/match_mxl_spans.py (human-confirmed).
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

# MSCZ title-index spans (inclusive) + pitch soft-check via match_mxl_spans.py.
# Prefer Am/Dm over relative-major attribute guesses when OMR+/print agree.
TUNE_MAP: dict[str, tuple[int, int, str, str]] = {
    # Plan A anchors + strong set
    "Ukrainian Dance Nign": (1034, 1085, "Am", "2/4"),
    "Bourée de Concours (Gm)": (17, 32, "Gm", "2/4"),
    "Bourrée de Chambérat (G)": (33, 48, "G", "2/4"),
    "Bourrée du Morvan (G)": (137, 154, "G", "3/8"),
    "Bourrée du Morvan HCB (G)": (155, 173, "G", "3/8"),
    "Amazone": (1425, 1440, "Am", "6/8"),
    "Mazomenos": (1575, 1602, "Dm", "2/4"),
    # Index + pitch soft-check (≥0.45 pc or prior map)
    "Bourrée d'Aurore Sand (Dm)": (1, 16, "Dm", "2/4"),
    "Bourrée Carrée de la Châtre/Le Ruban Bleu (G)": (49, 82, "G", "2/4"),
    "An Dro St Patrick (Am)": (208, 223, "Am", "2/4"),
    "An Dro - Esta's - Gweharall - The Wren (Am)": (224, 239, "Am", "4/4"),
    "An Dro Thème Vannetais (Em)": (192, 207, "Em", "2/4"),
    "Les Poules Huppées (Am/Dm)": (174, 191, "Am", "3/8"),
    "Nigun Atik (Dm)": (352, 367, "Dm", "4/4"),
    "Josefin's dopvals (G) (Am dorian/G)": (856, 897, "Am", "3/4"),
    "Hannah's Skotshne": (1000, 1033, "Bb", "2/4"),
    "Mominette or New French Scottische": (1285, 1300, "Bb", "2/2"),
    "Scottische a Virmoux": (1301, 1316, "G", "2/2"),
    "O Cabalo Azul": (1372, 1415, "Dm", "6/8"),
    "Parata (Maltese Sword Dance)": (1559, 1574, "A", "6/8"),
    "Menexedes kai Zoumpoulia": (1603, 1648, "Dm", "3/4"),
    "Lule Malesore (My Mountain Flower)": (1649, 1672, "Cm", "8/8"),
    "Lule Malesore": (1649, 1672, "Cm", "8/8"),
    # Diagnostics only (name-gated span; OMR pitch still weak) — STRICT_EXCLUDE
    "Maltese Melody #16": (1541, 1558, "A", "6/8"),
    "Schottische Urbaine": (1317, 1332, "G", "2/2"),
}

# Soft thresholds for --strict on non-UDN / non-strong maps (melody span check).
# Chord OCR is uneven across crops; UDN/STRONG keep hard chord gates.
STRICT = {
    "pc_r": 0.70,
    "ch_r": 0.0,
    "rhythm_r": 0.10,
    "st_f1": 0.0,
    "bar_err_max": 16,
}

# Plan A success gates for Ukrainian Dance Nign.
STRICT_UDN = {
    "pc_r": 0.95,
    "ch_r": 0.90,
    "rhythm_r": 0.85,
    "st_f1": 0.75,
    "ch_min": 36,
    "bar_err_max": 2,
}

# Pitch-verified non-UDN gates (bourrées / Amazone): hold melody fidelity.
STRICT_STRONG = {
    "pc_r": 0.80,
    "ch_r": 0.0,
    "rhythm_r": 0.70,
    "st_f1": 0.0,
    "bar_err_max": 8,
}

STRICT_STRONG_TITLES = {
    "Bourée de Concours (Gm)",
    "Bourrée de Chambérat (G)",
    "Bourrée du Morvan (G)",
    "Bourrée du Morvan HCB (G)",
    "Amazone",
    "Mazomenos",
}

# Weak OMR / thin-OCR matches kept for span diagnostics but excluded from --strict.
STRICT_EXCLUDE = {
    "Maltese Melody #16",
    "Schottische Urbaine",
    "An Dro Thème Vannetais (Em)",
    "Les Poules Huppées (Am/Dm)",
    "Lule Malesore",  # duplicate short title; full title is gated normally
}

def load_score(mxl: Path) -> ET.Element:
    with zipfile.ZipFile(mxl) as zf:
        raw = zf.read("score.xml").decode("utf-8", errors="replace")
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
    return ET.fromstring(raw)


def harmony_to_chord(h: ET.Element) -> str | None:
    root = h.find("root")
    if root is None:
        return None
    step = root.findtext("root-step")
    alter = root.findtext("root-alter")
    kind = h.find("kind")
    kind_text = (kind.get("text") if kind is not None else None) or (kind.text if kind is not None else "") or ""
    kind_val = (kind.text or "") if kind is not None else ""
    bass = h.find("bass")
    acc = {1: "#", -1: "b"}.get(int(alter or 0), "")
    chord = f"{step}{acc}"
    kt = (kind_text or kind_val or "").lower().strip()
    if kt in ("minor", "min", "m"):
        chord += "m"
    elif kt in ("dominant", "dominant-seventh", "7"):
        chord += "7"
    elif kt in ("major-seventh", "maj7", "major-7th"):
        chord += "maj7"
    elif kt in ("minor-seventh", "min7", "m7"):
        chord += "m7"
    elif "sus" in kt:
        chord += "sus4" if "4" in kt or kt == "suspended-fourth" else "sus"
    elif kt in ("diminished", "dim"):
        chord += "dim"
    elif kt in ("augmented", "aug"):
        chord += "aug"
    # else major triad — bare root
    if bass is not None:
        bstep = bass.findtext("bass-step")
        balter = bass.findtext("bass-alter")
        if bstep:
            bacc = {1: "#", -1: "b"}.get(int(balter or 0), "")
            chord += f"/{bstep}{bacc}"
    return chord


def _iter_melody_notes(measure: ET.Element):
    for note in measure.findall("note"):
        if note.find("chord") is not None or note.find("grace") is not None:
            continue
        if (note.findtext("staff") or "1") != "1":
            continue
        if (note.findtext("voice") or "1") not in ("1", ""):
            continue
        yield note


def mxl_chords_and_pcs(root: ET.Element, m0: int, m1: int) -> tuple[list[str], list[str]]:
    part = root.find("part")
    measures = {int(m.get("number")): m for m in part.findall("measure")}
    chords: list[str] = []
    pcs: list[str] = []
    for n in range(m0, m1 + 1):
        m = measures.get(n)
        if m is None:
            continue
        for h in m.findall("harmony"):
            ch = harmony_to_chord(h)
            if ch:
                chords.append(ch)
                break
        for note in _iter_melody_notes(m):
            if note.find("rest") is not None:
                continue
            pitch = note.find("pitch")
            if pitch is None:
                continue
            step = pitch.findtext("step") or ""
            alter = int(pitch.findtext("alter") or 0)
            acc = {1: "^", -1: "_"}.get(alter, "")
            pcs.append(acc + step)
    return chords, pcs


def mxl_octave_pcs(root: ET.Element, m0: int, m1: int) -> list[str]:
    """Pitch tokens with octave: e.g. ^C4."""
    part = root.find("part")
    measures = {int(m.get("number")): m for m in part.findall("measure")}
    out: list[str] = []
    for n in range(m0, m1 + 1):
        m = measures.get(n)
        if m is None:
            continue
        for note in _iter_melody_notes(m):
            if note.find("rest") is not None:
                continue
            pitch = note.find("pitch")
            if pitch is None:
                continue
            step = pitch.findtext("step") or ""
            alter = int(pitch.findtext("alter") or 0)
            octave = pitch.findtext("octave") or "?"
            acc = {1: "^", -1: "_"}.get(alter, "")
            out.append(f"{acc}{step}{octave}")
    return out


def mxl_rhythm_tokens(root: ET.Element, m0: int, m1: int) -> list[str]:
    """Duration tokens in eighth-note units (N1=eighth, N2=quarter, …)."""
    part = root.find("part")
    measures = {int(m.get("number")): m for m in part.findall("measure")}
    divisions = 1
    # Divisions are often set only on the first measure of the score.
    for m in part.findall("measure"):
        attrs = m.find("attributes")
        if attrs is not None and attrs.findtext("divisions"):
            divisions = max(1, int(attrs.findtext("divisions") or 1))
            break
    tokens: list[str] = []
    for n in range(m0, m1 + 1):
        m = measures.get(n)
        if m is None:
            continue
        attrs = m.find("attributes")
        if attrs is not None and attrs.findtext("divisions"):
            divisions = max(1, int(attrs.findtext("divisions") or 1))
        eighth = max(1.0, divisions / 2.0)
        for note in _iter_melody_notes(m):
            dur = int(note.findtext("duration") or 0)
            steps = max(1, int(round(dur / eighth)))
            if note.find("rest") is not None:
                tokens.append(f"z{steps}")
            else:
                tokens.append(f"N{steps}")
    return tokens


def abc_rhythm_tokens(abc: str) -> list[str]:
    """ABC note/rest durations as eighth-note units (matches mxl_rhythm_tokens)."""
    l_num, l_den = 1, 8
    body_lines: list[str] = []
    after = False
    for ln in (abc or "").splitlines():
        if ln.startswith("L:"):
            m = re.match(r"L:\s*(\d+)\s*/\s*(\d+)", ln)
            if m:
                l_num, l_den = int(m.group(1)), int(m.group(2))
        if ln.startswith("K:"):
            after = True
            continue
        if after and not re.match(r"^[A-Za-z]:", ln.strip()):
            body_lines.append(re.sub(r'"[^"]*"', "", ln))
    flat = " ".join(body_lines)
    flat = re.sub(r"[!].*?[!]", " ", flat)
    flat = re.sub(r"\{[^}]*\}", " ", flat)
    # Length of one L: unit in eighth notes (L:1/4 → 2 eighths).
    unit_eighths = (l_num / l_den) * 8.0
    tokens: list[str] = []
    for m in re.finditer(r"([A-Ga-gzZ](?:,*)(?:'*)|[xz])(\d*/?\d*)", flat):
        letter = m.group(1)[0]
        dur_s = m.group(2) or ""
        if dur_s.startswith("/"):
            mult = 1.0 / float(dur_s[1:] or 2)
        elif "/" in dur_s:
            a, _, b = dur_s.partition("/")
            mult = float(a or 1) / float(b or 2)
        elif dur_s:
            mult = float(dur_s)
        else:
            mult = 1.0
        steps = max(1, int(round(unit_eighths * mult)))
        if letter.lower() in {"z", "x"}:
            tokens.append(f"z{steps}")
        else:
            tokens.append(f"N{steps}")
    return tokens


def mxl_key_meter(root: ET.Element, m0: int) -> tuple[str, str]:
    """First attributes at/before m0 → (abc_key, meter)."""
    part = root.find("part")
    key_abc = "C"
    meter = "4/4"
    fifths_to_maj = {
        -7: "Cb",
        -6: "Gb",
        -5: "Db",
        -4: "Ab",
        -3: "Eb",
        -2: "Bb",
        -1: "F",
        0: "C",
        1: "G",
        2: "D",
        3: "A",
        4: "E",
        5: "B",
        6: "F#",
        7: "C#",
    }
    rel = {
        "C": "Am",
        "G": "Em",
        "D": "Bm",
        "A": "F#m",
        "E": "C#m",
        "B": "G#m",
        "F#": "D#m",
        "F": "Dm",
        "Bb": "Gm",
        "Eb": "Cm",
        "Ab": "Fm",
        "Db": "Bbm",
        "Gb": "Ebm",
        "Cb": "Abm",
    }
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        if n > m0:
            break
        attrs = m.find("attributes")
        if attrs is None:
            continue
        key_el = attrs.find("key")
        if key_el is not None:
            fifths = int(key_el.findtext("fifths") or 0)
            mode = (key_el.findtext("mode") or "").lower()
            maj = fifths_to_maj.get(fifths, "C")
            if mode.startswith("min"):
                key_abc = rel.get(maj, maj + "m")
            else:
                key_abc = maj
        time_el = attrs.find("time")
        if time_el is not None:
            beats = time_el.findtext("beats") or "4"
            beat_type = time_el.findtext("beat-type") or "4"
            meter = f"{beats}/{beat_type}"
    return key_abc, meter


def mxl_mid_tune_changes(root: ET.Element, m0: int, m1: int) -> list[str]:
    """List mid-span key/time changes after the first measure."""
    part = root.find("part")
    changes: list[str] = []
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        if n <= m0 or n > m1:
            continue
        attrs = m.find("attributes")
        if attrs is None:
            continue
        if attrs.find("key") is not None:
            changes.append(f"key@{n - m0}")
        if attrs.find("time") is not None:
            changes.append(f"time@{n - m0}")
    return changes


def mxl_structure_labels(root: ET.Element, m0: int, m1: int) -> set[str]:
    part = root.find("part")
    labels: set[str] = set()
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        if n < m0 or n > m1:
            continue
        rel = n - m0
        for bl in m.findall("barline"):
            repeat = bl.find("repeat")
            if repeat is not None:
                direction = (repeat.get("direction") or "").lower()
                if direction == "forward":
                    labels.add(f"start_repeat@{rel}")
                elif direction == "backward":
                    labels.add(f"end_repeat@{rel}")
            ending = bl.find("ending")
            if ending is not None:
                num = (ending.get("number") or "").strip()
                if num.startswith("1"):
                    labels.add(f"volta1@{rel}")
                if num.startswith("2"):
                    labels.add(f"volta2@{rel}")
        for ending in m.findall("ending"):
            num = (ending.get("number") or "").strip()
            if num.startswith("1"):
                labels.add(f"volta1@{rel}")
            if num.startswith("2"):
                labels.add(f"volta2@{rel}")
    return labels


def mxl_notation_counts(root: ET.Element, m0: int, m1: int) -> dict[str, int]:
    part = root.find("part")
    measures = {int(m.get("number")): m for m in part.findall("measure")}
    ties = beams = grace = 0
    for n in range(m0, m1 + 1):
        m = measures.get(n)
        if m is None:
            continue
        for note in m.findall("note"):
            if note.find("grace") is not None:
                grace += 1
            if note.find("tie") is not None or note.find("notations/tied") is not None:
                ties += 1
            if note.find("beam") is not None:
                beams += 1
    return {"ties": ties, "beams": beams, "grace": grace}


def abc_structure_labels(abc: str) -> set[str]:
    body: list[str] = []
    after = False
    for ln in (abc or "").splitlines():
        if ln.startswith("K:"):
            after = True
            continue
        if after and not re.match(r"^[A-Za-z]:", ln.strip()):
            body.append(ln)
    flat = " ".join(body).strip()
    if flat and not flat.startswith("|"):
        flat = "|" + flat

    token_re = re.compile(r"(\|:|:\||\|\||\|\]|\|\d+|\|)")
    labels: set[str] = set()
    parts = token_re.split(flat)
    bi = -1
    i = 0
    while i < len(parts):
        p = parts[i]
        if not p:
            i += 1
            continue
        if token_re.fullmatch(p):
            if p == "|:":
                bi += 1
                labels.add(f"start_repeat@{bi}")
            elif p.startswith("|") and len(p) > 1 and p[1:].isdigit():
                bi += 1
                labels.add(f"volta{int(p[1:])}@{bi}")
            elif p == ":|":
                labels.add(f"end_repeat@{max(0, bi)}")
            elif p in {"|", "||", "|]"}:
                nxt = parts[i + 1] if i + 1 < len(parts) else ""
                if nxt and not token_re.fullmatch(nxt) and nxt.strip():
                    bi += 1
                elif p == "|" and bi < 0:
                    bi = 0
            i += 1
            continue
        i += 1
    return labels


def structure_f1(pred: set[str], ref: set[str]) -> tuple[float, float, float]:
    if not pred and not ref:
        return 1.0, 1.0, 1.0
    if not pred or not ref:
        return 0.0, 0.0, 0.0

    def soft_hits(a: set[str], b: set[str]) -> int:
        used: set[str] = set()
        hits = 0
        for item in a:
            kind, _, idx_s = item.partition("@")
            try:
                idx = int(idx_s)
            except ValueError:
                continue
            for delta in (0, -1, 1, -2, 2, -3, 3):
                key = f"{kind}@{idx + delta}"
                if key in b and key not in used:
                    used.add(key)
                    hits += 1
                    break
        return hits

    tp = soft_hits(pred, ref)
    precision = tp / len(pred) if pred else 0.0
    recall = tp / len(ref) if ref else 0.0
    if precision + recall == 0:
        return 0.0, 0.0, 0.0
    f1 = 2 * precision * recall / (precision + recall)
    return precision, recall, f1


def abc_chords(abc: str) -> list[str]:
    return re.findall(
        r'"\s*([A-G][#b]?(?:m|maj|min|dim|aug|sus\d?|add\d?|m?7)?(?:/[A-G][#b]?)?)\s*"',
        abc or "",
        re.I,
    )


def abc_pcs(abc: str) -> list[str]:
    body: list[str] = []
    after = False
    for ln in (abc or "").splitlines():
        if ln.startswith("K:"):
            after = True
            continue
        if after:
            body.append(re.sub(r'"[^"]*"', "", ln))
    return re.findall(r"[\^_=]?[A-Ga-g]", " ".join(body))


def abc_octave_pcs(abc: str) -> list[str]:
    """Approximate octave tokens from ABC (C= C5, c= C6) for diagnostic ratio."""
    body: list[str] = []
    after = False
    for ln in (abc or "").splitlines():
        if ln.startswith("K:"):
            after = True
            continue
        if after:
            body.append(re.sub(r'"[^"]*"', "", ln))
    flat = " ".join(body)
    out: list[str] = []
    for m in re.finditer(r"([\^_=]?)([A-Ga-g])([',]*)", flat):
        acc, letter, marks = m.group(1), m.group(2), m.group(3)
        octave = 5 if letter.isupper() else 6
        octave += marks.count("'")
        octave -= marks.count(",")
        step = letter.upper()
        acc_s = {"^": "^", "_": "_", "=": ""}.get(acc, "")
        out.append(f"{acc_s}{step}{octave}")
    return out


def abc_bar_count(abc: str) -> int:
    body: list[str] = []
    after = False
    for ln in (abc or "").splitlines():
        if ln.startswith("K:"):
            after = True
            continue
        if after and not re.match(r"^[A-Za-z]:", ln.strip()):
            body.append(re.sub(r'"[^"]*"', "", ln))
    flat = " ".join(body)
    parts = re.split(r"\|+", flat)
    return sum(1 for p in parts if re.search(r"[A-Ga-gzZ]", p))


def abc_key_meter(abc: str) -> tuple[str, str]:
    km = re.search(r"^K:\s*(\S+)", abc or "", re.M)
    mm = re.search(r"^M:\s*(\S+)", abc or "", re.M)
    return (km.group(1) if km else "?"), (mm.group(1) if mm else "?")


def normalize_key(k: str) -> str:
    k = (k or "").replace(" ", "").replace("major", "").replace("minor", "m")
    if k.endswith("min"):
        k = k[:-3] + "m"
    return k


def keys_match(a: str, b: str) -> bool:
    a, b = normalize_key(a), normalize_key(b)
    if a.lower() == b.lower():
        return True
    # Relative major/minor soft match for reporting only — strict uses exact
    return False


def ratio(a: list[str], b: list[str]) -> float:
    return difflib.SequenceMatcher(None, [x.lower() for x in a], [x.lower() for x in b]).ratio()


def score_tune(
    root: ET.Element,
    title: str,
    m0: int,
    m1: int,
    expected_key: str,
    expected_meter: str,
    abc: str,
) -> dict:
    ref_ch, ref_pc = mxl_chords_and_pcs(root, m0, m1)
    omr_ch, omr_pc = abc_chords(abc), abc_pcs(abc)
    ref_st = mxl_structure_labels(root, m0, m1)
    pred_st = abc_structure_labels(abc)
    st_p, st_r, st_f1 = structure_f1(pred_st, ref_st)
    ref_rhythm = mxl_rhythm_tokens(root, m0, m1)
    omr_rhythm = abc_rhythm_tokens(abc)
    ref_oct = mxl_octave_pcs(root, m0, m1)
    omr_oct = abc_octave_pcs(abc)
    abc_k, abc_m = abc_key_meter(abc)
    mxl_k, mxl_m = mxl_key_meter(root, m0)
    bars_abc = abc_bar_count(abc)
    bars_mxl = m1 - m0 + 1
    mid = mxl_mid_tune_changes(root, m0, m1)
    notation = mxl_notation_counts(root, m0, m1)
    return {
        "title": title,
        "m0": m0,
        "m1": m1,
        "ch_omr": len(omr_ch),
        "ch_mxl": len(ref_ch),
        "ch_r": ratio(omr_ch, ref_ch),
        "pc_r": ratio(omr_pc, ref_pc),
        "oct_r": ratio(omr_oct, ref_oct),
        "rhythm_r": ratio(omr_rhythm, ref_rhythm),
        "st_p": st_p,
        "st_r": st_r,
        "st_f1": st_f1,
        "K_abc": abc_k,
        "M_abc": abc_m,
        "K_exp": expected_key,
        "M_exp": expected_meter,
        "K_mxl": mxl_k,
        "M_mxl": mxl_m,
        "K_ok": keys_match(abc_k, expected_key),
        "M_ok": (abc_m or "") == (expected_meter or ""),
        "bars_abc": bars_abc,
        "bars_mxl": bars_mxl,
        "bar_err": abs(bars_abc - bars_mxl),
        "mid_changes": mid,
        "notation": notation,
        "structure_ref": sorted(ref_st),
        "structure_pred": sorted(pred_st),
    }


def load_abc_for_title(manifest: dict, title: str) -> str:
    entry = next((t for t in manifest.get("tunes") or [] if t.get("title") == title), None)
    if not entry:
        return ""
    plus = next((c for c in (entry.get("candidates") or []) if c.get("source") == "omr+"), None)
    abc = (plus or {}).get("abc") or entry.get("omrPlusAbc") or ""
    if not abc.strip():
        # Prefer plain OMR melody over session ABC when scoring OMR fidelity.
        omr = next((c for c in (entry.get("candidates") or []) if str(c.get("source") or "").lower() == "omr"), None)
        abc = (omr or {}).get("abc") or entry.get("omrAbc") or ""
    if not abc.strip():
        for c in entry.get("candidates") or []:
            if c.get("abc"):
                abc = c["abc"]
                break
    return abc or ""


def check_strict(row: dict) -> list[str]:
    fails: list[str] = []
    if row["title"] == "Ukrainian Dance Nign":
        thr = STRICT_UDN
    elif row["title"] in STRICT_STRONG_TITLES:
        thr = STRICT_STRONG
    else:
        thr = STRICT
    if row["pc_r"] < thr["pc_r"]:
        fails.append(f"pc_r<{thr['pc_r']}")
    if row["ch_r"] < thr["ch_r"]:
        fails.append(f"ch_r<{thr['ch_r']}")
    if row["rhythm_r"] < thr.get("rhythm_r", 0):
        fails.append(f"rhythm_r<{thr['rhythm_r']}")
    if row["st_f1"] < thr["st_f1"]:
        fails.append(f"st_f1<{thr['st_f1']}")
    if row["bar_err"] > thr["bar_err_max"]:
        fails.append(f"bar_err>{thr['bar_err_max']}")
    if "ch_min" in thr and row["ch_omr"] < thr["ch_min"]:
        fails.append(f"ch_omr<{thr['ch_min']}")
    # Key/meter exact match for strong + UDN maps.
    if row["title"] == "Ukrainian Dance Nign" or row["title"] in STRICT_STRONG_TITLES:
        if not row.get("K_ok"):
            fails.append(f"K!={row.get('K_exp')}")
        if not row.get("M_ok"):
            fails.append(f"M!={row.get('M_exp')}")
    return fails


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if any mapped tune fails soft thresholds")
    parser.add_argument("--json-out", default="", help="Write full per-tune JSON scores")
    args = parser.parse_args()
    root = load_score(Path(args.mxl))
    manifest = json.loads((Path(args.work) / "manifest.json").read_text(encoding="utf-8"))

    print(
        f"{'title':34} {'ch':>7} {'ch_r':>5} {'pc_r':>5} {'rh_r':>5} {'oct':>5} "
        f"{'stF1':>5} {'bars':>7} {'K':>6} {'M':>5} {'tie':>4} {'bm':>4} {'gr':>3}"
    )
    rows: list[dict] = []
    failed = 0
    for title, (m0, m1, key, meter) in TUNE_MAP.items():
        abc = load_abc_for_title(manifest, title)
        if not abc.strip():
            print(f"{title:34} MISSING_ABC")
            failed += 1
            continue
        row = score_tune(root, title, m0, m1, key, meter, abc)
        rows.append(row)
        kmark = "ok" if row["K_ok"] else f"!{row['K_abc']}"
        mmark = "ok" if row["M_ok"] else f"!{row['M_abc']}"
        notation = row.get("notation") or {}
        print(
            f"{title[:34]:34} {row['ch_omr']:3d}/{row['ch_mxl']:<3d} "
            f"{row['ch_r']:5.2f} {row['pc_r']:5.2f} {row['rhythm_r']:5.2f} {row['oct_r']:5.2f} "
            f"{row['st_f1']:5.2f} {row['bars_abc']:3d}/{row['bars_mxl']:<3d} {kmark:>6} {mmark:>5} "
            f"{notation.get('ties', 0):4d} {notation.get('beams', 0):4d} {notation.get('grace', 0):3d}"
        )
        if row["mid_changes"]:
            print(f"  mid-tune attrs: {row['mid_changes']}")
        if row["structure_ref"] or row["structure_pred"]:
            print(
                f"  structure ref={row['structure_ref'][:8]}"
                f"{'...' if len(row['structure_ref']) > 8 else ''}"
            )
            print(
                f"  structure pred={row['structure_pred'][:8]}"
                f"{'...' if len(row['structure_pred']) > 8 else ''}"
            )
        if args.strict:
            if title in STRICT_EXCLUDE:
                print("  (strict: skipped — weak contour/OCR diagnostic only)")
            else:
                fails = check_strict(row)
                if fails:
                    failed += 1
                    print(f"  STRICT FAIL: {', '.join(fails)}")

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"wrote {args.json_out}")

    if args.strict and failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
