#!/usr/bin/env python3
"""Serve offline enrich review (local media + in-process MIDI/OMR, no resolver auth).

After prefetching media, this server needs no internet:

  python3 scripts/oldtimefiddletunes/prefetch_media.py
  python3 scripts/oldtimefiddletunes/serve_review.py --rebuild
  → http://127.0.0.1:8766/

You can also open data/review.html as file:// for browse/select/export
(abcjs + media are local). Convert MIDI/OMR buttons need this server.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
RESOLVER_DIR = REPO_ROOT / "local-resolver"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(RESOLVER_DIR) not in sys.path:
    sys.path.insert(0, str(RESOLVER_DIR))

from common import MEDIA_DIR, REVIEW_HTML_PATH, VENDOR_DIR, ensure_dir  # noqa: E402
from make_enrich_review_html import main as build_review_main  # noqa: E402


def _safe_media_path(rel: str) -> Path | None:
    rel = str(rel or "").replace("\\", "/").lstrip("/")
    if not rel.startswith("media/") or ".." in rel.split("/"):
        return None
    path = (DATA_MEDIA := MEDIA_DIR.parent / rel).resolve()
    root = MEDIA_DIR.parent.resolve()
    if not str(path).startswith(str(root)):
        return None
    return path if path.is_file() else None


def midi_path_for_slug(slug: str) -> Path | None:
    p = MEDIA_DIR / f"{slug}.mid"
    return p if p.is_file() and p.stat().st_size > 0 else None


def pdf_path_for_slug(slug: str) -> Path | None:
    p = MEDIA_DIR / f"{slug}.pdf"
    return p if p.is_file() and p.stat().st_size > 0 else None


def convert_midi_file(path: Path) -> dict:
    from midi_to_abc import MidiAbcBuildOptions, convert_midi_to_abc_note_events

    midi_bytes = path.read_bytes()
    result = convert_midi_to_abc_note_events(
        midi_bytes,
        path.name,
        mode="melody",
        options=MidiAbcBuildOptions(mode="melody", note_length="1/8"),
    )
    abc = str((result or {}).get("abc") or "").strip()
    if not abc:
        raise RuntimeError("MIDI conversion returned no ABC")
    return {
        "abc": abc,
        "source": "midi",
        "strategy": "note_events",
        "mode": (result or {}).get("mode") or "melody",
    }


def convert_pdf_file(path: Path, title: str = "") -> dict:
    from sheet_image_transcribe import transcribe_sheet_image_sync

    data = path.read_bytes()
    result = transcribe_sheet_image_sync(
        data,
        path.name,
        composer_hint="",
    )
    abc = ""
    if isinstance(result, dict):
        melody = result.get("melody") if isinstance(result.get("melody"), dict) else {}
        abc = str((melody or {}).get("abc") or result.get("abc") or "").strip()
        # multi-tune pages: take first with abc
        if not abc and isinstance(result.get("tunes"), list):
            for row in result["tunes"]:
                if not isinstance(row, dict):
                    continue
                m = row.get("melody") if isinstance(row.get("melody"), dict) else {}
                abc = str((m or {}).get("abc") or row.get("abc") or "").strip()
                if abc:
                    break
    if not abc:
        raise RuntimeError("OMR returned no melody ABC")
    return {
        "abc": abc,
        "source": "omr",
        "title": title or path.stem,
    }


class ReviewHandler(BaseHTTPRequestHandler):
    review_html_path: Path = REVIEW_HTML_PATH
    data_root: Path = MEDIA_DIR.parent

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path or "/"

        if path in ("/", "/review.html", "/index.html"):
            self._serve_file(self.review_html_path, "text/html; charset=utf-8")
            return
        if path == "/health":
            self._json(200, {"ok": True, "offline": True})
            return
        if path.startswith("/media/") or path.startswith("/vendor/"):
            rel = path.lstrip("/")
            file_path = (self.data_root / rel).resolve()
            root = self.data_root.resolve()
            if not str(file_path).startswith(str(root)) or not file_path.is_file():
                self.send_error(404, "Not found")
                return
            ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            if file_path.suffix.lower() == ".mid":
                ctype = "audio/midi"
            self._serve_file(file_path, ctype)
            return

        self.send_error(404, "Not found")

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path or "/"
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON body"})
            return

        slug = str((body or {}).get("slug") or "").strip()
        title = str((body or {}).get("title") or "").strip()

        if path == "/convert-midi":
            if not slug:
                self._json(400, {"error": "Missing slug"})
                return
            midi = midi_path_for_slug(slug)
            if not midi:
                self._json(
                    404,
                    {"error": f"Local MIDI missing for {slug}. Run prefetch_media.py first."},
                )
                return
            try:
                self._json(200, convert_midi_file(midi))
            except Exception as exc:  # noqa: BLE001
                self._json(500, {"error": str(exc) or "MIDI convert failed"})
            return

        if path == "/convert-omr":
            if not slug:
                self._json(400, {"error": "Missing slug"})
                return
            pdf = pdf_path_for_slug(slug)
            if not pdf:
                self._json(
                    404,
                    {"error": f"Local PDF missing for {slug}. Run prefetch_media.py first."},
                )
                return
            try:
                self._json(200, convert_pdf_file(pdf, title=title))
            except Exception as exc:  # noqa: BLE001
                self._json(500, {"error": str(exc) or "OMR failed"})
            return

        self.send_error(404, "Not found")

    def _serve_file(self, path: Path, content_type: str) -> None:
        if not path.is_file():
            self.send_error(404, f"Missing {path}")
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(data)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--html", type=Path, default=REVIEW_HTML_PATH)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args(argv)

    ensure_dir(MEDIA_DIR)
    ensure_dir(VENDOR_DIR)

    if args.rebuild or not args.html.is_file():
        rc = build_review_main(["--out", str(args.html)])
        if rc != 0:
            return rc

    ReviewHandler.review_html_path = args.html.resolve()
    ReviewHandler.data_root = MEDIA_DIR.parent.resolve()
    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    print(f"Serving offline review at http://{args.host}:{args.port}/")
    print(f"HTML: {ReviewHandler.review_html_path}")
    print(f"Media: {MEDIA_DIR} (MIDI/PDF must be prefetched)")
    print("Convert: POST /convert-midi|/convert-omr  JSON {\"slug\": \"...\"}")
    print("Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
