#!/usr/bin/env python3
"""Broad ABC candidate search for EuroSession tunes; prefer quote-chords.

Stores candidates[] on each manifest tune and selects the best chorded source
when available. Does not re-run OMR.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from omr_and_lookup import (  # noqa: E402
    TITLE_KEY_HINT_RE,
    ensure_x_header,
    looks_weak_abc,
    normalize_title,
    title_similarity,
)
from repair_abc import (  # noqa: E402
    align_key,
    fetch_thesession_abc,
    lookup_abcnotation,
    lookup_thesession_wide,
    parse_title_key,
    query_variants,
    repair_omr_abc,
    rebuild_abc_file,
)


CHORD_RE = re.compile(r'"[^"\n]{1,16}"')
CHORD_LIKE_RE = re.compile(r'"\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:/[A-G][#b]?)?\s*"', re.I)


def chord_count(abc: str) -> int:
    return len(CHORD_LIKE_RE.findall(abc or ""))


def has_inline_chords(abc: str) -> bool:
    return chord_count(abc) >= 3


def candidate_id(source: str, abc: str) -> str:
    digest = hashlib.sha1((source + "\n" + (abc or "")[:800]).encode("utf-8", errors="replace")).hexdigest()[:10]
    safe = re.sub(r"[^a-zA-Z0-9:_-]+", "-", (source or "src"))[:40]
    return f"{safe}-{digest}"


def score_candidate(title: str, cand: dict) -> float:
    abc = cand.get("abc") or ""
    matched = cand.get("matchedTitle") or cand.get("title") or ""
    base = max(
        title_similarity(title, matched),
        title_similarity(TITLE_KEY_HINT_RE.sub("", title), matched),
        float(cand.get("score") or 0),
    )
    chords = chord_count(abc)
    # Strong preference for inline quote chords.
    if chords >= 8:
        base += 0.55
    elif chords >= 3:
        base += 0.35
    elif chords >= 1:
        base += 0.1
    if looks_weak_abc(abc):
        base -= 0.5
    # Slight preference for non-OMR when quality is similar.
    src = str(cand.get("source") or "")
    if src.startswith("omr"):
        base -= 0.05
    if "thesession" in src:
        base += 0.05
    return base


def http_json(url: str, timeout: float = 25.0):
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-eurosession/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:
        return None


def collect_session_setting_candidates(title: str, limit_tunes: int = 4) -> list[dict]:
    """Search The Session and collect multiple settings (some include chords)."""
    target = parse_title_key(title)
    found: list[dict] = []
    seen_ids: set[int] = set()
    for q in query_variants(title)[:4]:
        body = http_json("https://thesession.org/tunes/search?format=json&q=" + urllib.parse.quote(q))
        if not isinstance(body, dict):
            continue
        for tune in (body.get("tunes") or [])[:8]:
            try:
                tid = int(tune.get("id"))
            except (TypeError, ValueError):
                continue
            if tid in seen_ids:
                continue
            name = str(tune.get("name") or "")
            alias = str(tune.get("alias") or "")
            sim = max(title_similarity(title, name), title_similarity(title, alias))
            if sim < 0.55 and normalize_title(alias) != normalize_title(TITLE_KEY_HINT_RE.sub("", title)):
                # Still allow strong alias equality via accent fold
                if not (alias and normalize_title(alias) == normalize_title(re.sub(r"\([^)]*\)", "", TITLE_KEY_HINT_RE.sub("", title)))):
                    if sim < 0.7:
                        continue
            seen_ids.add(tid)
            detail = http_json(f"https://thesession.org/tunes/{tid}?format=json")
            if not isinstance(detail, dict):
                continue
            settings = detail.get("settings") or []
            from omr_and_lookup import meter_for_type

            for idx, setting in enumerate(settings[:12]):
                abc_body = str(setting.get("abc") or "").strip()
                if not abc_body:
                    continue
                key = str(setting.get("key") or "C")
                if not re.search(r"^K:", abc_body, re.M) and not abc_body.startswith("X:"):
                    header = [
                        "X:1",
                        "T:" + str(detail.get("name") or name),
                        "R:" + str(detail.get("type") or ""),
                        "M:" + meter_for_type(str(detail.get("type") or "")),
                        "L:1/8",
                        "K:" + key,
                    ]
                    abc = "\n".join(header) + "\n" + abc_body
                else:
                    abc = abc_body
                label = str(detail.get("name") or name)
                if len(settings) > 1:
                    label = f"{label} — setting {idx + 1} ({key})"
                found.append(
                    {
                        "source": f"thesession:{tid}",
                        "matchedTitle": label,
                        "abc": abc,
                        "url": f"https://thesession.org/tunes/{tid}#setting{setting.get('id') or idx}",
                        "score": sim,
                        "chords": chord_count(abc),
                    }
                )
            if len(seen_ids) >= limit_tunes:
                break
        time.sleep(0.1)
        if len(seen_ids) >= limit_tunes:
            break
    return found


def run_docker_search_notation(
    titles: list[str],
    out_path: Path,
    abc_hints: dict | None = None,
) -> dict:
    """Batch search_notation inside local-resolver; returns title->candidates."""
    staging = Path("/home/stever/projects/abc2book/.eurosession-tmp")
    staging.mkdir(parents=True, exist_ok=True)
    in_file = staging / "candidate_titles.json"
    hints_file = staging / "candidate_abc_hints.json"
    out_file = staging / "candidate_search.json"
    in_file.write_text(json.dumps(titles, ensure_ascii=False), encoding="utf-8")
    hints_file.write_text(json.dumps(abc_hints or {}, ensure_ascii=False), encoding="utf-8")
    if out_file.exists():
        out_file.unlink()

    script = r"""
