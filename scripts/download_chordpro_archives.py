#!/usr/bin/env python3
"""
Download ChordPro / lyrics archives for personal local use.

Sources:
  - https://chordpro.lewe.com/  (static songs-manifest.json + assets)
  - https://spukes.melbourne/chordpro-song-library/  (Out-of-the-Box → Dropbox)

Default output: /home/stever/Documents/chordpro
Do not commit downloaded files into the repo. Do not redistribute.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, unquote

import requests

DEFAULT_OUT = Path("/home/stever/Documents/chordpro")
LEWE_BASE = "https://chordpro.lewe.com"
LEWE_MANIFEST_URL = f"{LEWE_BASE}/assets/songs-manifest.json"
SPUKES_PAGE = "https://spukes.melbourne/chordpro-song-library/"

SONG_EXTENSIONS = {".pro", ".cho", ".chopro", ".crd", ".txt", ".chordpro", ".onsong"}
SKIP_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".mp3",
    ".mp4",
    ".wav",
    ".docx",
    ".doc",
    ".zip",
}

USER_AGENT = "chordpro-archive/1.0 (+personal local mirror; contact: local)"


class DownloadStats:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.ok = 0
        self.skipped = 0
        self.failed = 0
        self.bytes = 0

    def add(self, status: str, nbytes: int = 0) -> None:
        with self.lock:
            if status == "ok":
                self.ok += 1
                self.bytes += nbytes
            elif status == "skipped":
                self.skipped += 1
            else:
                self.failed += 1

    def summary(self) -> str:
        return (
            f"ok={self.ok} skipped={self.skipped} failed={self.failed} "
            f"bytes={self.bytes}"
        )


def sanitize_path_part(name: str) -> str:
    """Keep readable names; strip path separators and control chars.

    Preserve intentional multiple spaces (Spukes has near-duplicate titles).
    """
    name = unescape(str(name or "")).replace("\x00", "")
    name = re.sub(r"[\r\n\t]+", " ", name)
    name = name.replace("/", "_").replace("\\", "_").strip()
    return name or "_unnamed"


def normalize_dropbox_path(path: str) -> str:
    """Dropbox paths occasionally embed newlines; strip control chars."""
    path = unescape(str(path or ""))
    path = re.sub(r"[\r\n\t]+", "", path)
    return path.strip() or "/"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def append_log(log_path: Path, record: dict) -> None:
    ensure_parent(log_path)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def should_keep_file(name: str, include_all: bool) -> bool:
    lower = name.lower()
    ext = Path(lower).suffix
    if include_all:
        return True
    if ext in SKIP_EXTENSIONS:
        return False
    if ext in SONG_EXTENSIONS:
        return True
    # Spukes naming is almost all .pro; keep extensionless text only if include_all
    return False


def request_with_retries(
    session: requests.Session,
    method: str,
    url: str,
    *,
    max_retries: int = 5,
    timeout: float = 60,
    **kwargs,
) -> requests.Response:
    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            resp = session.request(method, url, timeout=timeout, **kwargs)
            if resp.status_code in (429, 500, 502, 503, 504):
                wait = min(60, (2**attempt) + 0.5)
                time.sleep(wait)
                last_err = RuntimeError(f"HTTP {resp.status_code} for {url}")
                continue
            return resp
        except requests.RequestException as exc:
            last_err = exc
            time.sleep(min(60, (2**attempt) + 0.5))
    assert last_err is not None
    raise last_err


def save_bytes(path: Path, data: bytes, force: bool) -> str:
    if path.exists() and not force:
        return "skipped"
    ensure_parent(path)
    tmp = path.with_suffix(path.suffix + ".partial")
    tmp.write_bytes(data)
    tmp.replace(path)
    return "ok"


# ---------------------------------------------------------------------------
# Lewe
# ---------------------------------------------------------------------------


def iter_lewe_songs(manifest: dict) -> Iterable[tuple[str, str, Path]]:
    """Yield (archive, url, relative_path) for each song."""
    for archive in ("george", "olga"):
        letters = manifest.get(archive) or {}
        if not isinstance(letters, dict):
            continue
        for letter, artists in letters.items():
            if not isinstance(artists, dict):
                continue
            for artist, files in artists.items():
                if not isinstance(files, list):
                    continue
                for filename in files:
                    if not filename:
                        continue
                    parts = [
                        sanitize_path_part(letter),
                        sanitize_path_part(artist),
                        sanitize_path_part(filename),
                    ]
                    rel = Path(archive, *parts)
                    if archive == "george":
                        url_parts = ["assets", "songs", letter, artist, filename]
                    else:
                        url_parts = ["assets", "songs", "olga", letter, artist, filename]
                    encoded = "/".join(quote(str(p), safe="") for p in url_parts)
                    url = f"{LEWE_BASE}/{encoded}"
                    yield archive, url, rel


def download_lewe(
    out_root: Path,
    session: requests.Session,
    *,
    concurrency: int,
    force: bool,
    limit: int | None,
    log_path: Path,
) -> DownloadStats:
    stats = DownloadStats()
    meta_dir = out_root / "_meta"
    meta_dir.mkdir(parents=True, exist_ok=True)

    print("Lewe: fetching manifest…")
    resp = request_with_retries(session, "GET", LEWE_MANIFEST_URL)
    resp.raise_for_status()
    manifest = resp.json()
    (meta_dir / "lewe-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    jobs = list(iter_lewe_songs(manifest))
    if limit is not None:
        jobs = jobs[:limit]
    print(f"Lewe: {len(jobs)} files to consider")

    def one(item: tuple[str, str, Path]) -> None:
        archive, url, rel = item
        dest = out_root / "lewe" / rel
        if dest.exists() and not force:
            append_log(
                log_path,
                {"source": "lewe", "url": url, "path": str(dest), "status": "skipped"},
            )
            stats.add("skipped")
            return
        try:
            r = request_with_retries(session, "GET", url)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            status = save_bytes(dest, r.content, force=True)
            append_log(
                log_path,
                {
                    "source": "lewe",
                    "url": url,
                    "path": str(dest),
                    "status": status,
                    "bytes": len(r.content),
                },
            )
            stats.add(status, len(r.content))
        except Exception as exc:  # noqa: BLE001 — per-file isolation
            append_log(
                log_path,
                {
                    "source": "lewe",
                    "url": url,
                    "path": str(dest),
                    "status": "failed",
                    "error": str(exc),
                },
            )
            stats.add("failed")

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = [pool.submit(one, job) for job in jobs]
        done = 0
        for fut in as_completed(futures):
            fut.result()
            done += 1
            if done % 100 == 0 or done == len(futures):
                print(f"  Lewe progress {done}/{len(futures)} ({stats.summary()})")

    print(f"Lewe done: {stats.summary()}")
    return stats


# ---------------------------------------------------------------------------
# Spukes (Out-of-the-Box)
# ---------------------------------------------------------------------------


def parse_outofthebox_vars(html: str) -> dict:
    m = re.search(r"var\s+OutoftheBox_vars\s*=\s*", html)
    if not m:
        raise RuntimeError("OutoftheBox_vars not found on Spukes page")
    start = m.end()
    if html[start] != "{":
        raise RuntimeError("OutoftheBox_vars does not start with '{'")
    depth = 0
    for idx, ch in enumerate(html[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(html[start : idx + 1])
    raise RuntimeError("Failed to parse OutoftheBox_vars JSON")


def parse_filelist_entries(html_fragment: str) -> tuple[list[dict], list[dict]]:
    """Return (folders, files) with name/path/id."""
    entries = re.findall(
        r"<div class='entry (folder|file)[^']*'\s+([^>]+)>",
        html_fragment,
    )
    folders: list[dict] = []
    files: list[dict] = []
    for kind, attr_s in entries:
        attrs = dict(re.findall(r"([\w-]+)='([^']*)'", attr_s))
        item = {
            "name": unescape(attrs.get("data-name", "")),
            "path": unquote(attrs.get("data-url", "")),
            "id": attrs.get("data-id", ""),
        }
        if kind == "folder":
            folders.append(item)
        else:
            files.append(item)
    return folders, files


def spukes_get_filelist(
    session: requests.Session,
    ajax_url: str,
    account_id: str,
    listtoken: str,
    refresh_nonce: str | None,
    last_folder: str = "",
) -> dict:
    data = {
        "action": "outofthebox-get-filelist",
        "accountId": account_id,
        "listtoken": listtoken,
        "lastFolder": last_folder,
        "sort": "name:asc",
    }
    if refresh_nonce:
        data["nonce"] = refresh_nonce
    resp = request_with_retries(session, "POST", ajax_url, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def dropbox_path_to_local_rel(dropbox_path: str, name: str) -> str:
    """Map Dropbox path to a local relative path under spukes/."""
    raw = (dropbox_path or "").lstrip("/")
    if raw:
        parts = [sanitize_path_part(p) for p in raw.split("/") if p]
        return str(Path(*parts)) if parts else sanitize_path_part(name)
    return sanitize_path_part(name)


def collect_spukes_files(
    session: requests.Session,
    ajax_url: str,
    account_id: str,
    listtoken: str,
    refresh_nonce: str | None,
) -> list[dict]:
    """BFS folder listing; return unique file dicts with path/name/id."""
    by_path: dict[str, dict] = {}
    # Queue of lastFolder ids ('' = module root)
    queue: list[str] = [""]
    seen_folders: set[str] = set()

    while queue:
        folder_id = queue.pop(0)
        key = folder_id or "__root__"
        if key in seen_folders:
            continue
        seen_folders.add(key)

        listing = spukes_get_filelist(
            session,
            ajax_url,
            account_id,
            listtoken,
            refresh_nonce,
            last_folder=folder_id,
        )
        html_frag = listing.get("html") or ""
        folders, files = parse_filelist_entries(html_frag)
        label = folder_id or "/"
        print(f"  Spukes listed folder={label} files={len(files)} folders={len(folders)}")
        for f in files:
            original_path = unquote(f.get("path") or "")
            if re.search(r"[\x00-\x1f]", original_path) or re.search(
                r"[\x00-\x1f]", f.get("name") or ""
            ):
                # Corrupt Dropbox names (e.g. embedded newline) cannot be fetched.
                bad_name = sanitize_path_part(f.get("name") or original_path)
                print(f"  Spukes skipping corrupt name: {bad_name!r}")
                continue
            raw_path = normalize_dropbox_path(original_path)
            raw_name = sanitize_path_part(f.get("name") or Path(raw_path).name)
            path_key = raw_path or raw_name
            if not path_key or path_key in by_path:
                continue
            by_path[path_key] = {
                **f,
                "name": raw_name,
                "path": raw_path or f"/{raw_name}",
                "local_rel": dropbox_path_to_local_rel(
                    raw_path or f"/{raw_name}", raw_name
                ),
            }
        for folder in folders:
            fid = folder.get("id") or ""
            if fid and fid not in seen_folders:
                queue.append(fid)

    return list(by_path.values())


def download_spukes(
    out_root: Path,
    session: requests.Session,
    *,
    concurrency: int,
    force: bool,
    limit: int | None,
    include_all: bool,
    log_path: Path,
) -> DownloadStats:
    stats = DownloadStats()
    meta_dir = out_root / "_meta"
    meta_dir.mkdir(parents=True, exist_ok=True)

    print("Spukes: loading page config…")
    page = request_with_retries(session, "GET", SPUKES_PAGE, timeout=60)
    page.raise_for_status()
    html = page.text
    vars_obj = parse_outofthebox_vars(html)
    ajax_url = vars_obj["ajax_url"]
    refresh_nonce = vars_obj.get("refresh_nonce")

    token_m = re.search(r'data-token=["\']([^"\']+)', html)
    account_m = re.search(r'data-account-id=["\']([^"\']+)', html)
    if not token_m or not account_m:
        raise RuntimeError("Could not find Out-of-the-Box data-token / data-account-id")
    listtoken = token_m.group(1)
    account_id = account_m.group(1)

    print("Spukes: listing files…")
    files = collect_spukes_files(
        session, ajax_url, account_id, listtoken, refresh_nonce
    )
    (meta_dir / "spukes-filelist.json").write_text(
        json.dumps(files, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    filtered = [f for f in files if should_keep_file(f["name"], include_all)]
    skipped_type = len(files) - len(filtered)
    if skipped_type:
        print(f"Spukes: skipping {skipped_type} non-song files")
    if limit is not None:
        filtered = filtered[:limit]
    print(f"Spukes: {len(filtered)} files to consider")

    # Spukes/Dropbox is sensitive; keep concurrency modest
    workers = max(1, min(concurrency, 4))

    def one(item: dict) -> None:
        dropbox_path = item["path"]
        dest = out_root / "spukes" / item["local_rel"]
        dl_url = (
            f"{ajax_url}?action=outofthebox-download"
            f"&OutoftheBoxpath={quote(dropbox_path, safe='')}"
            f"&lastpath=%2F"
            f"&account_id={quote(account_id, safe='')}"
            f"&listtoken={quote(listtoken, safe='')}"
            f"&dl=1"
        )
        if dest.exists() and not force:
            append_log(
                log_path,
                {
                    "source": "spukes",
                    "url": dl_url,
                    "path": str(dest),
                    "status": "skipped",
                },
            )
            stats.add("skipped")
            return
        try:
            r = request_with_retries(
                session, "GET", dl_url, timeout=90, allow_redirects=True
            )
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}")
            if not r.content:
                raise RuntimeError("empty body")
            status = save_bytes(dest, r.content, force=True)
            append_log(
                log_path,
                {
                    "source": "spukes",
                    "url": dl_url,
                    "path": str(dest),
                    "status": status,
                    "bytes": len(r.content),
                },
            )
            stats.add(status, len(r.content))
        except Exception as exc:  # noqa: BLE001
            append_log(
                log_path,
                {
                    "source": "spukes",
                    "url": dl_url,
                    "path": str(dest),
                    "status": "failed",
                    "error": str(exc),
                },
            )
            stats.add("failed")
            # brief pause after failures to ease Dropbox pressure
            time.sleep(0.5)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, item) for item in filtered]
        done = 0
        for fut in as_completed(futures):
            fut.result()
            done += 1
            if done % 50 == 0 or done == len(futures):
                print(f"  Spukes progress {done}/{len(futures)} ({stats.summary()})")

    print(f"Spukes done: {stats.summary()}")
    return stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Download ChordPro archives from Lewe and Spukes for personal use."
    )
    p.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output root (default: {DEFAULT_OUT})",
    )
    p.add_argument(
        "--source",
        choices=("lewe", "spukes", "all"),
        default="all",
        help="Which source(s) to download",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=6,
        help="Max parallel downloads (Spukes capped at 4)",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if the local file already exists",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Download at most N files per source (smoke tests)",
    )
    p.add_argument(
        "--include-all",
        action="store_true",
        help="Spukes: keep non-song extensions (pdf, images, etc.)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    out_root: Path = args.out.expanduser().resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    meta_dir = out_root / "_meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    log_path = meta_dir / "download-log.jsonl"

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        }
    )

    print(f"Output: {out_root}")
    print(f"Source: {args.source}  concurrency={args.concurrency}  force={args.force}")
    if args.limit is not None:
        print(f"Limit: {args.limit} files per source")

    hard_fail = False
    totals = DownloadStats()

    if args.source in ("lewe", "all"):
        try:
            st = download_lewe(
                out_root,
                session,
                concurrency=args.concurrency,
                force=args.force,
                limit=args.limit,
                log_path=log_path,
            )
            totals.ok += st.ok
            totals.skipped += st.skipped
            totals.failed += st.failed
            totals.bytes += st.bytes
            if st.failed and st.ok == 0 and st.skipped == 0:
                hard_fail = True
        except Exception as exc:  # noqa: BLE001
            print(f"Lewe failed hard: {exc}", file=sys.stderr)
            hard_fail = True

    if args.source in ("spukes", "all"):
        try:
            st = download_spukes(
                out_root,
                session,
                concurrency=args.concurrency,
                force=args.force,
                limit=args.limit,
                include_all=args.include_all,
                log_path=log_path,
            )
            totals.ok += st.ok
            totals.skipped += st.skipped
            totals.failed += st.failed
            totals.bytes += st.bytes
            if st.failed and st.ok == 0 and st.skipped == 0:
                hard_fail = True
        except Exception as exc:  # noqa: BLE001
            print(f"Spukes failed hard: {exc}", file=sys.stderr)
            hard_fail = True

    print(f"All done: {totals.summary()}")
    if hard_fail:
        return 1
    # Soft per-file failures still exit 1 so resume/retry is obvious,
    # but only when something actually failed this run.
    if totals.failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
