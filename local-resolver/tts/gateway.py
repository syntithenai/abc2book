"""TTS gateway: prefer Kokoro (GPU/OpenAI) when healthy, else Piper (CPU)."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

logger = logging.getLogger("abc2book-tts-gateway")

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


def normalize_base_url(url: str) -> str:
    return (url or "").strip().rstrip("/")


def filter_request_headers(headers) -> dict:
    out = {}
    for key, value in headers:
        if key.lower() in HOP_BY_HOP:
            continue
        out[key] = value
    return out


def filter_response_headers(headers: httpx.Headers) -> dict:
    out = {}
    for key, value in headers.items():
        if key.lower() in HOP_BY_HOP:
            continue
        out[key] = value
    return out


@dataclass(frozen=True)
class TtsBackend:
    name: str
    kind: str  # openai | piper
    base_url: str
    probe_path: str


def backends_from_env() -> list[TtsBackend]:
    primary_url = normalize_base_url(os.getenv("TTS_PRIMARY_URL", "http://tts-gpu:8880"))
    fallback_url = normalize_base_url(os.getenv("TTS_FALLBACK_URL", "http://tts-cpu:5000"))
    primary_kind = (os.getenv("TTS_PRIMARY_KIND", "openai") or "openai").strip().lower()
    fallback_kind = (os.getenv("TTS_FALLBACK_KIND", "piper") or "piper").strip().lower()
    primary_probe = os.getenv("TTS_PRIMARY_PROBE_PATH", "/health").strip() or "/health"
    fallback_probe = os.getenv("TTS_FALLBACK_PROBE_PATH", "/info").strip() or "/info"
    return [
        TtsBackend("kokoro", primary_kind, primary_url, primary_probe),
        TtsBackend("piper", fallback_kind, fallback_url, fallback_probe),
    ]


class BackendSelector:
    """Prefer the first healthy backend; re-probe on a TTL or after failures."""

    def __init__(
        self,
        backends: list[TtsBackend],
        *,
        health_ttl_seconds: float = 15.0,
        probe_timeout_seconds: float = 3.0,
    ):
        if not backends:
            raise ValueError("At least one TTS backend is required")
        self.backends = backends
        self.health_ttl_seconds = max(1.0, float(health_ttl_seconds))
        self.probe_timeout_seconds = max(0.5, float(probe_timeout_seconds))
        self._lock = asyncio.Lock()
        self._preferred_index = 0
        self._checked_at = 0.0

    async def probe(self, client: httpx.AsyncClient, backend: TtsBackend) -> bool:
        path = backend.probe_path if backend.probe_path.startswith("/") else "/" + backend.probe_path
        url = backend.base_url + path
        try:
            response = await client.get(url, timeout=self.probe_timeout_seconds)
            if response.status_code == 404 and backend.kind == "openai":
                # Older Kokoro builds may not expose /health.
                models = await client.get(
                    backend.base_url + "/v1/models",
                    timeout=self.probe_timeout_seconds,
                )
                return models.status_code < 500
            return response.status_code < 500
        except Exception as exc:
            logger.debug("probe failed for %s (%s): %s", backend.name, url, exc)
            return False

    async def refresh_preferred(self, client: httpx.AsyncClient, force: bool = False) -> Optional[TtsBackend]:
        async with self._lock:
            now = time.monotonic()
            if not force and now - self._checked_at < self.health_ttl_seconds:
                return self.backends[self._preferred_index]

            preferred = 0
            for index, backend in enumerate(self.backends):
                if await self.probe(client, backend):
                    preferred = index
                    break
            self._preferred_index = preferred
            self._checked_at = now
            if not await self.probe(client, self.backends[preferred]):
                return None
            return self.backends[preferred]

    def order_for_request(self, preferred: Optional[TtsBackend]) -> list[TtsBackend]:
        if preferred is None:
            return list(self.backends)
        ordered = [preferred]
        for backend in self.backends:
            if backend.name != preferred.name:
                ordered.append(backend)
        return ordered

    def mark_failure(self, backend: TtsBackend) -> None:
        self._checked_at = 0.0
        try:
            index = next(i for i, item in enumerate(self.backends) if item.name == backend.name)
        except StopIteration:
            return
        if index == self._preferred_index and len(self.backends) > 1:
            self._preferred_index = (index + 1) % len(self.backends)


def piper_payload_from_openai(body: dict[str, Any]) -> dict[str, Any]:
    text = body.get("input") or body.get("text") or ""
    if not isinstance(text, str):
        text = str(text)
    payload: dict[str, Any] = {"text": text}
    # Piper uses the server-loaded voice by default. Only forward an explicit
    # piper-style voice id (e.g. en_US-lessac-medium), not Kokoro ids (af_bella).
    voice = body.get("voice")
    if isinstance(voice, str) and voice.strip() and "-" in voice.strip():
        payload["voice"] = voice.strip()
    speed = body.get("speed")
    if speed is not None:
        try:
            payload["length_scale"] = 1.0 / float(speed)
        except (TypeError, ValueError):
            pass
    return payload


def create_app() -> FastAPI:
    backends = backends_from_env()
    selector = BackendSelector(
        backends,
        health_ttl_seconds=float(os.getenv("TTS_GATEWAY_HEALTH_TTL_SECONDS", "15")),
        probe_timeout_seconds=float(os.getenv("TTS_GATEWAY_PROBE_TIMEOUT_SECONDS", "3")),
    )
    service_name = os.getenv("TTS_GATEWAY_SERVICE_NAME", "abc2book-tts-gateway")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.selector = selector
        app.state.client = httpx.AsyncClient(timeout=None, follow_redirects=False)
        try:
            yield
        finally:
            await app.state.client.aclose()

    app = FastAPI(title=service_name, lifespan=lifespan)

    async def backend_status(client: httpx.AsyncClient) -> list[dict[str, Any]]:
        preferred = await selector.refresh_preferred(client)
        rows = []
        for backend in backends:
            ok = await selector.probe(client, backend)
            rows.append(
                {
                    "name": backend.name,
                    "kind": backend.kind,
                    "baseUrl": backend.base_url,
                    "ok": ok,
                    "preferred": preferred is not None and backend.name == preferred.name,
                }
            )
        return rows

    @app.get("/health")
    async def health() -> JSONResponse:
        client: httpx.AsyncClient = app.state.client
        rows = await backend_status(client)
        preferred = next((row for row in rows if row["preferred"] and row["ok"]), None)
        any_ok = any(row["ok"] for row in rows)
        return JSONResponse(
            {
                "ok": any_ok,
                "service": service_name,
                "activeBackend": preferred["name"] if preferred else None,
                "activeKind": preferred["kind"] if preferred else None,
                "backends": rows,
            },
            status_code=200 if any_ok else 503,
        )

    async def forward_openai(
        client: httpx.AsyncClient,
        backend: TtsBackend,
        request: Request,
        path: str,
        body: bytes,
    ) -> Response:
        target = backend.base_url + "/" + path.lstrip("/")
        if request.url.query:
            target = target + "?" + request.url.query
        upstream = await client.request(
            request.method,
            target,
            headers=filter_request_headers(request.headers.items()),
            content=body,
        )
        return Response(
            content=await upstream.aread(),
            status_code=upstream.status_code,
            headers=filter_response_headers(upstream.headers),
            media_type=upstream.headers.get("content-type"),
        )

    async def synthesize_via_piper(
        client: httpx.AsyncClient,
        backend: TtsBackend,
        body: bytes,
    ) -> Response:
        import json

        try:
            payload_in = json.loads(body.decode("utf-8") if body else "{}")
        except json.JSONDecodeError as exc:
            return JSONResponse(
                {"error": {"message": "Invalid JSON body", "detail": str(exc)}},
                status_code=400,
            )
        if not isinstance(payload_in, dict):
            return JSONResponse(
                {"error": {"message": "Expected JSON object body"}},
                status_code=400,
            )
        payload = piper_payload_from_openai(payload_in)
        if not str(payload.get("text") or "").strip():
            return JSONResponse(
                {"error": {"message": "Missing required field: input"}},
                status_code=400,
            )
        upstream = await client.post(
            backend.base_url + "/synthesize",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if upstream.status_code >= 500:
            return Response(
                content=await upstream.aread(),
                status_code=upstream.status_code,
                headers=filter_response_headers(upstream.headers),
                media_type=upstream.headers.get("content-type"),
            )
        return Response(
            content=await upstream.aread(),
            status_code=upstream.status_code,
            headers=filter_response_headers(upstream.headers),
            media_type=upstream.headers.get("content-type") or "audio/wav",
        )

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    async def catch_all(path: str, request: Request) -> Response:
        client: httpx.AsyncClient = app.state.client
        preferred = await selector.refresh_preferred(client)
        body = await request.body()
        last_error: Optional[str] = None

        for backend in selector.order_for_request(preferred):
            try:
                if backend.kind == "piper" and path.rstrip("/") == "v1/audio/speech":
                    response = await synthesize_via_piper(client, backend, body)
                elif backend.kind == "openai":
                    response = await forward_openai(client, backend, request, path, body)
                else:
                    continue
            except httpx.RequestError as exc:
                last_error = str(exc)
                logger.warning("backend %s unreachable: %s", backend.name, exc)
                selector.mark_failure(backend)
                continue

            if response.status_code >= 500 and backend != selector.backends[-1]:
                last_error = f"HTTP {response.status_code}"
                selector.mark_failure(backend)
                continue
            return response

        return JSONResponse(
            {
                "error": {
                    "message": "No TTS backend is reachable",
                    "type": "backend_unavailable",
                    "detail": last_error or "all backends failed",
                    "backends": [backend.base_url for backend in backends],
                }
            },
            status_code=503,
        )

    return app


app = create_app()
