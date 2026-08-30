#!/usr/bin/env python3
"""Repair EuroSession ABC: L: for OMR, transpose Session to image key, wider lookup.

Does NOT re-run OMR. Prefer stronger online ABC when found for OMR-only tunes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from fractions import Fraction
from pathlib import Path

# Reuse similarity helpers from omr_and_lookup.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "local-resolver"))
from sheet_image_abc_repair import fix_decimal_durations as _fix_decimal_durations  # noqa: E402
from sheet_image_abc_repair import repair_omr_abc  # noqa: E402
from sheet_image_structure import apply_section_repeat_to_abc  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from omr_and_lookup import (  # noqa: E402
    TITLE_KEY_HINT_RE,
    ensure_x_header,
    looks_weak_abc,
    meter_for_type,
    normalize_title,
    title_similarity,
)


ROOT_SEMI = {
    "C": 0,
    "C#": 1,
    "DB": 1,
    "D": 2,
    "D#": 3,
    "EB": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "GB": 6,
    "G": 7,
    "G#": 8,
    "AB": 8,
    "A": 9,
    "A#": 10,
    "BB": 10,
    "B": 11,
}

MODE_ALIASES = {
    "": "major",
    "MAJ": "major",
    "MAJOR": "major",
    "M": "minor",
    "MIN": "minor",
    "MINOR": "minor",
    "DOR": "dorian",
    "DORIAN": "dorian",
    "MIX": "mixolydian",
    "MIXOLYDIAN": "mixolydian",
    "LYD": "lydian",
    "LYDIAN": "lydian",
    "PHRYG": "phrygian",
    "PHRYGIAN": "phrygian",
    "AEOL": "minor",
    "AEOLIAN": "minor",
}


def http_json(url: str, timeout: float = 25.0):
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-eurosession/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def parse_key_token(token: str) -> tuple[str, str] | None:
    text = (token or "").strip()
    if not text:
        return None
    text = text.replace("♯", "#").replace("♭", "b")
    m = re.match(
        r"^([A-Ga-g])([#b]?)\s*(major|maj|minor|min|m|dorian|dor|mixolydian|mix|lydian|lyd|phrygian|phryg|aeolian|aeol)?",
        text,
        re.I,
    )
    if not m:
        return None
    root = (m.group(1).upper() + (m.group(2) or "")).replace("b", "b")
    # Normalize flat spelling to root map keys (Bb -> BB for lookup via upper)
    root_key = root.upper().replace("B", "B")  # keep
    # Fix: 'BB' for Bb
    if len(root) == 2 and root[1] == "b":
        root_disp = root[0].upper() + "b"
        root_lookup = (root[0] + "B").upper()
    elif len(root) == 2 and root[1] == "#":
        root_disp = root[0].upper() + "#"
        root_lookup = root_disp.upper()
    else:
        root_disp = root[0].upper()
        root_lookup = root_disp
    mode_raw = (m.group(3) or "").upper()
    mode = MODE_ALIASES.get(mode_raw, "major" if not mode_raw else mode_raw.lower())
    if root_lookup not in ROOT_SEMI and root_disp.upper() not in ROOT_SEMI:
        # try Bb style
        alt = (root_disp[0] + "B").upper() if len(root_disp) == 2 and root_disp[1] == "b" else root_disp.upper()
        if alt not in ROOT_SEMI:
            return None
    return root_disp, mode


def parse_title_key(title: str) -> tuple[str, str] | None:
    """Extract key hint from title like (Gm), (Dm), (Am/Dm), (Am dorian/G)."""
    matches = list(
        re.finditer(
            r"\(([A-G][#b]?)(\s*(?:maj(?:or)?|min(?:or)?|m|dorian|mix(?:olydian)?|lydian|phrygian))?(?:\d)?(?:\s*/[^)]*)?\)",
            title or "",
            re.I,
        )
    )
    # Prefer the last hint (often the most specific / primary).
    for match in reversed(matches):
        token = match.group(1) + (match.group(2) or "")
        # Special-case "Am dorian" written as (Am dorian/G): group2 may only be m;
        # look inside full paren for dorian etc.
        full = match.group(0)[1:-1]
        if re.search(r"dorian", full, re.I):
            parsed = parse_key_token(match.group(1) + "dorian")
            if parsed:
                return parsed
        parsed = parse_key_token(token.strip())
        if parsed:
            return parsed
    return None



def parse_abc_key(abc: str) -> tuple[str, str] | None:
    m = re.search(r"^K:\s*([^\n%]+)", abc or "", re.M)
    if not m:
        return None
    raw = m.group(1).strip()
    # strip transpose= and other params
    raw = re.split(r"\s+", raw)[0]
    raw = raw.replace("min", "minor").replace("maj", "major")
    # Eminor / Bdorian / Gmajor / Bb
    m2 = re.match(
        r"^([A-Ga-g])([#b]?)(major|minor|dorian|mixolydian|lydian|phrygian|aeolian|m)?",
        raw,
        re.I,
    )
    if not m2:
        return parse_key_token(raw)
    root = m2.group(1).upper() + (m2.group(2) or "")
    if len(root) == 2 and root[1] == "B":
        # unlikely
        pass
    if len(root) == 2 and root[1].lower() == "b":
        root = root[0] + "b"
    mode_raw = (m2.group(3) or "").upper()
    if mode_raw in {"M"} or (mode_raw == "" and raw.lower().endswith("m") and not raw.lower().endswith("major")):
        # K:Em style already handled via group
        pass
    mode = MODE_ALIASES.get(mode_raw, None)
    if mode is None:
        if mode_raw == "":
            mode = "major"
        else:
            mode = mode_raw.lower()
    # Special: K:Eminor written as one word — already matched.
    if mode_raw == "" and re.search(r"minor|major|dorian|mix", raw, re.I):
        return parse_key_token(raw)
    return root[0].upper() + (root[1:] if len(root) > 1 else ""), mode


def root_semitone(root: str) -> int | None:
    r = root.strip()
    if len(r) == 2 and r[1] == "b":
        key = (r[0] + "B").upper()
    else:
        key = r.upper()
    return ROOT_SEMI.get(key)


def abc_key_header(root: str, mode: str) -> str:
    r = root[0].upper() + (root[1:] if len(root) > 1 else "")
    mode = (mode or "major").lower()
    if mode == "major":
        return r
    if mode == "minor":
        return r + "m"
    return r + mode


def transpose_semitones(src: tuple[str, str], dst: tuple[str, str]) -> int:
    a = root_semitone(src[0])
    b = root_semitone(dst[0])
    if a is None or b is None:
        return 0
    return b - a


def set_header(abc: str, field: str, value: str) -> str:
    lines = (abc or "").splitlines()
    key = field + ":"
    out = []
    seen = False
    for line in lines:
        if line.startswith(key):
            if not seen:
                out.append(f"{key}{value}")
                seen = True
            # drop duplicate headers
            continue
        out.append(line)
    if not seen:
        # insert after T: or X:
        inserted = False
        final = []
        for line in out:
            final.append(line)
            if not inserted and (line.startswith("T:") or line.startswith("X:")):
                if line.startswith("T:") or not any(l.startswith("T:") for l in out):
                    final.append(f"{key}{value}")
                    inserted = True
        out = final if inserted else [f"{key}{value}"] + out
    return "\n".join(out)


def strip_blank_lines_before_music(abc: str) -> str:
    """Remove blank lines between headers/% comments and the first music line.

    abcjs treats a blank line as a new tune, which drops the melody body.
    """
    lines = (abc or "").splitlines()
    if not lines:
        return abc or ""
    headerish = []
    body_start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            if body_start is None:
                continue  # drop leading / interstitial blanks in header block
            headerish.append(line)
            continue
        is_header = bool(re.match(r"^[A-Za-z]:", stripped)) or stripped.startswith("%")
        if body_start is None and is_header:
            headerish.append(line)
            continue
        if body_start is None:
            body_start = i
            break
        headerish.append(line)
    if body_start is None:
        return "\n".join(headerish).strip() + "\n"
    body = lines[body_start:]
    # Also drop a single blank immediately before music if any slipped through.
    while body and not body[0].strip():
        body.pop(0)
    return "\n".join(headerish + body).strip() + "\n"


_ANN_PREFIX = "\x00ABCANN"
_ANN_SUFFIX = "\x00"


def _is_music_body_line(line: str) -> bool:
    t = (line or "").strip()
    if not t or t.startswith("%"):
        return False
    if re.match(r"^[A-Za-z]:", t):
        return False
    return True


def convert_session_line_breaks(abc: str) -> str:
    """Convert bare Session/folktune ! line-breaks to newlines; keep !annotation!."""
    text = abc or ""

    def needs_fix(body: str) -> bool:
        if "|!" in body:
            return True
        anns: list[str] = []

        def _protect(m: re.Match) -> str:
            anns.append(m.group(0))
            return f"{_ANN_PREFIX}{len(anns)-1}{_ANN_SUFFIX}"

        protected = re.sub(r"!([A-Za-z0-9.<>()+/=_-]{1,32})!", _protect, body)
        return bool(re.search(r"!(?![A-Za-z])", protected))

    body = "\n".join(ln for ln in text.splitlines() if _is_music_body_line(ln))
    if not body or not needs_fix(body):
        return text

    parts = re.split(r"(\r?\n)", text)
    out: list[str] = []
    for part in parts:
        if part in ("\n", "\r\n"):
            out.append(part)
            continue
        if not _is_music_body_line(part):
            out.append(part)
            continue
        anns: list[str] = []

        def _protect(m: re.Match) -> str:
            anns.append(m.group(0))
            return f"{_ANN_PREFIX}{len(anns)-1}{_ANN_SUFFIX}"

        protected = re.sub(r"!([A-Za-z0-9.<>()+/=_-]{1,32})!", _protect, part)
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
    """Ensure the last music line ends with a final double bar || (non-destructive)."""
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
        # Open/close repeat at end — leave alone (structure may be intentional).
        return "\n".join(lines).strip() + "\n"
    if line.endswith("|"):
        lines[last_music] = line + "|"
    else:
        lines[last_music] = line + "||"
    return "\n".join(lines).strip() + "\n"


def safe_autofix_abc(abc: str) -> str:
    """Non-destructive ABC cleanup for rendering (no note pitch/rhythm rewrites).

    - Session ! line-breaks → newlines (preserves !fermata! etc.)
    - Strip blank lines before first music line
    - Ensure a final barline when missing
    """
    text = convert_session_line_breaks(abc or "")
    text = strip_blank_lines_before_music(text)
    text = ensure_final_barline(text)
    # Collapse runs of blank lines inside the body to a single blank (rare).
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def safe_autofix_all(tunes: list[dict]) -> int:
    """Apply safe_autofix_abc to selected ABC and every candidate. Returns count changed."""
    changed = 0
    for entry in tunes:
        abc = str(entry.get("abc") or "")
        if abc and "%% missing abc" not in abc:
            fixed = safe_autofix_abc(abc)
            if fixed != abc:
                entry["abc"] = fixed
                changed += 1
        for cand in entry.get("candidates") or []:
            cabc = str(cand.get("abc") or "")
            if not cabc or "%% missing abc" in cabc:
                continue
            fixed = safe_autofix_abc(cabc)
            if fixed != cabc:
                cand["abc"] = fixed
                changed += 1
    return changed


def apply_transpose_to_abc(abc: str, semitones: int, target_key: tuple[str, str] | None) -> str:
    """Apply semitone shift using standard abc2book transpose comments.

    Uses `% abcbook-transpose N` (+ `%%MIDI transpose N`) at the **end** of the
    tune (after the music body). Putting them between K: and the notes is fragile:
    if a blank line appears there, abcjs treats it as a new tune and drops the body.
    `target_key` is kept for API compatibility (review UI owns target-key feedback).
    """
    del target_key  # retained for callers; review UI owns target-key feedback
    text = abc or ""
    # Remove prior transpose markers we own (and legacy eurosession markers).
    text = re.sub(r"^%%MIDI transpose\s+-?\d+\s*$", "", text, flags=re.M)
    text = re.sub(r"^% abcbook-transpose\s+-?\d+\s*$", "", text, flags=re.M)
    text = re.sub(r"^% abcbook-playback-transpose\s+-?\d+\s*$", "", text, flags=re.M)
    text = re.sub(r"^% eurosession-transpose\s+-?\d+\s*$", "", text, flags=re.M)
    text = re.sub(r"^% eurosession-target-key\s+.+$", "", text, flags=re.M)

    m = re.search(r"^(K:\s*)([^\n]+)$", text, re.M)
    if m:
        raw = m.group(2).strip()
        base = re.sub(r"\s*transpose\s*=\s*-?\d+", "", raw, flags=re.I).strip()
        text = re.sub(r"^K:\s*[^\n]+$", f"K:{base}", text, count=1, flags=re.M)

    text = strip_blank_lines_before_music(text)
    if semitones:
        text = text.rstrip() + f"\n% abcbook-transpose {semitones}\n%%MIDI transpose {semitones}\n"
    return text if text.endswith("\n") else text + "\n"


def fix_decimal_durations(abc: str) -> str:
    """Convert invalid OMR decimals like G0.75 → G3/4."""
    return _fix_decimal_durations(abc)


def apply_section_repeat_heuristic(abc: str, *, section_bars: int | None = None) -> str:
    """Wrap N-bar sections as |: … :| when ABC has no repeat marks."""
    meter_m = re.search(r"^M:\s*(\S+)", abc or "", re.M)
    meter = (meter_m.group(1) if meter_m else "").strip()
    return apply_section_repeat_to_abc(abc, meter=meter, section_bars=section_bars)


def apply_eight_bar_repeat_heuristic(abc: str) -> str:
    """If ABC has no repeats and bar count is 8×N (N≥2), wrap each 8 as |: … :|."""
    return apply_section_repeat_heuristic(abc, section_bars=8)


def query_variants(title: str) -> list[str]:
    base = TITLE_KEY_HINT_RE.sub("", title or "").strip()
    base = re.sub(r"\s*[-–—].*$", "", base).strip()
    out = [base]
    if "/" in base:
        out.append(base.split("/")[0].strip())
        out.append(base.split("/")[-1].strip())
    # drop trailing parenthetical remnants
    out.append(re.sub(r"\([^)]*\)", "", base).strip())
    # significant words
    words = re.findall(r"[A-Za-z0-9']+", normalize_title(base))
    if len(words) >= 2:
        out.append(" ".join(words[:2]))
    if len(words) >= 3:
        out.append(" ".join(words[:3]))
    # strip leading Bour(r)ée generic only when more words follow — keep full
    seen = set()
    res = []
    for q in out:
        q = re.sub(r"\s+", " ", q).strip(" -–,")
        k = normalize_title(q)
        if not q or len(k) < 4 or k in seen:
            continue
        # skip ultra-generic single tokens
        if k in {"bourree", "bourre", "an dro", "polska", "schottische", "scottische"}:
            continue
        seen.add(k)
        res.append(q)
    return res


def session_key_to_tuple(key: str) -> tuple[str, str] | None:
    return parse_abc_key("K:" + (key or ""))


def setting_key_score(setting_key: str, target: tuple[str, str] | None) -> float:
    if not target:
        return 0.0
    parsed = session_key_to_tuple(setting_key)
    if not parsed:
        return 0.0
    score = 0.0
    if root_semitone(parsed[0]) == root_semitone(target[0]):
        score += 2.0
    # compatible modes
    sm, tm = parsed[1], target[1]
    if sm == tm:
        score += 2.0
    elif {sm, tm} <= {"minor", "dorian", "aeolian"}:
        score += 1.0
    elif {sm, tm} <= {"major", "mixolydian", "lydian"}:
        score += 1.0
    return score


def fetch_thesession_abc(tune_id: int, target_key: tuple[str, str] | None = None) -> dict | None:
    detail = http_json(f"https://thesession.org/tunes/{tune_id}?format=json")
    if not isinstance(detail, dict):
        return None
    settings = detail.get("settings") or []
    if not settings:
        return None
    # Prefer a setting whose key matches the image/title key.
    ranked = sorted(
        settings,
        key=lambda s: (setting_key_score(str(s.get("key") or ""), target_key), -settings.index(s)),
        reverse=True,
    )
    setting = ranked[0]
    abc_body = str(setting.get("abc") or "").strip()
    if not abc_body:
        return None
    name = str(detail.get("name") or "")
    if not re.search(r"^K:", abc_body, re.M) and not abc_body.startswith("X:"):
        header = [
            "X:1",
            "T:" + name,
            "R:" + str(detail.get("type") or ""),
            "M:" + meter_for_type(str(detail.get("type") or "")),
            "L:1/8",
            "K:" + str(setting.get("key") or "C"),
        ]
        abc = "\n".join(h for h in header if h.split(":", 1)[-1]) + "\n" + abc_body
    else:
        abc = abc_body
        if not re.search(r"^K:", abc, re.M):
            abc = set_header(abc, "K", str(setting.get("key") or "C"))
    return {
        "source": f"thesession:{tune_id}",
        "matchedTitle": name,
        "abc": abc,
        "url": f"https://thesession.org/tunes/{tune_id}",
        "score": 1.0,
        "settingKey": str(setting.get("key") or ""),
    }


def lookup_thesession_wide(title: str, min_score: float = 0.72) -> dict | None:
    target_key = parse_title_key(title)
    best = None
    best_score = 0.0
    cleaned = TITLE_KEY_HINT_RE.sub("", title)
    cleaned = re.sub(r"\([^)]*\)", "", cleaned).strip()
    for q in query_variants(title):
        url = "https://thesession.org/tunes/search?format=json&q=" + urllib.parse.quote(q)
        body = http_json(url)
        if not isinstance(body, dict):
            continue
        for tune in (body.get("tunes") or [])[:15]:
            name = str(tune.get("name") or "")
            alias = str(tune.get("alias") or "")
            score = max(
                title_similarity(title, name),
                title_similarity(title, alias),
                title_similarity(cleaned, name),
                title_similarity(cleaned, alias),
                title_similarity(q, name),
                title_similarity(q, alias),
            )
            # Prefer alias/title equality after accent fold.
            if normalize_title(alias) and normalize_title(alias) == normalize_title(cleaned):
                score = max(score, 1.0)
            if normalize_title(name) == normalize_title(cleaned):
                score = max(score, 1.0)
            q_words = set(normalize_title(cleaned).split())
            n_words = set(normalize_title(name).split())
            a_words = set(normalize_title(alias).split())
            # Reject generic one-word session titles unless alias matches well.
            if len(q_words) >= 3 and len(n_words) <= 2 and score < 0.95:
                if title_similarity(cleaned, alias) < 0.85:
                    score = min(score, 0.5)
            # "An Dro" alone is too generic for longer titles.
            if normalize_title(name) in {"an dro", "bourree", "bourre", "polska"} and len(q_words) >= 3:
                if title_similarity(cleaned, alias) < 0.9:
                    score = min(score, 0.55)
            if score > best_score:
                best_score = score
                best = tune
        time.sleep(0.12)
    if not best or best_score < min_score:
        return None
    got = fetch_thesession_abc(int(best["id"]), target_key=target_key)
    if not got:
        return None
    got["score"] = best_score
    return got


def align_key(abc: str, title: str) -> tuple[str, int]:
    """Transpose ABC toward title key hint when modes are compatible."""
    target = parse_title_key(title)
    if not target:
        return strip_blank_lines_before_music(abc), 0
    source = parse_abc_key(abc)
    if not source:
        return set_header(abc, "K", abc_key_header(*target)), 0
    # If roots already match, just clear stale transpose markers.
    if root_semitone(source[0]) == root_semitone(target[0]):
        return apply_transpose_to_abc(abc, 0, target), 0
    sm, tm = source[1], target[1]
    compatible = (
        sm == tm
        or {sm, tm} <= {"minor", "dorian", "aeolian"}
        or {sm, tm} <= {"major", "mixolydian", "lydian"}
    )
    if not compatible:
        # Mode mismatch: leave K: alone, omit transpose (review key UI captures failure).
        return apply_transpose_to_abc(abc, 0, None), 0
    semis = transpose_semitones(source, target)
    return apply_transpose_to_abc(abc, semis, target), semis


def lookup_abcnotation(title: str, min_score: float = 0.72) -> dict | None:
    """Best-effort scrape of abcnotation.com search results."""
    q = TITLE_KEY_HINT_RE.sub("", title).strip()
    q = re.sub(r"\s*[-–—].*$", "", q).strip()
    if len(normalize_title(q)) < 5:
        return None
    url = "https://abcnotation.com/searchTunes?q=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-eurosession/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None
    # Links like /tunePage?a=...
    links = re.findall(r'href="(/tunePage\?[^"]+)"[^>]*>([^<]{3,120})<', html)
    best_score = 0.0
    best_href = ""
    best_name = ""
    for href, name in links[:12]:
        name = re.sub(r"\s+", " ", name).strip()
        score = title_similarity(title, name)
        if score > best_score:
            best_score = score
            best_href = href
            best_name = name
    if best_score < min_score or not best_href:
        return None
    page_url = "https://abcnotation.com" + best_href.replace("&amp;", "&")
    try:
        with urllib.request.urlopen(
            urllib.request.Request(page_url, headers={"User-Agent": "abc2book-eurosession/1.0"}),
            timeout=25,
        ) as resp:
            page = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None
    # Prefer <pre> or textarea with X:
    m = re.search(r"<pre[^>]*>(X:[\s\S]*?)</pre>", page, re.I)
    if not m:
        m = re.search(r"<textarea[^>]*>(X:[\s\S]*?)</textarea>", page, re.I)
    if not m:
        return None
    abc = (
        m.group(1)
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .strip()
    )
    if looks_weak_abc(abc):
        return None
    return {
        "source": "abcnotation",
        "matchedTitle": best_name,
        "abc": abc,
        "url": page_url,
        "score": best_score,
    }


def extract_transpose_semitones(abc: str) -> int:
    """Read existing transpose markers (legacy or abcbook) from ABC text."""
    text = abc or ""
    m = re.search(r"^% abcbook-transpose\s+(-?\d+)\s*$", text, re.M)
    if m:
        return int(m.group(1))
    m = re.search(r"^% eurosession-transpose\s+(-?\d+)\s*$", text, re.M)
    if m:
        return int(m.group(1))
    m = re.search(r"^%%MIDI transpose\s+(-?\d+)\s*$", text, re.M)
    if m:
        return int(m.group(1))
    m = re.search(r"^K:[^\n]*\btranspose\s*=\s*(-?\d+)", text, re.M | re.I)
    if m:
        return int(m.group(1))
    return 0


def normalize_transpose_in_abc(abc: str) -> str:
    """Rewrite legacy transpose markers to % abcbook-transpose; strip blank gaps."""
    semis = extract_transpose_semitones(abc)
    return apply_transpose_to_abc(abc, semis, None)


def normalize_all_transpose(tunes: list[dict]) -> int:
    """Normalize transpose on selected ABC and every candidate. Returns count changed."""
    changed = 0
    for entry in tunes:
        abc = str(entry.get("abc") or "")
        if abc:
            fixed = normalize_transpose_in_abc(abc)
            if fixed != abc:
                entry["abc"] = fixed
                changed += 1
        for cand in entry.get("candidates") or []:
            cabc = str(cand.get("abc") or "")
            if not cabc:
                continue
            fixed = normalize_transpose_in_abc(cabc)
            if fixed != cabc:
                cand["abc"] = fixed
                changed += 1
    return changed


def rebuild_abc_file(work: Path, tunes: list[dict]) -> None:
    blocks = []
    for i, row in enumerate(tunes, start=1):
        abc = str(row.get("abc") or "").strip()
        title = str(row.get("title") or f"Tune {i}")
        if not abc or "%% missing abc" in abc:
            abc = f"X:{i}\nT:{title}\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry\n"
            row["abcSource"] = row.get("abcSource") or "missing"
        else:
            abc = ensure_x_header(abc, i, title)
            row["abc"] = abc
        comment = (
            f"% page={row.get('page')} tune={row.get('tuneIndex')} "
            f"source={row.get('abcSource')} match={row.get('lookupMatch') or ''}"
        )
        blocks.append(comment + "\n" + abc.strip())
    (work / "eurosession.abc").write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair EuroSession ABC lengths/keys/sources")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--skip-search", action="store_true")
    parser.add_argument(
        "--normalize-transpose-only",
        action="store_true",
        help="Rewrite legacy transpose markers to %% abcbook-transpose; no search/OMR",
    )
    parser.add_argument(
        "--safe-autofix-only",
        action="store_true",
        help="Non-destructive ABC fixes (Session ! linebreaks, blank gaps, final barline)",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--no-review-html", action="store_true")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    all_tunes = list(manifest.get("tunes") or [])
    process_n = min(args.limit, len(all_tunes)) if args.limit > 0 else len(all_tunes)

    if args.normalize_transpose_only or args.safe_autofix_only:
        changed = 0
        if args.normalize_transpose_only:
            # Only touch the first process_n entries, keep the rest intact.
            subset = all_tunes[:process_n]
            changed += normalize_all_transpose(subset)
        if args.safe_autofix_only:
            subset = all_tunes[:process_n]
            changed += safe_autofix_all(subset)
        for i, entry in enumerate(all_tunes, start=1):
            title = str(entry.get("title") or f"Tune {i}")
            if entry.get("abc"):
                entry["abc"] = ensure_x_header(str(entry["abc"]), i, title)
        rebuild_abc_file(work, all_tunes)
        manifest["tunes"] = all_tunes
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        label = "+".join(
            p
            for p, on in (
                ("normalize-transpose", args.normalize_transpose_only),
                ("safe-autofix", args.safe_autofix_only),
            )
            if on
        )
        print(f"{label}: rewritten={changed} processed={process_n}/{len(all_tunes)}")
        if not args.no_review_html:
            from make_abc_review_html import main as make_review

            sys.argv = ["make_abc_review_html.py", "--work", str(work)]
            make_review()
        return 0

    tunes = all_tunes[:process_n] if args.limit > 0 else all_tunes

    replaced = 0
    omr_fixed = 0
    transposed = 0

    for i, entry in enumerate(tunes, start=1):
        title = str(entry.get("title") or f"Tune {i}")
        source = str(entry.get("abcSource") or "")
        abc = str(entry.get("abc") or "")
        print(f"[{i}/{len(tunes)}] {title} ({source or 'none'})")

        # Wider search for OMR-only (and missing)
        if not args.skip_search and (source.startswith("omr") or source in {"", "missing"}):
            hit = lookup_thesession_wide(title, min_score=0.72)
            if not hit or looks_weak_abc(hit.get("abc") or ""):
                alt = lookup_abcnotation(title, min_score=0.78)
                if alt and (not hit or alt.get("score", 0) > hit.get("score", 0)):
                    hit = alt
            if hit and not looks_weak_abc(hit.get("abc") or "") and hit.get("score", 0) >= 0.72:
                abc = hit["abc"]
                source = hit["source"]
                entry["abcSource"] = source
                entry["lookupMatch"] = hit.get("matchedTitle") or ""
                entry["lookupScore"] = hit.get("score")
                entry["lookupUrl"] = hit.get("url") or ""
                entry["omrStatus"] = entry.get("omrStatus") or "kept-no-rerun"
                replaced += 1
                print(f"  -> {source} match={entry['lookupMatch']} score={hit.get('score'):.2f}")

        if source.startswith("omr"):
            abc = repair_omr_abc(abc, title)
            omr_fixed += 1
        else:
            # Online sources: fix key via transpose toward title hint
            abc2, semis = align_key(abc, title)
            if semis:
                transposed += 1
                print(f"  transpose {semis:+d} toward title key")
            abc = abc2

        entry["abc"] = ensure_x_header(safe_autofix_abc(abc), i, title)
        entry["abcSource"] = source or entry.get("abcSource") or "missing"

    # Also normalize any candidate ABC left with legacy markers / Session !.
    normalize_all_transpose(all_tunes if args.limit <= 0 else tunes)
    safe_autofix_all(all_tunes if args.limit <= 0 else tunes)

    rebuild_abc_file(work, all_tunes if args.limit <= 0 else (
        # When limited, merge processed prefix back into full list.
        tunes + all_tunes[len(tunes):]
    ))
    # Ensure manifest always has full tune list
    if args.limit > 0:
        all_tunes[: len(tunes)] = tunes
        manifest["tunes"] = all_tunes
    else:
        manifest["tunes"] = tunes
    manifest["resolvedCount"] = sum(
        1
        for r in manifest["tunes"]
        if r.get("abcSource")
        and r.get("abcSource") != "missing"
        and r.get("abc")
        and "%% missing abc" not in str(r.get("abc") or "")
    )
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(
        f"done: replaced_sources={replaced} omr_L/K_fixed={omr_fixed} "
        f"transposed={transposed} resolved={manifest['resolvedCount']}/{len(manifest['tunes'])}"
    )

    if not args.no_review_html:
        from make_abc_review_html import main as make_review

        sys.argv = ["make_abc_review_html.py", "--work", str(work)]
        make_review()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