import asyncio, json, re, sys, traceback
from pathlib import Path
sys.path.insert(0, '/app')
sys.path.insert(0, '/app/www/local-resolver')
from notation_fetch import search_notation

CHORD_RE = re.compile(r'"\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:/[A-G][#b]?)?\s*"', re.I)
titles = json.loads(Path('/app/www/.eurosession-tmp/candidate_titles.json').read_text())
# Optional OMR/current ABC hints keyed by title for contour matching.
hints = {}
hints_path = Path('/app/www/.eurosession-tmp/candidate_abc_hints.json')
if hints_path.is_file():
    try:
        hints = json.loads(hints_path.read_text())
    except Exception:
        hints = {}
out = {}

async def one(title):
    abc_hint = ''
    if isinstance(hints, dict):
        abc_hint = str(hints.get(title) or '').strip()
    try:
        body = await search_notation(title, '', song_type='traditional_tune', abc_hint=abc_hint)
    except Exception as e:
        return {'error': str(e)[:200], 'candidates': []}
    cands = (body or {}).get('candidates') or (body or {}).get('results') or []
    if isinstance(body, dict) and body.get('abc') and not cands:
        cands = [body]
    rows = []
    for c in cands[:12]:
        if not isinstance(c, dict):
            continue
        abc = (c.get('abc') or c.get('notation') or '').strip()
        if not abc:
            continue
        rows.append({
            'source': 'search:' + str(c.get('source') or c.get('provider') or 'web'),
            'matchedTitle': c.get('title') or c.get('name') or title,
            'abc': abc,
            'url': c.get('url') or c.get('sourceUrl') or '',
            'score': c.get('matchScore') or c.get('score'),
            'chords': len(CHORD_RE.findall(abc)),
        })
    return {'candidates': rows}

async def main():
    for i, title in enumerate(titles, 1):
        print(f'[{i}/{len(titles)}] {title}', flush=True)
        out[title] = await one(title)
        Path('/tmp/eurosession_candidate_search.json').write_text(
            json.dumps(out, ensure_ascii=False), encoding='utf-8'
        )

