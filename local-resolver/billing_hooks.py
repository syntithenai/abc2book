"""Helpers to meter billable resolver activity."""

from __future__ import annotations

from typing import Any

from billing import billing_enabled, record_usage, should_bill_user
from billing_rates import (
    amt_job_cost_millicents,
    egress_cost_millicents,
    llm_token_cost_millicents,
    ocr_flat_cost_millicents,
    scrape_cost_millicents,
    stem_job_cost_millicents,
    whisper_cost_millicents,
)


class BillingContext:
    def __init__(
        self,
        *,
        free_allowlist: set[str],
        embedded_allowlist: set[str],
    ):
        self.free_allowlist = free_allowlist
        self.embedded_allowlist = embedded_allowlist

    def enabled_for(self, email: str | None) -> bool:
        if not billing_enabled() or not email:
            return False
        return should_bill_user(
            email,
            free_allowlist=self.free_allowlist,
            embedded_allowlist=self.embedded_allowlist,
        )

    def record(
        self,
        email: str | None,
        millicents: int,
        *,
        usage_type: str,
        detail: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not email or millicents <= 0:
            return {"ok": True, "skipped": True}
        return record_usage(
            email,
            millicents,
            usage_type=usage_type,
            detail=detail,
            free_allowlist=self.free_allowlist,
            embedded_allowlist=self.embedded_allowlist,
        )

    def record_llm_usage(
        self,
        email: str | None,
        payload: dict[str, Any] | None,
        *,
        model: str = "",
        usage_type: str = "llm_tokens",
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        usage = (payload or {}).get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        millicents = llm_token_cost_millicents(prompt_tokens, completion_tokens, model)
        detail = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "model": model,
        }
        if extra:
            detail.update(extra)
        return self.record(email, millicents, usage_type=usage_type, detail=detail)

    def record_whisper_usage(
        self,
        email: str | None,
        duration_seconds: float,
        *,
        model: str = "",
        usage_type: str = "whisper_minutes",
    ) -> dict[str, Any]:
        millicents = whisper_cost_millicents(duration_seconds, model)
        return self.record(
            email,
            millicents,
            usage_type=usage_type,
            detail={"duration_seconds": duration_seconds, "model": model},
        )

    def record_egress(
        self,
        email: str | None,
        bytes_served: int,
        *,
        usage_type: str = "egress_bytes",
        path: str = "",
    ) -> dict[str, Any]:
        millicents = egress_cost_millicents(bytes_served)
        return self.record(
            email,
            millicents,
            usage_type=usage_type,
            detail={"bytes_served": bytes_served, "path": path},
        )

    def record_scrape(self, email: str | None, usage_type: str) -> dict[str, Any]:
        return self.record(
            email,
            scrape_cost_millicents(usage_type),
            usage_type=usage_type,
            detail={},
        )

    def record_stem_job(self, email: str | None) -> dict[str, Any]:
        return self.record(email, stem_job_cost_millicents(), usage_type="stem_job", detail={})

    def record_amt_job(self, email: str | None) -> dict[str, Any]:
        return self.record(email, amt_job_cost_millicents(), usage_type="amt_job", detail={})

    def record_ocr(self, email: str | None) -> dict[str, Any]:
        return self.record(email, ocr_flat_cost_millicents(), usage_type="ocr_vision", detail={})


def bill_host_provider_response(
    ctx: BillingContext,
    email: str | None,
    provider_cfg: dict[str, Any] | None,
    *,
    usage_type: str,
    payload: dict[str, Any] | None = None,
    model: str = "",
    duration_seconds: float = 0.0,
) -> None:
    if not ctx.enabled_for(email):
        return
    if not provider_cfg or provider_cfg.get("source") != "host":
        return
    if usage_type.startswith("llm") or usage_type == "llm_tokens":
        ctx.record_llm_usage(email, payload, model=model or str(provider_cfg.get("model") or ""), usage_type=usage_type)
        return
    if usage_type.startswith("whisper") or duration_seconds > 0:
        ctx.record_whisper_usage(
            email,
            duration_seconds,
            model=model or str(provider_cfg.get("model") or ""),
            usage_type=usage_type,
        )
        return
    if usage_type == "ocr_vision":
        ctx.record_ocr(email)
