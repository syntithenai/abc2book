"""Server-side copy of the user's tunebook, pushed by the SPA, for voice playback by tag or book.

The SPA's tunebook lives in the browser (IndexedDB) and Google Drive; the home resolver keeps a
compact copy (titles, books, tags, playable links) so local services such as voicecmd can say
"play the eurosession book". Routes live under /snapcast-playback/ so the SPA routes them to the
home resolver and the loopback LOCAL_SERVICE_TOKEN bypass covers reads.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from typing import Any, Awaitable, Callable

from fastapi import Body, Header, HTTPException, Request
from fastapi.responses import JSONResponse

AuthFn = Callable[[str | None], Awaitable[Any]]
CorsFn = Callable[[str | None], dict[str, str]]

MAX_TUNES = 50000
MAX_LINKS_PER_TUNE = 12
LINK_FIELDS = ("link", "title", "mediaKind", "startAt", "endAt")

_lock = threading.Lock()


def tunebook_sync_path() -> str:
    default = os.path.join(os.path.dirname(__file__), "data", "tunebook_sync.json")
    return os.getenv("TUNEBOOK_SYNC_PATH", "") or default


def _str_list(value: Any) -> list[str]:
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
    return out


def _compact_link(link: Any) -> dict | None:
    if not isinstance(link, dict):
        return None
    url = str(link.get("link") or "").strip()
    # data: URIs are inline blobs; nothing a server-side player could fetch.
    if not url or url.startswith("data:"):
        return None
    out = {k: link[k] for k in LINK_FIELDS if link.get(k) not in (None, "")}
    out["link"] = url
    return out


def compact_tune(tune: Any) -> dict | None:
    if not isinstance(tune, dict):
        return None
    tune_id = str(tune.get("id") or "").strip()
    name = str(tune.get("name") or tune.get("title") or "").strip()
    if not tune_id or not name:
        return None
    links = [c for c in (_compact_link(l) for l in (tune.get("links") or [])) if c][:MAX_LINKS_PER_TUNE]
    composer = tune.get("composer")
    if not composer and isinstance(tune.get("artists"), list) and tune["artists"]:
        composer = tune["artists"][0]
    return {
        "id": tune_id,
        "name": name,
        "composer": str(composer or "").strip(),
        "books": [b.lower() for b in _str_list(tune.get("books"))],
        "tags": _str_list(tune.get("tags")),
        "links": links,
        "hasNotes": bool(tune.get("hasNotes")),
    }


def compact_tunebook(tunes: Any) -> list[dict]:
    items = list(tunes.values()) if isinstance(tunes, dict) else list(tunes or [])
    out = [c for c in (compact_tune(t) for t in items[:MAX_TUNES]) if c]
    out.sort(key=lambda t: t["name"].lower())
    return out


def summarize(tunes: list[dict]) -> dict:
    books: dict[str, int] = {}
    tags: dict[str, int] = {}
    for tune in tunes:
        for book in tune["books"]:
            books[book] = books.get(book, 0) + 1
        for tag in tune["tags"]:
            key = tag.lower()
            tags[key] = tags.get(key, 0) + 1
    return {"books": books, "tags": tags}


def save_tunebook(tunes: list[dict], *, source: str = "") -> dict:
    payload = {"updatedAt": time.time(), "source": source, "count": len(tunes), "tunes": tunes}
    path = tunebook_sync_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _lock:
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tunebook_sync.")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    return payload


def load_tunebook() -> dict | None:
    path = tunebook_sync_path()
    if not os.path.isfile(path):
        return None
    with _lock, open(path, encoding="utf-8") as fh:
        return json.load(fh)


def register_tunebook_sync_routes(app, *, maybe_require_auth: AuthFn, cors_headers: CorsFn) -> None:
    @app.post("/snapcast-playback/tunebook")
    async def tunebook_sync_post(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            raw = body.get("tunes")
            if not isinstance(raw, (list, dict)):
                raise HTTPException(status_code=400, detail="Missing tunes")
            tunes = compact_tunebook(raw)
            saved = save_tunebook(tunes, source=str(body.get("source") or "")[:80])
            return JSONResponse(
                {"ok": True, "count": saved["count"], "updatedAt": saved["updatedAt"], **summarize(tunes)},
                headers=cors_headers(origin),
            )
        except HTTPException as exc:
            return JSONResponse({"ok": False, "error": exc.detail}, status_code=exc.status_code,
                                headers=cors_headers(origin))

    @app.get("/snapcast-playback/tunebook")
    async def tunebook_sync_get(request: Request, authorization: str | None = Header(default=None)):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
        except HTTPException as exc:
            return JSONResponse({"ok": False, "error": exc.detail}, status_code=exc.status_code,
                                headers=cors_headers(origin))
        data = load_tunebook()
        if data is None:
            return JSONResponse({"ok": False, "error": "No tunebook synced yet"}, status_code=404,
                                headers=cors_headers(origin))
        tunes = data.get("tunes") or []
        out = {"ok": True, "updatedAt": data.get("updatedAt"), "source": data.get("source") or "",
               "count": len(tunes), **summarize(tunes)}
        if request.query_params.get("summary") not in ("1", "true"):
            out["tunes"] = tunes
        return JSONResponse(out, headers=cors_headers(origin))
