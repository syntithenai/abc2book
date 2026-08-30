"""Shared helpers for oldtimefiddletunes.net scrape → ABC."""

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
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
ENRICH_DIR = DATA_DIR / "enrich"
MEDIA_DIR = DATA_DIR / "media"
VENDOR_DIR = DATA_DIR / "vendor"
INDEX_PATH = DATA_DIR / "index.json"
MANIFEST_PATH = DATA_DIR / "manifest.json"
PACKAGE_PATH = DATA_DIR / "enrich_package.json"
REVIEW_HTML_PATH = DATA_DIR / "review.html"
SCRAPE_ABC_PATH = REPO_ROOT / "scrape" / "oldtimefiddletunes.abc"
TUNES_ABC_PATH = REPO_ROOT / "scrape" / "tunes.abc"

SITE_ORIGIN = "https://www.oldtimefiddletunes.net"
SITE_INDEX_URL = SITE_ORIGIN + "/"
BOOK_NAME = "old time"
SITE_TAG = "oldtimefiddletunes.net"
SRC_URL = "https://tunebook.net/scrape/oldtimefiddletunes.abc"

USER_AGENT = (
    "Mozilla/5.0 (compatible; abc2book-oldtimefiddletunes/1.0; "
    "+https://github.com/syntithenai/abc2book)"
)
DEFAULT_DELAY_SECONDS = 0.35

TUNE_ID_RE = re.compile(r"^% abcbook-tune_id\s+(\S+)", re.M)
TUNE_SPLIT = re.compile(r"\n(?=X:\s*\d+)")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def now_ms() -> int:
    return int(time.time() * 1000)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def slugify(value: str) -> str:
    s = str(value or "").strip().lower()
    s = re.sub(r"\.[a-z0-9]+$", "", s, flags=re.I)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s or "tune"


def slug_from_pdf_url(url: str) -> str:
    path = urllib.parse.urlparse(str(url or "")).path
    base = path.rsplit("/", 1)[-1]
    return slugify(base)


def absolute_url(href: str, base: str = SITE_ORIGIN + "/") -> str:
    href = str(href or "").strip()
    if not href:
        return ""
    return urllib.parse.urljoin(base, href)


def norm_title(s: str) -> str:
    s = str(s or "").lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^\w\s#]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def request_bytes(
    url: str,
    *,
    timeout: float = 60.0,
    headers: dict | None = None,
) -> tuple[int, dict, bytes]:
    req_headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, method="GET", headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            meta = {k.lower(): v for k, v in resp.headers.items()}
            return int(resp.status), meta, body
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        meta = {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}
        return int(exc.code), meta, body


def load_json(path: Path, default=None):
    if default is None:
        default = {}
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> Path:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_manifest() -> dict:
    data = load_json(MANIFEST_PATH, {"source": "oldtimefiddletunes", "entries": {}})
    if not isinstance(data, dict):
        data = {"source": "oldtimefiddletunes", "entries": {}}
    data.setdefault("source", "oldtimefiddletunes")
    data.setdefault("entries", {})
    return data


def save_manifest(manifest: dict) -> Path:
    manifest = dict(manifest or {})
    manifest["source"] = "oldtimefiddletunes"
    manifest["updated_at"] = utc_now_iso()
    return save_json(MANIFEST_PATH, manifest)


def split_tunes(text: str) -> list[str]:
    chunks = TUNE_SPLIT.split(text)
    out: list[str] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if re.match(r"^X:\s*\d+", chunk):
            out.append(chunk)
    return out


def primary_title(tune: str) -> str:
    m = re.search(r"^T:(.*)$", tune, re.M)
    return m.group(1).strip() if m else ""


def parse_youtube_start(url: str) -> int | None:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    qs = urllib.parse.parse_qs(parsed.query)
    raw = None
    if "t" in qs and qs["t"]:
        raw = qs["t"][0]
    elif "start" in qs and qs["start"]:
        raw = qs["start"][0]
    if raw is None and parsed.fragment:
        fm = re.search(r"(?:^|&)t=([^&]+)", parsed.fragment)
        if fm:
            raw = fm.group(1)
    if raw is None:
        return None
    raw = str(raw).strip()
    if re.fullmatch(r"\d+s?", raw, re.I):
        return int(raw.rstrip("sS"))
    total = 0
    matched = False
    for num, unit in re.findall(r"(\d+)([hms])", raw, re.I):
        matched = True
        n = int(num)
        u = unit.lower()
        if u == "h":
            total += n * 3600
        elif u == "m":
            total += n * 60
        else:
            total += n
    return total if matched else None


def candidate_id(source: str, abc: str) -> str:
    seed = f"{source}\n{(abc or '')[:800]}"
    digest = hashlib.md5(seed.encode("utf-8", errors="replace")).hexdigest()[:10]
    safe = re.sub(r"[^a-zA-Z0-9:_-]+", "-", str(source or "src"))[:40]
    return f"{safe}-{digest}"


def chord_count(abc: str) -> int:
    return len(re.findall(r'"\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:/[A-G][#b]?)?\s*"', abc or "", re.I))


def title_similarity(a: str, b: str) -> float:
    na = norm_title(a)
    nb = norm_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.85
    wa = na.split()
    wb = set(nb.split())
    if not wa:
        return 0.0
    overlap = sum(1 for w in wa if w in wb)
    return overlap / max(len(wa), len(wb) or 1)


def pick_best_candidate(candidates: list[dict], *, prefer_chords: bool = True) -> dict | None:
    list_ = [c for c in (candidates or []) if c and str(c.get("abc") or "").strip()]
    if not list_:
        return None

    def is_omr(c: dict) -> bool:
        return str(c.get("source") or "").lower().startswith("omr")

    non_omr = [c for c in list_ if not is_omr(c)]
    pool = non_omr or list_
    if prefer_chords:
        chorded = [c for c in pool if c.get("hasChords") or chord_count(c.get("abc") or "") >= 3]
        if chorded:
            pool = chorded
    pool = sorted(pool, key=lambda c: float(c.get("score") or 0), reverse=True)
    return pool[0]


def media_fingerprint(tune: dict) -> str:
    parts = [
        tune.get("pdfUrl") or "",
        tune.get("midiUrl") or "",
        "|".join(tune.get("audioUrls") or []),
        "|".join(tune.get("youtubeUrls") or []),
        tune.get("title") or "",
    ]
    return sha256_text("\n".join(parts))
