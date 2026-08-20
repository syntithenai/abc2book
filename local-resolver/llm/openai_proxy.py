"""OpenAI-compatible reverse proxy with optional multi-backend failover."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Iterable, List, Optional, Sequence, Tuple

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger("abc2book-llm")

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


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", ""}


def normalize_base_url(url: str) -> str:
    return (url or "").strip().rstrip("/")


def join_backend_url(base: str, path: str) -> str:
    """Join an upstream base with a request path without duplicating /v1."""
    base = normalize_base_url(base)
    cleaned = (path or "").lstrip("/")
    if base.endswith("/v1") and (cleaned == "v1" or cleaned.startswith("v1/")):
        cleaned = cleaned[2:].lstrip("/")
    if not cleaned:
        return base
    return base + "/" + cleaned


def split_base_urls(value: str) -> List[str]:
    urls: List[str] = []
    for part in (value or "").split(","):
        cleaned = normalize_base_url(part)
        if cleaned and cleaned not in urls:
            urls.append(cleaned)
    return urls


def filter_request_headers(headers: Iterable[Tuple[str, str]]) -> dict:
    out = {}
    for key, value in headers:
        if key.lower() in HOP_BY_HOP:
            continue
        out[key] = value
    return out


def apply_upstream_auth(headers: dict, api_key: str | None) -> dict:
    """Replace client Authorization with the configured upstream API key when set."""
    if not api_key:
        return headers
    out = dict(headers)
    # Drop any inbound auth casing variants before setting the upstream key.
    for key in list(out.keys()):
        if key.lower() == "authorization":
            del out[key]
    out["Authorization"] = "Bearer " + api_key
    return out


def filter_response_headers(headers: httpx.Headers) -> dict:
    out = {}
    for key, value in headers.items():
        if key.lower() in HOP_BY_HOP:
            continue
        out[key] = value
    return out


def _clip_text(value: str, limit: int) -> str:
    text = value if isinstance(value, str) else str(value)
    if limit <= 0 or len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated {len(text) - limit} chars]"


def format_messages_for_log(messages, *, limit: int = 12000) -> str:
    if not isinstance(messages, list):
        return _clip_text(repr(messages), limit)
    parts = []
    for index, message in enumerate(messages):
        if not isinstance(message, dict):
            parts.append(f"[{index}] {message!r}")
            continue
        role = message.get("role", "?")
        content = message.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                (part.get("text") if isinstance(part, dict) else str(part))
                for part in content
            )
        parts.append(f"[{index}] {role}:\n{_clip_text(str(content or ''), limit)}")
    return "\n\n".join(parts)


def format_completion_for_log(body: bytes | str, *, limit: int = 20000) -> str:
    raw = body.decode("utf-8", errors="replace") if isinstance(body, (bytes, bytearray)) else str(body)
    try:
        import json

        data = json.loads(raw)
    except Exception:
        return _clip_text(raw, limit)

    if not isinstance(data, dict):
        return _clip_text(raw, limit)

    lines = []
    model = data.get("model")
    if model:
        lines.append(f"model={model}")
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        for index, choice in enumerate(choices):
            if not isinstance(choice, dict):
                lines.append(f"choice[{index}]={choice!r}")
                continue
            message = choice.get("message") or {}
            if not isinstance(message, dict):
                message = {}
            reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
            content = message.get("content") or ""
            if reasoning:
                lines.append(f"choice[{index}] reasoning:\n{_clip_text(str(reasoning), limit)}")
            if content:
                lines.append(f"choice[{index}] content:\n{_clip_text(str(content), limit)}")
            if not reasoning and not content:
                text = choice.get("text") or ""
                lines.append(f"choice[{index}] text:\n{_clip_text(str(text), limit)}")
    usage = data.get("usage")
    if isinstance(usage, dict):
        lines.append(
            "usage prompt={prompt} completion={completion} total={total}".format(
                prompt=usage.get("prompt_tokens"),
                completion=usage.get("completion_tokens"),
                total=usage.get("total_tokens"),
            )
        )
    if not lines:
        return _clip_text(raw, limit)
    return "\n".join(lines)


def should_log_path(path: str) -> bool:
    cleaned = (path or "").lstrip("/")
    if cleaned in {"", "health", "metrics"}:
        return False
    if cleaned.startswith("health/") or cleaned.startswith("metrics"):
        return False
    return True


class BackendPool:
    """Prefer the first healthy OpenAI-compatible backend; fall back on failure."""

    def __init__(
        self,
        bases: Sequence[str],
        *,
        probe_path: str = "/v1/models",
        health_ttl_seconds: float = 15.0,
        probe_timeout_seconds: float = 2.0,
        upstream_api_key: str | None = None,
    ):
        self.bases = [normalize_base_url(base) for base in bases if normalize_base_url(base)]
        if not self.bases:
            raise ValueError("At least one backend base URL is required")
        self.probe_path = probe_path if probe_path.startswith("/") else "/" + probe_path
        self.health_ttl_seconds = max(1.0, float(health_ttl_seconds))
        self.probe_timeout_seconds = max(0.5, float(probe_timeout_seconds))
        self.upstream_api_key = (upstream_api_key or "").strip() or None
        self._lock = asyncio.Lock()
        self._preferred_index = 0
        self._checked_at = 0.0
        self._ok: dict[str, bool] = {}

    def last_ok(self, base: str) -> bool:
        return bool(self._ok.get(normalize_base_url(base)))

    async def probe(self, client: httpx.AsyncClient, base: str) -> bool:
        url = join_backend_url(base, self.probe_path)
        headers = apply_upstream_auth({}, self.upstream_api_key)
        try:
            response = await client.get(url, headers=headers, timeout=self.probe_timeout_seconds)
            ok = response.status_code < 500
        except Exception as exc:
            logger.debug("probe failed for %s: %s", base, exc)
            ok = False
        self._ok[normalize_base_url(base)] = ok
        return ok

    async def refresh_preferred(self, client: httpx.AsyncClient, force: bool = False) -> str:
        async with self._lock:
            now = time.monotonic()
            if not force and now - self._checked_at < self.health_ttl_seconds:
                return self.bases[self._preferred_index]

            preferred = self._preferred_index
            for index, base in enumerate(self.bases):
                if await self.probe(client, base):
                    preferred = index
                    break
            self._preferred_index = preferred
            self._checked_at = now
            return self.bases[preferred]

    def order_for_request(self, preferred_base: str) -> List[str]:
        ordered = [preferred_base]
        for base in self.bases:
            if base not in ordered:
                ordered.append(base)
        return ordered

    def mark_failure(self, base: str) -> None:
        try:
            index = self.bases.index(base)
        except ValueError:
            return
        # Expire the cache so the next request re-probes, preferring later backends.
        self._checked_at = 0.0
        if index == self._preferred_index and len(self.bases) > 1:
            self._preferred_index = (index + 1) % len(self.bases)


def create_proxy_app(
    bases: Sequence[str],
    *,
    service_name: str = "abc2book-llm-proxy",
    health_ttl_seconds: float = 15.0,
    probe_path: str = "/v1/models",
    upstream_api_key: str | None = None,
    log_traffic: bool = False,
    log_body_chars: int = 20000,
) -> FastAPI:
    pool = BackendPool(
        bases,
        probe_path=probe_path,
        health_ttl_seconds=health_ttl_seconds,
        upstream_api_key=upstream_api_key,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool
        app.state.client = httpx.AsyncClient(timeout=None, follow_redirects=False)
        try:
            yield
        finally:
            await app.state.client.aclose()

    app = FastAPI(title=service_name, lifespan=lifespan)

    def log_request(path: str, method: str, body: bytes) -> None:
        if not log_traffic or not should_log_path(path):
            return
        logger.info("=== LLM request %s /%s (%s bytes) ===", method, path.lstrip("/"), len(body))
        if not body:
            return
        try:
            import json

            payload = json.loads(body.decode("utf-8", errors="replace"))
        except Exception:
            logger.info("%s", _clip_text(body.decode("utf-8", errors="replace"), log_body_chars))
            return
        if isinstance(payload, dict):
            model = payload.get("model")
            if model:
                logger.info("model=%s", model)
            messages = payload.get("messages")
            if messages is not None:
                logger.info("messages:\n%s", format_messages_for_log(messages, limit=log_body_chars))
            prompt = payload.get("prompt")
            if prompt is not None:
                logger.info("prompt:\n%s", _clip_text(str(prompt), log_body_chars))
            for key in ("max_tokens", "temperature", "stream", "top_p"):
                if key in payload:
                    logger.info("%s=%s", key, payload.get(key))
        else:
            logger.info("%s", _clip_text(repr(payload), log_body_chars))

    def log_response(path: str, status_code: int, body: bytes, streamed: bool = False) -> None:
        if not log_traffic or not should_log_path(path):
            return
        kind = "streamed response" if streamed else "response"
        logger.info(
            "=== LLM %s /%s status=%s (%s bytes) ===",
            kind,
            path.lstrip("/"),
            status_code,
            len(body),
        )
        if body:
            logger.info("%s", format_completion_for_log(body, limit=log_body_chars))

    @app.get("/health")
    async def health() -> JSONResponse:
        client: httpx.AsyncClient = app.state.client
        preferred = await pool.refresh_preferred(client)
        backends = [
            {"baseUrl": base, "ok": pool.last_ok(base), "preferred": base == preferred}
            for base in pool.bases
        ]
        any_ok = any(item["ok"] for item in backends)
        return JSONResponse(
            {
                "ok": any_ok,
                "service": service_name,
                "preferredBaseUrl": preferred if any_ok else None,
                "backends": backends,
                "upstreamAuthConfigured": bool(pool.upstream_api_key),
                "logTraffic": bool(log_traffic),
            },
            status_code=200 if any_ok else 503,
        )

    async def _proxy(request: Request, path: str) -> Response:
        client: httpx.AsyncClient = app.state.client
        preferred = await pool.refresh_preferred(client)
        body = await request.body()
        log_request(path, request.method, body)
        req_headers = apply_upstream_auth(
            filter_request_headers(request.headers.items()),
            pool.upstream_api_key,
        )
        query = request.url.query
        last_error: Optional[str] = None

        for base in pool.order_for_request(preferred):
            target = join_backend_url(base, path)
            if query:
                target = target + "?" + query
            try:
                upstream = await client.request(
                    request.method,
                    target,
                    headers=req_headers,
                    content=body,
                )
            except httpx.RequestError as exc:
                last_error = str(exc)
                logger.warning("backend %s unreachable: %s", base, exc)
                pool.mark_failure(base)
                continue

            if upstream.status_code >= 500 and base != pool.order_for_request(preferred)[-1]:
                # Try the next backend for hard upstream failures.
                last_error = f"HTTP {upstream.status_code}"
                pool.mark_failure(base)
                await upstream.aclose()
                continue

            response_headers = filter_response_headers(upstream.headers)
            content_type = upstream.headers.get("content-type", "")
            if "text/event-stream" in content_type or request.headers.get("accept", "").find("text/event-stream") >= 0:
                collected = bytearray()

                async def stream_body():
                    try:
                        async for chunk in upstream.aiter_bytes():
                            collected.extend(chunk)
                            yield chunk
                    finally:
                        await upstream.aclose()
                        log_response(path, upstream.status_code, bytes(collected), streamed=True)

                return StreamingResponse(
                    stream_body(),
                    status_code=upstream.status_code,
                    headers=response_headers,
                    media_type=content_type or "text/event-stream",
                )

            content = await upstream.aread()
            await upstream.aclose()
            log_response(path, upstream.status_code, content)
            return Response(
                content=content,
                status_code=upstream.status_code,
                headers=response_headers,
                media_type=content_type or None,
            )

        return JSONResponse(
            {
                "error": {
                    "message": "No OpenAI-compatible LLM backend is reachable",
                    "type": "backend_unavailable",
                    "detail": last_error or "all backends failed",
                    "backends": pool.bases,
                }
            },
            status_code=503,
        )

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    async def catch_all(path: str, request: Request) -> Response:
        return await _proxy(request, path)

    return app


def bases_from_env() -> List[str]:
    external = normalize_base_url(os.getenv("LLM_EXTERNAL_BASE_URL", ""))
    if external:
        return [external]

    configured = split_base_urls(os.getenv("LLM_BACKEND_BASE_URLS", ""))
    if configured:
        return configured

    primary = normalize_base_url(os.getenv("LLM_PRIMARY_BASE_URL", "http://127.0.0.1:12341"))
    fallback = normalize_base_url(os.getenv("LLM_FALLBACK_BASE_URL", "http://127.0.0.1:1234"))
    bases = []
    for base in (primary, fallback):
        if base and base not in bases:
            bases.append(base)
    return bases
