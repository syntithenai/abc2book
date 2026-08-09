"""
Internal score-convert sidecar: MuseScore CLI + MIDI import orchestrator.

Not exposed publicly — called by tunebook-resolver-light with X-Tunebook-Internal-Token.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import time
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from midi_convert import MAX_MIDI_IMPORT_BYTES
from midi_import_orchestrator import import_midi_bytes
from musescore_convert import convert_score_file_to_musicxml, musescore_cli_available
from score_convert_midi import midi_import_kwargs_from_request

app = FastAPI(title="tunebook-score-convert")

SCORE_CONVERT_SECRET = os.getenv("SCORE_CONVERT_SECRET", "").strip()
PORT = int(os.getenv("PORT", "8790"))


def require_internal_token(token: str | None) -> None:
    if not SCORE_CONVERT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Score convert service is not configured (missing SCORE_CONVERT_SECRET)",
        )
    if not token or token.strip() != SCORE_CONVERT_SECRET:
        raise HTTPException(status_code=401, detail="Invalid internal token")


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "tunebook-score-convert",
        "musescoreCli": musescore_cli_available(),
    }


@app.post("/score2xml")
async def score2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    x_tunebook_internal_token: str | None = Header(default=None, alias="X-Tunebook-Internal-Token"),
):
    require_internal_token(x_tunebook_internal_token)
    if file is None:
        raise HTTPException(status_code=400, detail="Missing score file upload")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Score file is empty")
    if len(data) > MAX_MIDI_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Score file too large (limit is {0} bytes)".format(MAX_MIDI_IMPORT_BYTES),
        )

    suffix = os.path.splitext(file.filename or "")[1].lower() or ".mscx"
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as temp_dir:
        in_path = os.path.join(temp_dir, "upload" + suffix)
        with open(in_path, "wb") as handle:
            handle.write(data)
        xml = await asyncio.to_thread(
            convert_score_file_to_musicxml,
            in_path,
            temp_dir,
            output_stem="score_import",
        )
    duration_ms = int((time.monotonic() - started) * 1000)
    return Response(
        content=xml,
        media_type="application/xml",
        headers={
            "X-Tunebook-Convert-Duration-Ms": str(duration_ms),
            "X-Tunebook-Convert-Input-Bytes": str(len(data)),
        },
    )


@app.post("/midi2abc")
async def midi2abc(
    request: Request,
    file: UploadFile | None = File(default=None),
    mode: str | None = None,
    strategy: str = "auto",
    x_tunebook_internal_token: str | None = Header(default=None, alias="X-Tunebook-Internal-Token"),
):
    require_internal_token(x_tunebook_internal_token)
    if file is None:
        raise HTTPException(status_code=400, detail="Missing MIDI file upload")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="MIDI file is empty")
    if len(data) > MAX_MIDI_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="MIDI file too large (limit is {0} bytes)".format(MAX_MIDI_IMPORT_BYTES),
        )

    kwargs = midi_import_kwargs_from_request(request, mode=mode, strategy=strategy)
    started = time.monotonic()
    result = await asyncio.to_thread(
        import_midi_bytes,
        data,
        file.filename or "import.mid",
        **kwargs,
    )
    duration_ms = int((time.monotonic() - started) * 1000)
    if isinstance(result, dict):
        result = dict(result)
        result["durationMs"] = duration_ms
        result["inputBytes"] = len(data)
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
