#!/usr/bin/env python3
"""Front proxy in front of local llama-server: generous request/response logging."""

from __future__ import annotations

import logging
import os

import uvicorn

from openai_proxy import create_proxy_app, env_bool, normalize_base_url

logging.basicConfig(
    level=os.getenv("LLM_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    upstream = normalize_base_url(
        os.getenv("LLM_LOCAL_UPSTREAM_BASE_URL", "http://127.0.0.1:8081")
    )
    app = create_proxy_app(
        [upstream],
        service_name="abc2book-llm-front",
        health_ttl_seconds=float(os.getenv("LLM_GATEWAY_HEALTH_TTL_SECONDS", "5")),
        log_traffic=env_bool("LLM_LOG_TRAFFIC", True),
        log_body_chars=int(os.getenv("LLM_LOG_BODY_CHARS", "50000")),
    )
    host = os.getenv("LLM_LISTEN_HOST", "0.0.0.0")
    port = int(os.getenv("LLM_LISTEN_PORT", "8080"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("LLM_LOG_LEVEL", "info").lower())


if __name__ == "__main__":
    main()
