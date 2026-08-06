"""Credit reservation helpers for expensive resolver operations."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

from fastapi import HTTPException

from billing import (
    billing_reservations_enabled,
    finalize_hold,
    get_available_balance_millicents,
    get_balance_millicents,
    release_hold,
    reserve_credit,
    should_bill_user,
)
from billing_estimates import estimate_operation_millicents
from billing_rates import millicents_to_cents


class BillingReservation:
    def __init__(
        self,
        *,
        hold_id: str | None,
        email: str,
        operation_id: str,
        estimate_millicents: int,
        skipped: bool = False,
    ):
        self.hold_id = hold_id
        self.email = email
        self.operation_id = operation_id
        self.estimate_millicents = estimate_millicents
        self.skipped = skipped
        self._released = False

    def ensure_available(self, millicents: int) -> None:
        if self.skipped or not self.email:
            return
        from billing import ensure_available_for_millicents

        result = ensure_available_for_millicents(self.email, millicents)
        if not result.get("ok"):
            raise HTTPException(
                status_code=402,
                detail=_insufficient_credit_detail(
                    self.operation_id,
                    estimate_millicents=int(millicents),
                    available_millicents=int(result.get("available_millicents") or 0),
                    balance_millicents=int(result.get("balance_millicents") or 0),
                ),
            )

    def release(self) -> None:
        if self._released or not self.hold_id:
            return
        release_hold(self.hold_id)
        self._released = True

    def finalize(self, consumed_millicents: int = 0) -> None:
        if self._released or not self.hold_id:
            return
        finalize_hold(self.hold_id, consumed_millicents)
        self._released = True


def _insufficient_credit_detail(
    operation_id: str,
    *,
    estimate_millicents: int,
    available_millicents: int,
    balance_millicents: int,
) -> dict[str, Any]:
    shortfall = max(0, estimate_millicents - available_millicents)
    return {
        "error": "insufficient_credit",
        "operation": operation_id,
        "estimateCents": millicents_to_cents(estimate_millicents),
        "availableCents": millicents_to_cents(available_millicents),
        "balanceCents": millicents_to_cents(balance_millicents),
        "shortfallCents": millicents_to_cents(shortfall),
    }


def _provider_skips_reservation(provider_cfg: dict[str, Any] | None) -> bool:
    if not provider_cfg:
        return False
    source = str(provider_cfg.get("source") or "").strip().lower()
    if source == "local":
        return True
    if provider_cfg.get("provider") == "local":
        return True
    return False


def require_credit_reservation(
    email: str,
    operation_id: str,
    params: dict[str, Any] | None = None,
    *,
    provider_cfg: dict[str, Any] | None = None,
    model: str = "",
) -> BillingReservation:
    if _provider_skips_reservation(provider_cfg):
        return BillingReservation(
            hold_id=None,
            email=email or "",
            operation_id=operation_id,
            estimate_millicents=0,
            skipped=True,
        )

    if not billing_reservations_enabled():
        return BillingReservation(
            hold_id=None,
            email=email or "",
            operation_id=operation_id,
            estimate_millicents=0,
            skipped=True,
        )

    normalized = (email or "").strip().lower()
    if not normalized:
        return BillingReservation(
            hold_id=None,
            email="",
            operation_id=operation_id,
            estimate_millicents=0,
            skipped=True,
        )

    if not should_bill_user(normalized):
        return BillingReservation(
            hold_id=None,
            email=normalized,
            operation_id=operation_id,
            estimate_millicents=0,
            skipped=True,
        )

    estimate = estimate_operation_millicents(operation_id, params, model=model)
    if estimate <= 0:
        return BillingReservation(
            hold_id=None,
            email=normalized,
            operation_id=operation_id,
            estimate_millicents=0,
            skipped=True,
        )

    result = reserve_credit(
        normalized,
        estimate,
        operation_id,
        detail={"params": params or {}, "model": model},
    )
    if not result.get("ok"):
        balance = int(result.get("balance_millicents") or get_balance_millicents(normalized))
        available = int(result.get("available_millicents") or get_available_balance_millicents(normalized))
        raise HTTPException(
            status_code=402,
            detail=_insufficient_credit_detail(
                operation_id,
                estimate_millicents=estimate,
                available_millicents=available,
                balance_millicents=balance,
            ),
        )

    return BillingReservation(
        hold_id=result.get("hold_id"),
        email=normalized,
        operation_id=operation_id,
        estimate_millicents=estimate,
    )


@contextmanager
def credit_reservation_scope(reservation: BillingReservation | None):
    res = reservation
    try:
        yield res
    finally:
        if res:
            res.finalize()