asyncio.run(main())
print('DONE', len(out), flush=True)
"""
    py_file = staging / "batch_search_notation.py"
    py_file.write_text(script, encoding="utf-8")
    cmd = [
        "docker",
        "exec",
        "-w",
        "/app",
        "abc2book-local-resolver",
        "python3",
        "/app/www/.eurosession-tmp/batch_search_notation.py",
    ]
    print("running docker batch search_notation…")
    proc = subprocess.run(cmd, capture_output=False, text=True, check=False)
    # Copy result out of container (/app/www is often read-only).
    tmp_host = staging / "candidate_search_from_docker.json"
    cp = subprocess.run(
        ["docker", "cp", "abc2book-local-resolver:/tmp/eurosession_candidate_search.json", str(tmp_host)],
        capture_output=True,
        text=True,
        check=False,
    )
    if cp.returncode != 0 or not tmp_host.exists():
        print("docker search produced no output file", proc.returncode, cp.stderr[:200] if cp.stderr else "")
        return {}
    try:
        data = json.loads(tmp_host.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data


def normalize_candidate(title: str, cand: dict) -> dict | None:
    abc = str(cand.get("abc") or "").strip()
    if not abc or looks_weak_abc(abc):
        return None
    source = str(cand.get("source") or "unknown")
    # Align key toward title for non-OMR; repair L/K for OMR.
    if source.startswith("omr"):
        abc = repair_omr_abc(abc, title)
    else:
        abc, _ = align_key(abc, title)
    matched = str(cand.get("matchedTitle") or cand.get("title") or title)
    row = {
        "id": candidate_id(source, abc),
        "source": source,
        "matchedTitle": matched,
        "url": str(cand.get("url") or ""),
        "score": float(cand.get("score") or 0),
        "chords": chord_count(abc),
        "abc": abc,
        "hasChords": has_inline_chords(abc),
    }
    row["rankScore"] = score_candidate(title, row)
    return row


def dedupe_candidates(cands: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for c in cands:
        # Dedupe on normalized body (ignore X:/T: renumbering)
        body = "\n".join(
            line
            for line in (c.get("abc") or "").splitlines()
            if not line.startswith(("X:", "T:", "% page="))
        )
        key = hashlib.sha1(body.encode("utf-8", errors="replace")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    out.sort(key=lambda r: (r.get("hasChords"), r.get("chords", 0), r.get("rankScore", 0)), reverse=True)
    return out


def pick_default(cands: list[dict]) -> dict | None:
    if not cands:
        return None
    chorded = [c for c in cands if c.get("hasChords")]
    pool = chorded or cands
    return max(pool, key=lambda c: c.get("rankScore", 0))


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch broad ABC candidates for EuroSession")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--skip-docker", action="store_true", help="Skip slow in-container web search")
    parser.add_argument("--docker-only-omr", action="store_true", help="Docker-search only OMR-sourced titles")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--resume", action="store_true", help="Reuse prior docker search JSON if present")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = list(manifest.get("tunes") or [])
    if args.limit > 0:
        tunes = tunes[: args.limit]

    docker_cache = work / "logs" / "candidate_search.json"
    docker_cache.parent.mkdir(parents=True, exist_ok=True)
    docker_results: dict = {}
    if args.resume and docker_cache.exists():
        docker_results = json.loads(docker_cache.read_text(encoding="utf-8"))
        print(f"resumed docker cache ({len(docker_results)} titles)")
    elif not args.skip_docker:
        titles = []
        abc_hints: dict[str, str] = {}
        for t in tunes:
            title = str(t.get("title") or "")
            src = str(t.get("abcSource") or "")
            if args.docker_only_omr and not src.startswith("omr"):
                continue
            clean = TITLE_KEY_HINT_RE.sub("", title).strip() or title
            titles.append(clean)
            abc = str(t.get("abc") or "").strip()
            if abc and "%% missing abc" not in abc and "K:" in abc:
                abc_hints[clean] = abc
                if title != clean:
                    abc_hints[title] = abc
        # unique preserve order
        seen = set()
        uniq = []
        for title in titles:
            key = normalize_title(title)
            if key in seen:
                continue
            seen.add(key)
            uniq.append(title)
        docker_results = run_docker_search_notation(uniq, docker_cache, abc_hints=abc_hints)

    chorded_selected = 0
    for i, entry in enumerate(tunes, start=1):
        title = str(entry.get("title") or f"Tune {i}")
        print(f"[{i}/{len(tunes)}] {title}")
        cands_raw: list[dict] = []

        # Current ABC always kept as an option.
        if entry.get("abc") and "%% missing abc" not in str(entry.get("abc") or ""):
            cands_raw.append(
                {
                    "source": entry.get("abcSource") or "current",
                    "matchedTitle": entry.get("lookupMatch") or title,
                    "abc": entry.get("abc"),
                    "url": entry.get("lookupUrl") or "",
                    "score": entry.get("lookupScore") or 0.5,
                }
            )

        # The Session settings (broad)
        try:
            cands_raw.extend(collect_session_setting_candidates(title))
        except Exception as exc:
            print(f"  session search err: {exc}")

        # Strong single session hit (wide)
        try:
            hit = lookup_thesession_wide(title, min_score=0.7)
            if hit:
                cands_raw.append(hit)
        except Exception:
            pass

        # abcnotation.com
        try:
            abcn = lookup_abcnotation(title, min_score=0.7)
            if abcn:
                cands_raw.append(abcn)
        except Exception:
            pass

        # Host-side local FolktuneFinder / Norbeck / JC (no docker required).
        try:
            repo_resolver = Path("/home/stever/projects/abc2book/local-resolver")
            if str(repo_resolver) not in sys.path:
                sys.path.insert(0, str(repo_resolver))
            from local_abc_resources import (  # type: ignore
                collect_local_abc_candidates,
                local_abc_resources_enabled,
                search_local_abc_by_contour,
            )
            import asyncio as _asyncio

            if local_abc_resources_enabled():
                local_rows = _asyncio.run(collect_local_abc_candidates(title, limit=6))
                for row in local_rows or []:
                    cands_raw.append(
                        {
                            "source": "local:" + str(row.get("source") or "abcresources"),
                            "matchedTitle": row.get("title") or title,
                            "abc": row.get("abc"),
                            "url": row.get("sourceUrl") or "",
                            "score": (row.get("matchScore") or 70) / 100.0,
                        }
                    )
                current_abc = str(entry.get("abc") or "").strip()
                if current_abc and "K:" in current_abc:
                    for row in search_local_abc_by_contour(current_abc, limit=4) or []:
                        cands_raw.append(
                            {
                                "source": "contour:" + str(row.get("source") or "abcresources"),
                                "matchedTitle": row.get("title") or title,
                                "abc": row.get("abc"),
                                "url": row.get("sourceUrl") or "",
                                "score": (row.get("matchScore") or row.get("contourScore") or 70) / 100.0,
                            }
                        )
        except Exception as exc:
            print(f"  local abc err: {exc}")

        # docker / web search results
        search_key = TITLE_KEY_HINT_RE.sub("", title).strip() or title
        # try a few key variants for cache lookup
        for key in {search_key, title, normalize_title(search_key)}:
            payload = docker_results.get(key) or docker_results.get(title)
            if payload:
                cands_raw.extend(payload.get("candidates") or [])
                break
        # also fuzzy: any docker key with high title similarity
        if not any((docker_results.get(k) for k in (search_key, title))):
            for k, payload in docker_results.items():
                if title_similarity(title, k) >= 0.85:
                    cands_raw.extend((payload or {}).get("candidates") or [])
                    break

        normalized = []
        for raw in cands_raw:
            row = normalize_candidate(title, raw)
            if row:
                normalized.append(row)
        candidates = dedupe_candidates(normalized)[:12]

        selected = pick_default(candidates)
        entry["candidates"] = [
            {
                "id": c["id"],
                "source": c["source"],
                "matchedTitle": c["matchedTitle"],
                "url": c.get("url") or "",
                "score": round(float(c.get("rankScore") or 0), 3),
                "chords": c.get("chords") or 0,
                "hasChords": bool(c.get("hasChords")),
                "abc": c["abc"],
            }
            for c in candidates
        ]
        if selected:
            entry["selectedCandidateId"] = selected["id"]
            entry["abc"] = ensure_x_header(selected["abc"], i, title)
            entry["abcSource"] = selected["source"]
            entry["lookupMatch"] = selected.get("matchedTitle") or ""
            entry["lookupScore"] = selected.get("rankScore")
            entry["lookupUrl"] = selected.get("url") or ""
            if selected.get("hasChords"):
                chorded_selected += 1
            print(
                f"  candidates={len(candidates)} chorded={sum(1 for c in candidates if c.get('hasChords'))} "
                f"selected={selected['source']} chords={selected.get('chords')} score={selected.get('rankScore'):.2f}"
            )
        else:
            entry["selectedCandidateId"] = ""
            print("  no candidates")

    rebuild_abc_file(work, tunes)
    manifest["tunes"] = tunes
    manifest["resolvedCount"] = sum(
        1
        for r in tunes
        if r.get("abcSource") not in (None, "", "missing") and "%% missing" not in str(r.get("abc") or "")
    )
    manifest["chordedCount"] = chorded_selected
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote manifest ({manifest['resolvedCount']} resolved, {chorded_selected} chorded selected)")

    # Refresh review HTML
    from make_abc_review_html import main as make_review

    sys.argv = ["make_abc_review_html.py", "--work", str(work)]
    make_review()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
