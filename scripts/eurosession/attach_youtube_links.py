#!/usr/bin/env python3
"""Attach high-confidence YouTube links to EuroSession import ABC.

Uses yt-dlp search (no Google API quota). Only keeps a link when the video
title clearly matches the tune name — prefer missing over wrong.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

TITLE_KEY_HINT_RE = re.compile(
    r"\s*\(([A-G][#b]?(?:m|maj|min|dim|aug|dorian|mix(?:olydian)?|lydian|phrygian)?"
    r"(?:\d)?(?:\s*/[^)]*)?)\)\s*$",
    re.I,
)
GENERIC_WORDS = {
    "the",
    "a",
    "an",
    "de",
    "du",
    "des",
    "la",
    "le",
    "les",
    "el",
    "and",
    "or",
    "of",
    "from",
    "fra",
    "van",
    "der",
    "set",
    "tune",
    "dance",
    "dances",
    "waltz",
    "valse",
    "polska",
    "bourree",
    "bourrée",
    "schottische",
    "scottische",
    "scottish",
    "schottis",
    "polka",
    "reel",
    "jig",
    "march",
    "song",
    "air",
    "no",
    "nr",
    "number",
    "band",
    "with",
    "castanets",
    "italy",
    "venezuelan",
    "flemish",
    "french",
    "new",
}
# Cores that are too vague to trust as the sole match key.
BANNED_CORES = {
    "sans nom",
    "freylekhs",
    "freilich",
    "freilach",
    "sunshine",
    "flatworld",
    "slångpolska",
    "slangpolska",
    "hellebore",
    "aosta valley",
    "the goddesses",
    "venezuelan waltz",
    "harmony",
    "amazone",
    "furiant",
    "bravade",
}
NOISE_VIDEO_RE = re.compile(
    r"\b(how\s+to|tutorial|lesson|learn|backing\s*track|karaoke|slow\s+down|"
    r"practice\s+track|play\s*along\s+minus|minus\s+one|geometry\s*dash|"
    r"minecraft|roblox|fortnite|trailer|maintenance|best\s+places|travel|"
    r"tourism|vacation|holiday\s+guide|horticulture|gardening|lenten\s+rose|"
    r"handpan\s+mediation|meditation)\b",
    re.I,
)
# Extra words allowed in an otherwise exact single-name match.
OK_EXTRA_WORDS = {
    "live",
    "folk",
    "trad",
    "traditional",
    "session",
    "accordion",
    "fiddle",
    "violin",
    "flute",
    "bagpipe",
    "pipes",
    "guitar",
    "hurdy",
    "gurdy",
    "vielle",
    "melodeon",
    "concertina",
    "piano",
    "cover",
    "version",
    "official",
    "audio",
    "music",
    "dance",
    "dances",
    "tune",
    "tunes",
    "set",
    "medley",
    "hd",
    "hq",
    "full",
    "album",
    "topic",
    "by",
    "performed",
    "playing",
    "plays",
    "feat",
    "featuring",
    "and",
    "the",
    "a",
    "an",
    "de",
    "du",
    "des",
    "la",
    "le",
    "les",
    "el",
    "fra",
    "from",
    "van",
    "der",
    "waltz",
    "valse",
    "polska",
    "bourree",
    "jig",
    "reel",
    "polka",
    "march",
    "schottische",
    "scottish",
    "mazurka",
    "mazurk",
    "horo",
    "part",
    "greek",
    "manx",
    "celtic",
    "breton",
    "swedish",
    "norwegian",
    "danish",
    "irish",
    "scottish",
    "schottische",
    "schottishe",
    "schottis",
    "scottische",
}
YOUTUBE_IN_ABC_RE = re.compile(
    r"%\s*abcbook-link-\d+\s+https?://(?:www\.)?(?:youtube\.com|youtu\.be)/",
    re.I,
)
TRAILING_NUM_RE = re.compile(r"^(.*?)(?:\s+|[#._-]?)(\d+)$")


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_text(text: str) -> str:
    cleaned = strip_accents(text or "")
    cleaned = cleaned.replace("’", "'").replace("‘", "'").replace("´", "'")
    # Letters that don't always decompose under NFKD.
    cleaned = cleaned.replace("ø", "o").replace("Ø", "o").replace("æ", "ae").replace("Æ", "ae")
    cleaned = cleaned.replace("œ", "oe").replace("Œ", "oe").replace("ß", "ss")
    cleaned = cleaned.lower()
    # Saint / St equivalence helps An Dro St Patrick ↔ Saint Patrick's An Dro.
    cleaned = re.sub(r"\bst\b\.?", "saint", cleaned)
    # Common dance-form spelling variants.
    cleaned = re.sub(r"\bschottishe\b", "schottische", cleaned)
    cleaned = re.sub(r"\bscottische\b", "schottische", cleaned)
    cleaned = re.sub(r"\bscottish\b", "schottische", cleaned)
    cleaned = re.sub(r"\bschottis\b", "schottische", cleaned)
    cleaned = re.sub(r"[^a-z0-9\s']", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def tokenize(text: str) -> list[str]:
    words = []
    for raw in normalize_text(text).split():
        w = raw
        # Strip possessive / plural-ish trailing 's for matching.
        if w.endswith("'s"):
            w = w[:-2]
        elif len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            # Keep as-is for matching both forms via separate path; don't strip all plurals.
            pass
        if len(w) >= 2:
            words.append(w)
    return words


def significant_words(text: str) -> list[str]:
    out = []
    for w in tokenize(text):
        if len(w) < 3:
            continue
        if w in GENERIC_WORDS:
            continue
        out.append(w)
    return out


def is_banned_core(core: str) -> bool:
    return normalize_text(core) in BANNED_CORES


def core_title_variants(title: str) -> list[str]:
    """Primary search/match strings for a tune title (strict cores only)."""
    base = TITLE_KEY_HINT_RE.sub("", title or "").strip()
    # Strip trailing parenthetical translations / keys still left.
    base = re.sub(r"\s*\([^)]*\)\s*$", "", base).strip()
    base = re.sub(r"\s*\([^)]*\)\s*$", "", base).strip()
    variants: list[str] = []
    if base:
        variants.append(base)

    # Slash pairs are often two tunes in a set. Only keep the left title for
    # matching; searching the right alone too easily attaches the wrong piece.
    if re.search(r"\s*/\s*", base):
        left = re.split(r"\s*/\s*", base, maxsplit=1)[0].strip()
        if left and left not in variants:
            variants.append(left)

    # "or" aliases: keep both sides when distinctive.
    if re.search(r"\s+\bor\b\s+", base, flags=re.I):
        for part in re.split(r"\s+\bor\b\s+", base, flags=re.I):
            part = part.strip()
            if part and part not in variants:
                variants.append(part)

    # Dash-separated sets: keep distinctive parts, but never genre-only tails.
    if " - " in base:
        parts = [p.strip() for p in base.split(" - ") if p.strip()]
        for i, part in enumerate(parts):
            if part in variants:
                continue
            words = significant_words(part)
            if not words:
                continue
            # First part of a set is preferred; later parts need 2+ words
            # or a long distinctive single token.
            if i == 0:
                if len(words) >= 1 and (len(words) >= 2 or len(words[0]) >= 6):
                    variants.append(part)
            elif len(words) >= 2 or (len(words) == 1 and len(words[0]) >= 8):
                variants.append(part)

    out: list[str] = []
    for v in variants:
        if is_banned_core(v):
            continue
        words = significant_words(v)
        if len(words) >= 2:
            out.append(v)
        elif len(words) == 1 and len(words[0]) >= 7:
            out.append(v)
    return out


def is_searchable(title: str, *, join_tier: str) -> bool:
    if join_tier == "photo_only":
        return False
    return bool(core_title_variants(title))


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / float(len(a | b))


def edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 2:
        return 99
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (ca != cb)
            cur.append(min(ins, delete, sub))
        prev = cur
    return prev[-1]


def words_close(a: str, b: str) -> bool:
    if a == b:
        return True
    if min(len(a), len(b)) >= 4 and (a in b or b in a):
        return True
    if min(len(a), len(b)) >= 4 and edit_distance(a, b) <= 2:
        # Don't treat first-letter swaps as spelling variants (zircus ≠ circus).
        if a[0] != b[0]:
            return False
        return True
    return False


def core_covered_by_video(c_words: set[str], v_words: set[str]) -> bool:
    """True when every significant core word has a close match in the video title."""
    unused = set(v_words)
    for wa in c_words:
        hit = None
        for wb in unused:
            if words_close(wa, wb):
                hit = wb
                break
        if hit is None:
            return False
        unused.remove(hit)
    return True


def trailing_number(core: str) -> str | None:
    m = TRAILING_NUM_RE.match(normalize_text(core))
    if not m:
        return None
    left = m.group(1).strip()
    if not left:
        return None
    return m.group(2)


def score_video_against_cores(cores: list[str], video_title: str) -> tuple[float, str]:
    """Return (best_score, matched_core). Higher is better; 0 = reject."""
    if NOISE_VIDEO_RE.search(video_title or ""):
        return 0.0, ""

    v_norm = normalize_text(video_title)
    v_words = set(significant_words(video_title))
    best = 0.0
    best_core = ""

    for idx, core in enumerate(cores):
        c_norm = normalize_text(core)
        c_words = set(significant_words(core))
        if not c_words:
            continue

        # Numbered variants must keep the number somewhere in the video title.
        num = trailing_number(core)
        if num:
            raw_tokens = normalize_text(video_title).replace("'s", "").split()
            if num not in raw_tokens and not re.search(rf"(?:^|\D){re.escape(num)}(?:\D|$)", normalize_text(video_title)):
                continue

        covered = core_covered_by_video(c_words, v_words)
        if not covered:
            continue

        # Map close pairs to estimate extras (video words not used by core).
        unused = set(v_words)
        for wa in c_words:
            for wb in list(unused):
                if words_close(wa, wb):
                    unused.remove(wb)
                    break
        bad_extra = {w for w in unused if w not in OK_EXTRA_WORDS}

        score = 0.0
        # Prefer phrase containment when the normalized core appears as a unit.
        c_norm_compact = re.sub(r"\b(the|a|an)\b", " ", c_norm)
        c_norm_compact = re.sub(r"\s+", " ", c_norm_compact).strip()
        v_norm_compact = re.sub(r"'s\b", "", v_norm)
        v_norm_compact = re.sub(r"\s+", " ", v_norm_compact).strip()
        phrase_hit = bool(
            c_norm_compact
            and (
                c_norm_compact == v_norm_compact
                or c_norm_compact in v_norm_compact
                or c_norm in v_norm
            )
        )

        if phrase_hit:
            if c_norm_compact == v_norm_compact or c_norm == v_norm:
                score = 0.99
            elif len(c_words) == 1:
                token = next(iter(c_words))
                if not bad_extra:
                    score = 0.94
                elif len(token) >= 7 and len(bad_extra) <= 3:
                    # Distinctive single names (Mominette, Hasaposerviko, Eklunda) with light clutter.
                    score = 0.92
                else:
                    score = 0.0
            elif len(bad_extra) <= 2:
                score = 0.96 - 0.03 * len(bad_extra)
            elif len(c_words) >= 2 and re.search(r"\b(?:19|20)\d{2}\b", video_title or ""):
                # Busy event/festival titles that still name the tune.
                score = 0.91
            elif len(c_words) >= 2 and not v_norm_compact.startswith(c_norm_compact):
                # Core appears after a prefix (e.g. "Folk music … - Three little boats").
                score = 0.91
            else:
                # e.g. "Three Little Boats Went Out to Sea" — different song.
                score = 0.0
        elif len(c_words) >= 2:
            # Word-order / spelling variants (An Dro St Patrick ↔ St Patrick's An Dro).
            # Multi-word core coverage is strong evidence even with busy titles.
            score = 0.92
        elif len(c_words) == 1:
            token = next(iter(c_words))
            # Compound title containing the core (Eklundapolska / Hasaposerviko Part 2).
            compound = any(words_close(token, w) and token != w for w in v_words)
            if not bad_extra:
                score = 0.92
            elif (compound or len(token) >= 7) and len(bad_extra) <= 3:
                score = 0.91

        # Prefer primary core; lightly penalize later aliases / set parts.
        if score > 0 and idx > 0:
            score -= 0.02
            # Reject weak short secondary single-token matches.
            if len(c_words) == 1 and len(list(c_words)[0]) < 7:
                score = 0.0

        if score > best:
            best, best_core = score, core

    return best, best_core


def cores_compatible(a: str, b: str) -> bool:
    """True when cores name the same tune (aliases / nested), not distinct set members."""
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    wa, wb = set(significant_words(a)), set(significant_words(b))
    if wa and wb and (wa <= wb or wb <= wa):
        return True
    return False


def pick_strict_match(cores: list[str], candidates: list[dict]) -> dict | None:
    """Accept only a clear, high-confidence single winner."""
    scored: list[tuple[float, dict, str]] = []
    for cand in candidates:
        title = str(cand.get("title") or "")
        score, core = score_video_against_cores(cores, title)
        if score >= 0.899:
            scored.append((round(score, 3), cand, core))
    if not scored:
        return None
    # Prefer higher score, earlier core (left alias), then shorter title.
    def core_rank(core: str) -> int:
        try:
            return cores.index(core)
        except ValueError:
            return 99

    scored.sort(key=lambda x: (-x[0], core_rank(x[2]), len(str(x[1].get("title") or ""))))
    best_score, best, best_core = scored[0]
    if best_score < 0.90:
        return None
    # Ambiguous only when a near-tied runner-up matched an incompatible core.
    for alt_score, alt, alt_core in scored[1:]:
        if best_score - alt_score >= 0.05:
            break
        if cores_compatible(alt_core, best_core):
            continue
        return None
    best = dict(best)
    best["matchScore"] = round(best_score, 3)
    best["matchedCore"] = best_core
    return best


def yt_search(query: str, *, n: int = 5, ytdlp: str) -> list[dict]:
    cmd = [
        ytdlp,
        f"ytsearch{n}:{query}",
        "--flat-playlist",
        "--print",
        "%(id)s\t%(title)s\t%(channel)s",
        "--no-warnings",
        "--socket-timeout",
        "20",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    except Exception:
        return []
    out = []
    for line in (proc.stdout or "").splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        vid = parts[0].strip()
        if not vid or vid == "NA":
            continue
        title = parts[1].strip()
        channel = parts[2].strip() if len(parts) > 2 else ""
        out.append(
            {
                "id": vid,
                "title": title,
                "channel": channel,
                "link": f"https://www.youtube.com/watch?v={vid}",
            }
        )
    return out


def strip_existing_abcbook_links(abc: str) -> str:
    lines = []
    for line in (abc or "").splitlines():
        if line.startswith("% abcbook-link"):
            continue
        lines.append(line)
    return "\n".join(lines).rstrip() + "\n"


def inject_youtube_link(abc: str, *, url: str, title: str) -> str:
    text = strip_existing_abcbook_links(abc)
    block = f"% abcbook-link-0 {url}\n% abcbook-link-title-0 {title}\n"
    if re.search(r"% abcbook-repeats\s+\S+", text, re.I):
        text = re.sub(
            r"(% abcbook-repeats\s+\S+[^\n]*\n)",
            r"\1" + block,
            text,
            count=1,
            flags=re.I,
        )
    elif re.search(r"% abcbook-tune_id\s+\S+", text):
        text = re.sub(
            r"(% abcbook-tune_id\s+\S+[^\n]*\n)",
            r"\1" + block,
            text,
            count=1,
        )
    else:
        text = text.rstrip() + "\n" + block
    return text if text.endswith("\n") else text + "\n"


def rebuild_abc_file(tunes: list[dict], out_abc: Path) -> None:
    blocks = []
    for t in tunes:
        key = t.get("key") or ""
        tier = t.get("joinTier") or ""
        blocks.append(f"% key={key} tier={tier} id={t.get('id')}\n" + str(t.get("abc") or "").rstrip())
    out_abc.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--import-json",
        default="/home/stever/Downloads/eurosession-work/eurosession-import-final.json",
    )
    parser.add_argument(
        "--out-json",
        default="/home/stever/Downloads/eurosession-work/eurosession-import-final.json",
    )
    parser.add_argument(
        "--out-abc",
        default="/home/stever/Downloads/eurosession-work/eurosession-final.abc",
    )
    parser.add_argument(
        "--report",
        default="/home/stever/Downloads/eurosession-work/youtube_link_report.json",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--sleep", type=float, default=0.4)
    parser.add_argument("--ytdlp", default="")
    args = parser.parse_args()

    ytdlp = args.ytdlp or shutil.which("yt-dlp") or ""
    if not ytdlp:
        raise SystemExit("yt-dlp not found on PATH")

    pkg = json.loads(Path(args.import_json).read_text(encoding="utf-8"))
    tunes = list(pkg.get("tunes") or [])
    targets = [
        t
        for t in tunes
        if is_searchable(str(t.get("title") or ""), join_tier=str(t.get("joinTier") or ""))
        and not YOUTUBE_IN_ABC_RE.search(str(t.get("abc") or ""))
    ]
    if args.limit > 0:
        targets = targets[: args.limit]
    print(f"searchable tunes without youtube: {len(targets)} / {len(tunes)}", flush=True)

    attached = 0
    skipped = 0
    report: list[dict] = []

    for n, tune in enumerate(targets, start=1):
        title = str(tune.get("title") or "")
        key = str(tune.get("key") or "")
        cores = core_title_variants(title)
        # Prefer searching the most distinctive short core when the primary is an "or"/"/" alias bag.
        query = cores[0] if cores else title
        if len(cores) > 1:
            primary_words = significant_words(cores[0])
            if len(primary_words) <= 1:
                for alt in cores[1:]:
                    if len(significant_words(alt)) >= 1 and len(normalize_text(alt)) < len(normalize_text(cores[0])):
                        query = alt
                        break
        print(f"[{n}/{len(targets)}] {title}  query={query!r}", flush=True)
        candidates = yt_search(query, n=5, ytdlp=ytdlp)
        # Also try a second core (alias) if first search is empty/weak.
        if len(cores) > 1 and (not candidates or not pick_strict_match(cores, candidates)):
            alt = yt_search(cores[1], n=5, ytdlp=ytdlp)
            seen = {c["id"] for c in candidates}
            for c in alt:
                if c["id"] not in seen:
                    candidates.append(c)
        hit = pick_strict_match(cores, candidates)
        if not hit:
            skipped += 1
            top = [{"title": c.get("title"), "id": c.get("id")} for c in candidates[:3]]
            print(f"  skip (no strict match) top={top}", flush=True)
            report.append(
                {
                    "key": key,
                    "title": title,
                    "ok": False,
                    "reason": "no-strict-match",
                    "query": query,
                    "candidates": top,
                }
            )
        else:
            url = hit["link"]
            link_title = hit["title"]
            tune["abc"] = inject_youtube_link(str(tune.get("abc") or ""), url=url, title=link_title)
            tune["links"] = [{"title": link_title, "link": url}]
            attached += 1
            print(
                f"  OK score={hit['matchScore']} core={hit['matchedCore']!r} → {url} | {link_title}",
                flush=True,
            )
            report.append(
                {
                    "key": key,
                    "title": title,
                    "ok": True,
                    "query": query,
                    "matchedCore": hit["matchedCore"],
                    "matchScore": hit["matchScore"],
                    "link": url,
                    "videoTitle": link_title,
                    "channel": hit.get("channel"),
                }
            )
        if args.sleep > 0:
            time.sleep(args.sleep)

    pkg["tunes"] = tunes
    summary = dict(pkg.get("finalSummary") or {})
    summary["youtubeAttached"] = attached
    summary["youtubeSkipped"] = skipped
    pkg["finalSummary"] = summary
    Path(args.out_json).write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rebuild_abc_file(tunes, Path(args.out_abc))
    Path(args.report).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"done: attached={attached} skipped={skipped}", flush=True)
    print(f"wrote {args.out_json}", flush=True)
    print(f"wrote {args.out_abc}", flush=True)
    print(f"report {args.report}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
