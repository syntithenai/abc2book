"""Payment method availability flags for credit checkout (Stripe wallets + PayPal CPM)."""

from __future__ import annotations

import os
from typing import Any


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in ("1", "true", "yes")


BILLING_STRIPE_CARDS_ENABLED = _env_bool("BILLING_STRIPE_CARDS_ENABLED", default=True)
BILLING_STRIPE_GOOGLE_PAY_ENABLED = _env_bool("BILLING_STRIPE_GOOGLE_PAY_ENABLED", default=True)
BILLING_STRIPE_APPLE_PAY_ENABLED = _env_bool("BILLING_STRIPE_APPLE_PAY_ENABLED", default=True)
PAYPAL_CPM_ENABLED = _env_bool("PAYPAL_CPM_ENABLED", default=False)
PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION = os.getenv(
    "PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION",
    "",
).strip()
PAYPAL_CPM_ADAPTER_URL = os.getenv("PAYPAL_CPM_ADAPTER_URL", "").strip()


def paypal_cpm_configured() -> bool:
    return PAYPAL_CPM_ENABLED and bool(PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION)


def payment_methods_payload() -> dict[str, Any]:
    return {
        "stripe": {
            "cards": BILLING_STRIPE_CARDS_ENABLED,
            "googlePay": BILLING_STRIPE_GOOGLE_PAY_ENABLED,
            "applePay": BILLING_STRIPE_APPLE_PAY_ENABLED,
        },
        "paypal": paypal_cpm_configured(),
    }


def apply_checkout_payment_options(params: dict[str, Any]) -> dict[str, Any]:
    """Set Stripe Checkout Session payment options.

    Checkout Sessions use payment_method_types (or payment_method_configuration for
    PayPal CPM), not PaymentIntent automatic_payment_methods.
    """
    out = dict(params)
    out.pop("automatic_payment_methods", None)
    if paypal_cpm_configured():
        out["payment_method_configuration"] = PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION
        out.pop("payment_method_types", None)
    else:
        out.pop("payment_method_configuration", None)
        types: list[str] = []
        if BILLING_STRIPE_CARDS_ENABLED:
            types.append("card")
        if not types:
            types = ["card"]
        out["payment_method_types"] = types
    return out


def payment_methods_help_text(methods: dict[str, Any] | None) -> str:
    opts = methods or payment_methods_payload()
    stripe = opts.get("stripe") if isinstance(opts.get("stripe"), dict) else {}
    parts: list[str] = []
    if stripe.get("cards"):
        parts.append("card")
    if stripe.get("googlePay"):
        parts.append("Google Pay")
    if stripe.get("applePay"):
        parts.append("Apple Pay")
    if opts.get("paypal"):
        parts.append("PayPal")
    if not parts:
        return "card"
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + ", or " + parts[-1]
