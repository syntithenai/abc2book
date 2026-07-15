#!/usr/bin/env python3
"""Run as a pure OpenAI-compatible reverse proxy (no local model load)."""

from __future__ import annotations

import logging
import os
import sys

import uvicorn

from openai_proxy import create_proxy_app, env_bool, normalize_base_url

logging.basicConfig(
    level=os.getenv("LLM_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    external = normalize_base_url(os.getenv("LLM_EXTERNAL_BASE_URL", ""))
    if not external:
        print("LLM_EXTERNAL_BASE_URL is required for proxy mode", file=sys.stderr)
        sys.exit(1)

    upstream_api_key = (
        os.getenv("LLM_EXTERNAL_API_KEY")
        or os.getenv("LLM_API_KEY")
        or os.getenv("RESEARCH_LLM_API_KEY")
        or ""
    ).strip() or None

    app = create_proxy_app(
        [external],
        service_name="abc2book-llm-external-proxy",
        health_ttl_seconds=float(os.getenv("LLM_GATEWAY_HEALTH_TTL_SECONDS", "15")),
        upstream_api_key=upstream_api_key,
        log_traffic=env_bool("LLM_LOG_TRAFFIC", True),
        log_body_chars=int(os.getenv("LLM_LOG_BODY_CHARS", "50000")),
    )
    host = os.getenv("LLM_LISTEN_HOST", "0.0.0.0")
    port = int(os.getenv("LLM_LISTEN_PORT", "8080"))
    auth_note = "with upstream API key" if upstream_api_key else "without upstream API key"
    print(f"Proxying OpenAI API on {host}:{port} -> {external} ({auth_note})", flush=True)
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("LLM_LOG_LEVEL", "info").lower())


if __name__ == "__main__":
    main()
