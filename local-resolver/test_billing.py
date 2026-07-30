"""Unit tests for multi-provider credit billing ledger."""

from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

import billing
import billing_payment_methods
import billing_paypal
import billing_stripe


class BillingLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "billing.sqlite")
        self.env = patch.dict(
            os.environ,
            {
                "BILLING_ENABLED": "true",
                "BILLING_STORE": "sqlite",
                "BILLING_DB_PATH": self.db_path,
            },
            clear=False,
        )
        self.env.start()
        billing.BILLING_ENABLED = True
        billing.BILLING_STORE = "sqlite"
        billing.BILLING_DB_PATH = self.db_path
        billing._db_initialized = False
        billing._firestore_client = None
        billing.ensure_db()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_grant_purchase_idempotent_per_provider(self):
        first = billing.grant_purchase(
            "buyer@example.com",
            500,
            provider="stripe",
            provider_event_id="evt_test_1",
            detail={"payment_method": "card"},
        )
        self.assertTrue(first.get("ok"))
        self.assertFalse(first.get("duplicate"))

        dup = billing.grant_purchase(
            "buyer@example.com",
            500,
            provider="stripe",
            provider_event_id="evt_test_1",
        )
        self.assertTrue(dup.get("duplicate"))
        self.assertEqual(billing.get_balance_cents("buyer@example.com"), 500.0)

        other = billing.grant_purchase(
            "buyer@example.com",
            1000,
            provider="paypal",
            provider_event_id="evt_paypal_1",
            detail={"payment_method": "paypal"},
        )
        self.assertTrue(other.get("ok"))
        self.assertEqual(billing.get_balance_cents("buyer@example.com"), 1500.0)

    def test_grant_purchase_cents_legacy_wrapper(self):
        result = billing.grant_purchase_cents(
            "legacy@example.com",
            250,
            stripe_event_id="evt_legacy_1",
        )
        self.assertTrue(result.get("ok"))
        self.assertEqual(billing.get_balance_cents("legacy@example.com"), 250.0)

        dup = billing.grant_purchase_cents(
            "legacy@example.com",
            250,
            stripe_event_id="evt_legacy_1",
        )
        self.assertTrue(dup.get("duplicate"))

    def test_stripe_event_legacy_dedupes_new_grant(self):
        with billing._connect() as conn:
            conn.execute(
                "INSERT INTO stripe_events (event_id, email, amount_cents, created_at) VALUES (?, ?, ?, ?)",
                ("evt_old_stripe", "old@example.com", 300, 1.0),
            )
            conn.commit()
        dup = billing.grant_purchase(
            "old@example.com",
            300,
            provider="stripe",
            provider_event_id="evt_old_stripe",
        )
        self.assertTrue(dup.get("duplicate"))
        self.assertEqual(billing.get_balance_millicents("old@example.com"), 0)


class BillingPaymentMethodTests(unittest.TestCase):
    def test_payment_methods_payload_defaults(self):
        with patch.dict(os.environ, {}, clear=False):
            billing_payment_methods.BILLING_STRIPE_CARDS_ENABLED = True
            billing_payment_methods.BILLING_STRIPE_GOOGLE_PAY_ENABLED = True
            billing_payment_methods.BILLING_STRIPE_APPLE_PAY_ENABLED = True
            billing_payment_methods.PAYPAL_CPM_ENABLED = False
            billing_payment_methods.PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION = ""
            payload = billing_payment_methods.payment_methods_payload()
        self.assertTrue(payload["stripe"]["cards"])
        self.assertTrue(payload["stripe"]["googlePay"])
        self.assertFalse(payload["paypal"])

    def test_paypal_cpm_applied_when_configured(self):
        with patch.dict(
            os.environ,
            {
                "PAYPAL_CPM_ENABLED": "true",
                "PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION": "pmc_test",
            },
            clear=False,
        ):
            billing_payment_methods.PAYPAL_CPM_ENABLED = True
            billing_payment_methods.PAYPAL_CPM_PAYMENT_METHOD_CONFIGURATION = "pmc_test"
            params = billing_paypal.apply_paypal_cpm_to_checkout_params({"mode": "payment"})
        self.assertEqual(params["payment_method_configuration"], "pmc_test")

    def test_extract_checkout_payment_method_wallet(self):
        class FakeStripe:
            class PaymentIntent:
                @staticmethod
                def retrieve(_pi_id, expand=None):
                    return {
                        "payment_method": {
                            "type": "card",
                            "card": {"wallet": {"type": "google_pay"}},
                        }
                    }

        method = billing_stripe.extract_checkout_payment_method(
            {"payment_intent": "pi_test"},
            FakeStripe(),
        )
        self.assertEqual(method, "google_pay")


if __name__ == "__main__":
    unittest.main()
