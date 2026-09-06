"""LLM assessment of yoga community blog posts for child-safe, respectful content.

Used as a gate before publish only. Failures are stored on the blog so authors
can keep a draft; publish is blocked until assessment passes.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

LLM_TIMEOUT_SECONDS = float(os.getenv("BLOG_ASSESS_LLM_TIMEOUT", "45") or "45")
LLM_MAX_TOKENS = int(os.getenv("BLOG_ASSESS_LLM_MAX_TOKENS", "400") or "400")
# Soft cap so prompts stay bounded (body is joined paragraphs).
MAX_BODY_CHARS = 12_000

_SYSTEM = (
    "You are a content-safety reviewer for a yoga and wellness community blog. "
    "The audience includes families and minors. Posts must stay child-safe and respectful. "
    "Reject content that includes sexual content, pornography, graphic violence, hate or "
    "harassment, discrimination, self-harm or suicide encouragement, illegal activity "
    "instructions, dangerous medical advice presented as fact, or anything otherwise "
    "inappropriate for a general family audience. "
    "Allow normal yoga, meditation, anatomy, and wellness discussion, including mild "
    "criticism of trends, when it is not abusive or unsafe. "
    "Respond with JSON only: {\"ok\": true|false, \"reason\": \"...\"}. "
    "If ok is true, reason must be an empty string. "
    "If ok is false, reason must be one clear sentence the author can read, explaining "
    "what is inappropriate without quoting graphic details."
)

_DEFAULT_FAIL_REASON = (
    "This post did not pass our content review for a child-safe, respectful community."
)

_ASSESS_UNAVAILABLE_REASON = (
    "Content could not be reviewed right now. Your draft was saved; try publishing again later."
)


def _llm_config() -> dict[str, str]:
    """Prefer Cloud light PROVIDER_LLM_*; fall back to RESEARCH_LLM_*."""
    base = (
        os.getenv("PROVIDER_LLM_BASE_URL")
        or os.getenv("RESEARCH_LLM_BASE_URL")
        or ""
    ).strip().rstrip("/")
    key = (
        os.getenv("PROVIDER_LLM_API_KEY")
        or os.getenv("RESEARCH_LLM_API_KEY")
        or ""
    ).strip()
    model = (
        os.getenv("PROVIDER_LLM_MODEL")
        or os.getenv("RESEARCH_LLM_MODEL")
        or "gpt-4o-mini"
    ).strip()
    if not base:
        raise ValueError("PROVIDER_LLM_BASE_URL (or RESEARCH_LLM_BASE_URL) is not configured")
    return {"apiUrl": base, "apiKey": key, "model": model}


def _llm_chat_url(cfg: dict[str, str]) -> str:
    base = cfg["apiUrl"]
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return base + "/chat/completions"
    return base.rstrip("/") + "/v1/chat/completions"


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _body_text(body: list[str] | str | None) -> str:
    if body is None:
        return ""
    if isinstance(body, str):
        return body.strip()
    parts = [str(p).strip() for p in body if str(p).strip()]
    return "\n\n".join(parts)


def _build_user_prompt(*, title: str, summary: str, body: list[str] | str | None) -> str:
    body_text = _body_text(body)
    if len(body_text) > MAX_BODY_CHARS:
        body_text = body_text[: MAX_BODY_CHARS - 1].rstrip() + "…"
    return (
        "Assess this blog post.\n\n"
        f"Title:\n{title or '(empty)'}\n\n"
        f"Summary:\n{summary or '(empty)'}\n\n"
        f"Body:\n{body_text or '(empty)'}\n"
    )


def _parse_assessment_payload(raw: str) -> tuple[bool, str]:
    text = (raw or "").strip()
    if not text:
        return False, _DEFAULT_FAIL_REASON
    # Strip optional markdown fences.
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Model sometimes returns prose; treat non-empty clear "ok" signals carefully.
        lowered = text.lower()
        if re.search(r'"ok"\s*:\s*true', lowered) or re.match(r"^\s*ok\b", lowered):
            return True, ""
        reason = _normalize_space(text)
        if len(reason) > 400:
            reason = reason[:397].rstrip() + "…"
        return False, reason or _DEFAULT_FAIL_REASON
    if not isinstance(data, dict):
        return False, _DEFAULT_FAIL_REASON
    ok = bool(data.get("ok"))
    reason = _normalize_space(str(data.get("reason") or ""))
    if ok:
        return True, ""
    if len(reason) > 400:
        reason = reason[:397].rstrip() + "…"
    return False, reason or _DEFAULT_FAIL_REASON


async def assess_blog_content(
    *,
    title: str,
    summary: str,
    body: list[str] | str | None,
) -> dict[str, Any]:
    """Return {ok, reason, model}. On LLM/config failure, ok=False with a soft reason."""
    try:
        cfg = _llm_config()
    except ValueError:
        return {
            "ok": False,
            "reason": _ASSESS_UNAVAILABLE_REASON,
            "model": "",
        }

    headers = {"Content-Type": "application/json"}
    if cfg["apiKey"]:
        headers["Authorization"] = f"Bearer {cfg['apiKey']}"

    try:
        timeout = httpx.Timeout(LLM_TIMEOUT_SECONDS)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                _llm_chat_url(cfg),
                headers=headers,
                json={
                    "model": cfg["model"],
                    "messages": [
                        {"role": "system", "content": _SYSTEM},
                        {
                            "role": "user",
                            "content": _build_user_prompt(
                                title=title,
                                summary=summary,
                                body=body,
                            ),
                        },
                    ],
                    "temperature": 0.1,
                    "max_tokens": LLM_MAX_TOKENS,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return {
            "ok": False,
            "reason": _ASSESS_UNAVAILABLE_REASON,
            "model": cfg.get("model") or "",
        }

    choices = data.get("choices") or []
    if not choices:
        return {
            "ok": False,
            "reason": _ASSESS_UNAVAILABLE_REASON,
            "model": cfg["model"],
        }
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    ok, reason = _parse_assessment_payload(content)
    return {"ok": ok, "reason": reason, "model": cfg["model"]}
