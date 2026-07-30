"""Stripe PayPal Custom Payment Method (CPM) helpers for Checkout."""

from __future__ import annotations

from typing import Any

from billing_payment_methods import (
    PAYPAL_CPM_ADAPTER_URL,
    paypal_cpm_configured,
)


def apply_paypal_cpm_to_checkout_params(params: dict[str, Any]) -> dict[str, Any]:
    """Attach PayPal CPM Checkout options when enabled and configured."""
    if not paypal_cpm_configured():
        return params
    from billing_payment_methods import PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION

    out = dict(params)
    out["payment_method_configuration"] = PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION
    return out


def paypal_cpm_status() -> dict[str, Any]:
    return {
        "enabled": paypal_cpm_configured(),
        "adapterUrlConfigured": bool(PAYPAL_CPM_ADAPTER_URL),
        "requestUrl": "https://docs.stripe.com/payments/payment-methods/custom-payment-methods/paypal",
    }
