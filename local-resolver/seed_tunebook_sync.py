"""Seed the resolver's tunebook copy from ABC files and EuroSession-style import JSON.

The SPA replaces this with the live tunebook on its next save or page load; use this when the
web app hasn't synced yet. Posts to the running resolver (loopback + LOCAL_SERVICE_TOKEN from
.env) and refuses to overwrite a copy the SPA pushed unless --force.

    python3 seed_tunebook_sync.py ../scrape/*.abc ~/Downloads/eurosession-import-final.json
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

FIELD_RE = re.compile(r"^[A-Za-z]:")


def parse_abc_tunes(text: str, fallback_prefix: str = "") -> list[dict]:
    tunes = []
    for block in re.split(r"\n(?=X:)", text):
        if not block.startswith("X:"):
            continue
        tune: dict = {"books": [], "tags": [], "links": [], "hasNotes": False}
        links: dict[str, dict] = {}
        in_body = False
        for raw in block.splitlines():
            line = raw.rstrip()
            if line.startswith("X:") and not tune.get("x"):
                tune["x"] = line[2:].strip()
            elif line.startswith("T:") and not tune.get("name"):
                tune["name"] = line[2:].strip()
            elif line.startswith("C:") and not tune.get("composer"):
                tune["composer"] = line[2:].strip()
            elif line.startswith("B:"):
                tune["books"].append(line[2:].strip())
            elif line.startswith("K:"):
                in_body = True
            elif line.startswith("% abcbook-tune_id "):
                tune["id"] = line.split(" ", 2)[2].strip()
            elif line.startswith("% abcbook-tags "):
                tune["tags"] = [t.strip() for t in line.split(" ", 2)[2].split(",") if t.strip()]
            elif m := re.match(r"^% abcbook-link-(\d+) (.+)$", line):
                links.setdefault(m.group(1), {})["link"] = m.group(2).strip()
            elif m := re.match(r"^% abcbook-link-title-(\d+) (.+)$", line):
                links.setdefault(m.group(1), {})["title"] = m.group(2).strip()
            elif in_body and line and not line.startswith("%") and not FIELD_RE.match(line):
                tune["hasNotes"] = True
        tune["links"] = [links[k] for k in sorted(links, key=int) if links[k].get("link")]
        if not tune.get("id"):
            tune["id"] = f"{fallback_prefix}{tune.get('x', len(tunes))}"
        tunes.append(tune)
    return tunes


def parse_import_json(data: dict) -> list[dict]:
    tunes = []
    for item in data.get("tunes") or []:
        parsed = parse_abc_tunes(str(item.get("abc") or ""), fallback_prefix="import-")
        tune = parsed[0] if parsed else {"books": [], "tags": [], "links": []}
        tune["id"] = str(item.get("id") or tune.get("id"))
        tune["name"] = tune.get("name") or item.get("title")
        if not tune["books"] and data.get("book"):
            tune["books"] = [data["book"]]
        links = item.get("links")
        if isinstance(links, str):
            try:
                links = ast.literal_eval(links)
            except (ValueError, SyntaxError):
                links = []
        if isinstance(links, list) and links:
            tune["links"] = [l for l in links if isinstance(l, dict)]
        tunes.append(tune)
    return tunes


def _token() -> str:
    token = os.getenv("LOCAL_SERVICE_TOKEN", "")
    env = Path(__file__).with_name(".env")
    if not token and env.is_file():
        for line in env.read_text().splitlines():
            if line.startswith("LOCAL_SERVICE_TOKEN="):
                token = line.split("=", 1)[1].strip().strip("'\"")
    return token


def _call(url: str, body: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    with urlopen(Request(url, data=data, headers=headers, method="POST" if data else "GET"), timeout=60) as resp:
        return json.load(resp)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help=".abc tunebooks and/or import .json files")
    ap.add_argument("--url", default="http://127.0.0.1:8787", help="resolver base URL")
    ap.add_argument("--force", action="store_true", help="overwrite a tunebook the web app synced")
    args = ap.parse_args()
    endpoint = args.url.rstrip("/") + "/snapcast-playback/tunebook"

    try:
        existing = _call(endpoint + "?summary=1")
    except HTTPError as exc:
        if exc.code != 404:
            raise
        existing = None
    if existing and existing.get("source") != "seed" and not args.force:
        print(f"refusing: tunebook already synced by {existing.get('source') or 'the web app'} (use --force)")
        return 1
    by_id: dict[str, dict] = {}
    for path in args.files:
        if path.endswith(".json"):
            with open(path, encoding="utf-8") as fh:
                tunes = parse_import_json(json.load(fh))
        else:
            with open(path, encoding="utf-8", errors="replace") as fh:
                tunes = parse_abc_tunes(fh.read(), fallback_prefix=f"{path}:")
        for tune in tunes:
            by_id[str(tune["id"])] = tune
        print(f"{path}: {len(tunes)} tunes")
    result = _call(endpoint, {"source": "seed", "tunes": list(by_id.values())})
    print(f"saved {result.get('count')} tunes, {len(result.get('books') or {})} books, "
          f"{len(result.get('tags') or {})} tags")
    return 0


if __name__ == "__main__":
    sys.exit(main())
