#!/usr/bin/env python3
"""Host-network OpenAI gateway: prefer in-compose LLM, fall back to LM Studio."""

from __future__ import annotations

import logging
import os

import uvicorn

from openai_proxy import bases_from_env, create_proxy_app

logging.basicConfig(
    level=os.getenv("LLM_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def main() -> None:
    bases = bases_from_env()
    app = create_proxy_app(
        bases,
        service_name="abc2book-llm-gateway",
        health_ttl_seconds=float(os.getenv("LLM_GATEWAY_HEALTH_TTL_SECONDS", "15")),
    )
    host = os.getenv("LLM_GATEWAY_LISTEN_HOST", "0.0.0.0")
    port = int(os.getenv("LLM_GATEWAY_LISTEN_PORT", "12340"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("LLM_LOG_LEVEL", "info").lower())


if __name__ == "__main__":
    main()
