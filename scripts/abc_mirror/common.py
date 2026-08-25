"""Shared helpers for ABC archive mirrors."""

from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ABCRESOURCES = REPO_ROOT / "abcresources"
INCOMING = ABCRESOURCES / "_incoming"
USER_AGENT = (
    "Mozilla/5.0 (compatible; abc2book-abc-mirror/1.0; "
    "+local research mirror; https://github.com/syntithenai/abc2book)"
)
DEFAULT_DELAY_SECONDS = 0.6

ABC_BLOCK_RE = re.compile(r"(X:\s*\d+.*?)(?=\nX:\s*\d+|\Z)", re.S | re.I)
HREF_RE = re.compile(
    r'''href\s*=\s*(?:["']([^"']+)["']|([^\s>]+))''',
    re.I,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def manifest_path(source: str) -> Path:
    return ensure_dir(INCOMING / source) / "manifest.json"


def load_manifest(source: str) -> dict:
    path = manifest_path(source)
    if not path.is_file():
        return {"source": source, "entries": {}, "updated_at": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"source": source, "entries": {}, "updated_at": None}
    if not isinstance(data, dict):
        return {"source": source, "entries": {}, "updated_at": None}
    data.setdefault("source", source)
    data.setdefault("entries", {})
    return data


def save_manifest(source: str, manifest: dict) -> Path:
    path = manifest_path(source)
    manifest = dict(manifest or {})
    manifest["source"] = source
    manifest["updated_at"] = utc_now_iso()
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def request(
    url: str,
    *,
    method: str = "GET",
    timeout: float = 60.0,
    headers: dict | None = None,
    etag: str | None = None,
    last_modified: str | None = None,
) -> tuple[int, dict, bytes]:
    req_headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        req_headers.update(headers)
    if etag:
        req_headers["If-None-Match"] = etag
    if last_modified:
        req_headers["If-Modified-Since"] = last_modified
    req = urllib.request.Request(url, method=method.upper(), headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read() if method.upper() != "HEAD" else b""
            meta = {k.lower(): v for k, v in resp.headers.items()}
            return int(resp.status), meta, body
    except urllib.error.HTTPError as exc:
        body = exc.read() if method.upper() != "HEAD" else b""
        meta = {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}
        return int(exc.code), meta, body
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        # Try http↔https flip once for flaky hosts (e.g. Robinson).
        alt = None
        if url.startswith("https://"):
            alt = "http://" + url[len("https://") :]
        elif url.startswith("http://"):
            alt = "https://" + url[len("http://") :]
        if alt and alt != url:
            try:
                return request(
                    alt,
                    method=method,
                    timeout=timeout,
                    headers=headers,
                    etag=etag,
                    last_modified=last_modified,
                )
            except Exception:
                pass
        return 0, {}, str(exc).encode("utf-8", errors="replace")


def polite_sleep(delay: float = DEFAULT_DELAY_SECONDS) -> None:
    if delay > 0:
        time.sleep(delay)


def fetch_to_file(
    url: str,
    dest: Path,
    *,
    manifest_entry: dict | None = None,
    delay: float = DEFAULT_DELAY_SECONDS,
    force: bool = False,
) -> dict:
    """
    Download url to dest with conditional GET when possible.
    Returns result dict: status (fetched|not_modified|error), path, sha256, ...
    """
    ensure_dir(dest.parent)
    entry = dict(manifest_entry or {})
    etag = None if force else entry.get("etag")
    last_modified = None if force else entry.get("last_modified")
    status, meta, body = request(url, etag=etag, last_modified=last_modified)
    polite_sleep(delay)

    if status == 304 and dest.is_file():
        return {
            "status": "not_modified",
            "url": url,
            "local_path": str(dest),
            "sha256": entry.get("sha256") or sha256_file(dest),
            "etag": etag,
            "last_modified": last_modified,
            "bytes": dest.stat().st_size,
            "fetched_at": entry.get("fetched_at") or utc_now_iso(),
        }

    if status >= 400:
        return {
            "status": "error",
            "url": url,
            "http_status": status,
            "error": body[:200].decode("utf-8", errors="replace"),
        }

    dest.write_bytes(body)
    digest = sha256_bytes(body)
    return {
        "status": "fetched",
        "url": url,
        "local_path": str(dest),
        "sha256": digest,
        "etag": meta.get("etag"),
        "last_modified": meta.get("last-modified"),
        "bytes": len(body),
        "fetched_at": utc_now_iso(),
    }


def extract_hrefs(html: str, base_url: str) -> list[str]:
    urls = []
    for match in HREF_RE.finditer(html or ""):
        href = (match.group(1) or match.group(2) or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        absolute = urllib.parse.urljoin(base_url, href)
        urls.append(absolute.split("#")[0])
    return urls


def split_abc_tunes(text: str) -> list[str]:
    raw = str(text or "")
    if not raw.strip():
        return []
    blocks = ABC_BLOCK_RE.findall(raw)
    if blocks:
        return [block.strip() for block in blocks if block.strip()]
    if re.search(r"^X:\s*\d+", raw, re.M) or re.search(r"^K:", raw, re.M):
        return [raw.strip()]
    return []


def extract_title(abc: str) -> str:
    for line in str(abc or "").splitlines():
        if line.upper().startswith("T:"):
            return line[2:].strip()
    return ""
