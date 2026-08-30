#!/usr/bin/env python3
"""OMR + title lookup for EuroSession tune crops; assemble eurosession.abc."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "local-resolver"))
from sheet_image_abc_repair import abc_quality_warnings, looks_weak_abc  # noqa: E402


TITLE_KEY_HINT_RE = re.compile(
    r"\s*\(([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:/[A-G][#b]?)?)\)\s*$",
    re.I,
)


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_title(text: str) -> str:
    cleaned = TITLE_KEY_HINT_RE.sub("", str(text or "")).strip()
    cleaned = cleaned.replace("’", "'").replace("‘", "'").replace("´", "'")
    cleaned = strip_accents(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).lower()
    cleaned = re.sub(r"[^a-z0-9\s']", "", cleaned)
    return cleaned.strip()


def title_similarity(a: str, b: str) -> float:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    wa, wb = set(na.split()), set(nb.split())
    if not wa or not wb:
        return 0.0
    jaccard = len(wa & wb) / float(len(wa | wb))
    # Substring bonus only when the shorter name is most of the longer one.
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    if shorter in longer and len(shorter) >= max(10, int(0.55 * len(longer))):
        jaccard = max(jaccard, 0.85)
    # Penalize ultra-generic one-word matches ("bourree", "polska").
    if min(len(wa), len(wb)) == 1 and max(len(wa), len(wb)) >= 3:
        jaccard = min(jaccard, 0.4)
    return jaccard


def meter_for_type(tune_type: str) -> str:
    text = (tune_type or "").lower()
    if text in {"waltz", "slide"}:
        return "3/4"
    if text == "polka":
        return "2/4"
    if text == "slip jig":
        return "9/8"
    if text == "jig":
        return "6/8"
    if text == "hornpipe":
        return "4/4"
    return "4/4"


def http_json(url: str, timeout: float = 25.0) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-eurosession/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def http_post_json(url: str, payload: dict, timeout: float = 30.0) -> dict | None:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "abc2book-eurosession/1.0", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def lookup_thesession(title: str) -> dict | None:
    query = TITLE_KEY_HINT_RE.sub("", title).strip()
    # Drop trailing attribution crumbs.
    query = re.sub(r"\s*[-–—].*$", "", query).strip()
    if not query or len(normalize_title(query)) < 4:
        return None
    if "untitled" in normalize_title(query):
        return None
    if query.lower().startswith("untitled"):
        return None
    url = "https://thesession.org/tunes/search?format=json&q=" + urllib.parse.quote(query)
    body = http_json(url)
    if not isinstance(body, dict):
        return None
    tunes = body.get("tunes") or []
    best = None
    best_score = 0.0
    for tune in tunes[:12]:
        name = str(tune.get("name") or "")
        alias = str(tune.get("alias") or "")
        score = max(title_similarity(query, name), title_similarity(query, alias))
        if score > best_score:
            best_score = score
            best = tune
    if not best or best_score < 0.62:
        return None

    detail = http_json(f"https://thesession.org/tunes/{best['id']}?format=json")
    if not isinstance(detail, dict):
        return None
    settings = detail.get("settings") or []
    if not settings:
        return None
    setting = settings[0]
    abc_body = str(setting.get("abc") or "").strip()
    if not abc_body:
        return None
    if not re.search(r"^K:", abc_body, re.M) and not abc_body.startswith("X:"):
        header = [
            "X:1",
            "T:" + str(detail.get("name") or query),
            "R:" + str(detail.get("type") or ""),
            "M:" + meter_for_type(str(detail.get("type") or "")),
            "L:1/8",
            "K:" + str(setting.get("key") or "C"),
        ]
        abc = "\n".join(h for h in header if h.split(":", 1)[-1]) + "\n" + abc_body
    else:
        abc = abc_body
    return {
        "source": f"thesession:{best['id']}",
        "score": best_score,
        "matchedTitle": detail.get("name") or best.get("name"),
        "abc": abc,
        "url": best.get("url") or f"https://thesession.org/tunes/{best['id']}",
    }


def lookup_search_notation(resolver: str, title: str, abc_hint: str = "") -> dict | None:
    query = TITLE_KEY_HINT_RE.sub("", title).strip()
    if not query and not abc_hint:
        return None
    payload = {
        "title": query or "Untitled",
        "artist": "",
        "songType": "traditional_tune",
        "limit": 8,
    }
    if abc_hint:
        payload["abcHint"] = abc_hint
    body = http_post_json(
        resolver.rstrip("/") + "/search-notation",
        payload,
        timeout=90.0,
    )
    if not isinstance(body, dict):
        return None
    candidates = body.get("candidates") or body.get("results") or []
    if body.get("abc") and not candidates:
        candidates = [body]
    best = None
    best_score = 0.0
    for cand in candidates:
        if not isinstance(cand, dict):
            continue
        name = str(cand.get("title") or cand.get("name") or "")
        abc = str(cand.get("abc") or cand.get("notation") or "").strip()
        if not abc:
            continue
        score = title_similarity(query or name, name)
        # Contour / local matchScore is 0..100-ish when present.
        match_score = cand.get("matchScore") or cand.get("contourScore")
        if match_score is not None:
            try:
                score = max(score, float(match_score) / 100.0)
            except (TypeError, ValueError):
                pass
        if score > best_score:
            best_score = score
            best = cand
    if not best or best_score < 0.55:
        return None
    return {
        "source": "search-notation:" + str(best.get("source") or best.get("provider") or "web"),
        "score": best_score,
        "matchedTitle": best.get("title") or best.get("name"),
        "abc": str(best.get("abc") or best.get("notation") or "").strip(),
        "url": best.get("url") or best.get("sourceUrl") or "",
    }


def post_omr(resolver: str, image_path: Path, timeout: float = 600.0) -> dict | None:
    """Try HTTP OMR (needs auth token); fall back to docker-exec CLI."""
    token = (os.environ.get("RESOLVER_BEARER_TOKEN") or "").strip()
    if token:
        boundary = "----eurosessionBoundary7MA4YWxkTrZu0gW"
        file_bytes = image_path.read_bytes()
        filename = image_path.name
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: image/jpeg\r\n\r\n"
        ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
        req = urllib.request.Request(
            resolver.rstrip("/") + "/transcribe-sheet-image",
            data=body,
            headers={
                "User-Agent": "abc2book-eurosession/1.0",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": "Bearer " + token,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as exc:
            return {"error": str(exc)[:300]}

    return omr_via_docker(image_path, timeout=timeout)


def omr_via_docker(image_path: Path, timeout: float = 600.0) -> dict | None:
    """Run sheet_image_transcribe.py inside abc2book-local-resolver (no HTTP auth)."""
    import shutil
    import subprocess
    import tempfile

    container = os.environ.get("RESOLVER_DOCKER_CONTAINER", "abc2book-local-resolver")
    staging = Path("/home/stever/projects/abc2book/.eurosession-tmp")
    staging.mkdir(parents=True, exist_ok=True)
    staged = staging / image_path.name
    shutil.copy2(image_path, staged)
    container_path = f"/static/www/.eurosession-tmp/{image_path.name}"
    cmd = [
        "docker",
        "exec",
        "-e",
        "SHEET_IMAGE_PROGRESS=0",
        container,
        "bash",
        "-lc",
        f'PY="${{VISION_VENV_PYTHON:-/opt/vision-venv/bin/python}}"; '
        f'"$PY" /app/sheet_image_transcribe.py {container_path!r} --json',
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except Exception as exc:
        return {"error": str(exc)[:300]}
    if proc.returncode != 0:
        return {"error": (proc.stderr or proc.stdout or "omr docker failed")[:300]}
    # JSON may be preceded by warnings; find last JSON object.
    out = (proc.stdout or "").strip()
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        start = out.find("{")
        end = out.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(out[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {"error": "omr_json_parse_failed"}


def extract_omr_abc(omr: dict | None) -> tuple[str, str]:
    if not isinstance(omr, dict) or omr.get("error"):
        return "", str((omr or {}).get("error") or "omr_failed")
    # Multi-tune response: take first tune with melody.
    tunes = omr.get("tunes") if isinstance(omr.get("tunes"), list) else None
    candidates = tunes if tunes else [omr]
    for item in candidates:
        if not isinstance(item, dict):
            continue
        melody = item.get("melody") if isinstance(item.get("melody"), dict) else {}
        abc = str(melody.get("abc") or "").strip()
        if abc:
            return abc, "ok"
    return "", "omr_empty"


def polish_extracted_omr(
    abc: str,
    title: str,
    *,
    meter_hint: str | None = None,
    key_override: str | None = None,
) -> str:
    """Post-process raw HOMR ABC: decimals, headers, section-repeat heuristics."""
    text = (abc or "").strip()
    if not text:
        return ""
    from repair_abc import repair_omr_abc  # noqa: WPS433 — avoid import cycle

    return repair_omr_abc(
        text,
        title,
        meter_hint=meter_hint,
        key_override=key_override,
    )


# looks_weak_abc and abc_quality_warnings imported from sheet_image_abc_repair


def ensure_x_header(abc: str, index: int, title: str) -> str:
    text = abc.strip()
    if not text:
        return ""
    if not text.startswith("X:"):
        text = f"X:{index}\nT:{title}\n" + text
    else:
        text = re.sub(r"^X:\s*\d+", f"X:{index}", text, count=1, flags=re.M)
        if title and not re.search(r"^T:", text, re.M):
            text = re.sub(r"^(X:\d+)\n", r"\1\nT:" + title + "\n", text, count=1, flags=re.M)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="OMR + lookup EuroSession crops")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--resolver", default="http://127.0.0.1:8787")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--skip-omr", action="store_true")
    parser.add_argument("--omr-only-first", type=int, default=0, help="Only OMR first N tunes (rest lookup)")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    if not manifest_path.exists():
        print(f"missing {manifest_path}", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = [t for t in manifest.get("tunes") or [] if t.get("cropPath")]
    if args.limit > 0:
        tunes = tunes[: args.limit]

    results = []
    for i, entry in enumerate(tunes, start=1):
        title = str(entry.get("title") or f"Tune {i}")
        crop = Path(entry["cropPath"])
        print(f"[{i}/{len(tunes)}] {title}")

        lookup = lookup_thesession(title)
        if not lookup or lookup.get("score", 0) < 0.75:
            alt = lookup_search_notation(args.resolver, title)
            if alt and alt.get("score", 0) > (lookup or {}).get("score", 0):
                lookup = alt

        omr_abc = ""
        omr_status = "skipped"
        do_omr = not args.skip_omr and crop.is_file()
        if args.omr_only_first and i > args.omr_only_first:
            do_omr = False
        if do_omr:
            print("  OMR...")
            t0 = time.time()
            omr = post_omr(args.resolver, crop)
            omr_abc, omr_status = extract_omr_abc(omr)
            if omr_abc:
                omr_abc = polish_extracted_omr(omr_abc, title)
            print(f"  OMR {omr_status} in {time.time()-t0:.1f}s ({len(omr_abc)} chars)")

        prior_abc = str(entry.get("abc") or "").strip()
        prior_source = str(entry.get("abcSource") or "")
        if not omr_abc and prior_source == "omr" and not looks_weak_abc(prior_abc):
            omr_abc = prior_abc
            omr_status = entry.get("omrStatus") or "cached"

        # After OMR, retry search-notation with contour hint when title match is weak.
        if omr_abc and (not lookup or lookup.get("score", 0) < 0.78):
            print("  contour/local search with OMR ABC...")
            alt = lookup_search_notation(args.resolver, title, abc_hint=omr_abc)
            if alt and alt.get("score", 0) > (lookup or {}).get("score", 0):
                lookup = alt
                print(f"  contour hit {lookup.get('matchedTitle')} score={lookup.get('score'):.2f}")

        source = ""
        abc = ""
        matched = ""
        if lookup and lookup.get("score", 0) >= 0.62 and not looks_weak_abc(str(lookup.get("abc") or "")):
            # Prefer strong title match over weak OMR.
            if lookup["score"] >= 0.7 or looks_weak_abc(omr_abc):
                abc = str(lookup["abc"])
                source = lookup["source"]
                matched = str(lookup.get("matchedTitle") or "")
        if not abc and omr_abc and not looks_weak_abc(omr_abc):
            abc = omr_abc
            source = "omr"
        if not abc and lookup and lookup.get("score", 0) >= 0.62 and lookup.get("abc"):
            abc = str(lookup["abc"])
            source = lookup["source"]
            matched = str(lookup.get("matchedTitle") or "")
        if not abc and prior_abc and prior_source not in {"", "missing"}:
            abc = prior_abc
            source = prior_source
            matched = str(entry.get("lookupMatch") or "")

        abc = ensure_x_header(abc, i, title)
        row = dict(entry)
        row.update({
            "abcSource": source,
            "lookupMatch": matched,
            "lookupScore": (lookup or {}).get("score"),
            "omrStatus": omr_status,
            "abc": abc,
            "lookupUrl": (lookup or {}).get("url") or "",
        })
        # Keep the OMR transcript even when a Session/archive hit is selected,
        # so review UI can always offer it as a source option.
        if omr_abc and not looks_weak_abc(omr_abc):
            row["omrAbc"] = ensure_x_header(omr_abc, i, title)
        elif entry.get("omrAbc"):
            row["omrAbc"] = entry.get("omrAbc")
        results.append(row)
        print(f"  source={source or 'NONE'} match={matched or '-'}")

    # Preserve non-processed tunes when --limit is used.
    original_tunes = list(manifest.get("tunes") or [])
    by_key = {
        (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)): t
        for t in original_tunes
    }
    for row in results:
        by_key[(int(row.get("page") or 0), int(row.get("tuneIndex") or 0))] = row
    merged = sorted(by_key.values(), key=lambda t: (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)))

    # Write ABC from all merged entries that have abc, else only results if full run.
    abc_rows = [t for t in merged if t.get("abc") or t.get("cropPath")]
    abc_path = work / "eurosession.abc"
    blocks = []
    for i, row in enumerate(abc_rows, start=1):
        abc = str(row.get("abc") or "").strip()
        title = str(row.get("title") or f"Tune {i}")
        if not abc:
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
    abc_path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")

    manifest["tunes"] = merged
    manifest["abcPath"] = str(abc_path)
    manifest["resolvedCount"] = sum(
        1 for r in merged if r.get("abcSource") and r.get("abcSource") != "missing" and r.get("abc")
    )
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {abc_path} ({manifest['resolvedCount']}/{len(merged)} resolved)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
