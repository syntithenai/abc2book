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

    def test_list_accounts_returns_seeded_accounts(self):
        billing.apply_delta("alpha@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "alpha@example.com",
            100,
            provider="comp",
            provider_event_id="comp_alpha_1",
        )
        billing.apply_delta("beta@example.com", 0, entry_type="account_created")
        result = billing.list_accounts(limit=50)
        self.assertEqual(result["total"], 2)
        emails = [a["email"] for a in result["accounts"]]
        self.assertIn("alpha@example.com", emails)
        self.assertIn("beta@example.com", emails)
        alpha = next(a for a in result["accounts"] if a["email"] == "alpha@example.com")
        self.assertEqual(alpha["balanceCents"], 100.0)
        self.assertTrue(alpha["trialGranted"] is False or alpha["trialGranted"] is True)

    def test_list_accounts_query_filter(self):
        billing.apply_delta("findme@example.com", 0, entry_type="account_created")
        billing.apply_delta("other@example.com", 0, entry_type="account_created")
        result = billing.list_accounts(query="findme")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["accounts"][0]["email"], "findme@example.com")

    def test_admin_set_balance_creates_adjustment_entry(self):
        billing.apply_delta("adjust@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "adjust@example.com",
            200,
            provider="comp",
            provider_event_id="comp_adjust_1",
        )
        result = billing.admin_set_balance(
            "adjust@example.com",
            50000,
            admin_email="stever@syntithenai.com",
            reason="test adjustment",
        )
        self.assertTrue(result.get("ok"))
        self.assertEqual(billing.get_balance_millicents("adjust@example.com"), 50000)
        entries = billing.list_ledger("adjust@example.com", limit=10)
        adjustment = next(e for e in entries if e["entry_type"] == "admin_adjustment")
        self.assertEqual(adjustment["usage_type"], "admin_set_balance")
        self.assertEqual(adjustment["detail"].get("admin_email"), "stever@syntithenai.com")

    def test_admin_rename_account_moves_rows(self):
        billing.apply_delta("rename-old@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "rename-old@example.com",
            150,
            provider="comp",
            provider_event_id="comp_rename_1",
        )
        result = billing.admin_rename_account(
            "rename-old@example.com",
            "rename-new@example.com",
            admin_email="stever@syntithenai.com",
        )
        self.assertTrue(result.get("ok"))
        self.assertIsNone(billing.get_account("rename-old@example.com"))
        self.assertIsNotNone(billing.get_account("rename-new@example.com"))
        self.assertEqual(billing.get_balance_cents("rename-new@example.com"), 150.0)
        entries = billing.list_ledger("rename-new@example.com", limit=10)
        self.assertTrue(len(entries) >= 1)

    def test_admin_rename_account_rejects_duplicate_target(self):
        billing.apply_delta("keep@example.com", 0, entry_type="account_created")
        billing.apply_delta("move@example.com", 0, entry_type="account_created")
        result = billing.admin_rename_account("move@example.com", "keep@example.com")
        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("error"), "target_exists")

    def test_reserve_credit_blocks_when_insufficient(self):
        billing.apply_delta("hold@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "hold@example.com",
            1,
            provider="comp",
            provider_event_id="comp_hold_1",
        )
        result = billing.reserve_credit(
            "hold@example.com",
            50000,
            "background_research",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("error"), "insufficient_credit")

    def test_reserve_and_release_restores_available(self):
        billing.apply_delta("hold2@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "hold2@example.com",
            100,
            provider="comp",
            provider_event_id="comp_hold2_1",
        )
        before = billing.get_available_balance_millicents("hold2@example.com")
        reserve = billing.reserve_credit(
            "hold2@example.com",
            1000,
            "feed_article",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        self.assertTrue(reserve.get("ok"))
        self.assertEqual(billing.get_available_balance_millicents("hold2@example.com"), before - 1000)
        billing.release_hold(reserve["hold_id"])
        self.assertEqual(billing.get_available_balance_millicents("hold2@example.com"), before)

    def test_concurrent_reserve_fails_when_overlapping(self):
        billing.apply_delta("hold3@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "hold3@example.com",
            50,
            provider="comp",
            provider_event_id="comp_hold3_1",
        )
        first = billing.reserve_credit(
            "hold3@example.com",
            40000,
            "practice_track",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        self.assertTrue(first.get("ok"))
        second = billing.reserve_credit(
            "hold3@example.com",
            40000,
            "practice_track",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        self.assertFalse(second.get("ok"))
        billing.release_hold(first["hold_id"])

    def test_record_usage_after_partial_balance_blocks_reserve(self):
        billing.apply_delta("hold4@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "hold4@example.com",
            10,
            provider="comp",
            provider_event_id="comp_hold4_1",
        )
        billing.record_usage(
            "hold4@example.com",
            9000,
            usage_type="llm_tokens",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        result = billing.reserve_credit(
            "hold4@example.com",
            5000,
            "feed_article",
            free_allowlist=set(),
            embedded_allowlist=set(),
        )
        self.assertFalse(result.get("ok"))


class BillingEstimatesTests(unittest.TestCase):
    def test_tts_speech_estimate_uses_text_length(self):
        from billing_estimates import estimate_operation_millicents

        short = estimate_operation_millicents("tts_speech", {"text_chars": 20})
        long = estimate_operation_millicents("tts_speech", {"text_chars": 200})
        self.assertGreater(long, short)

    def test_tts_speech_in_catalog(self):
        from billing_estimates import OPERATION_CATALOG

        self.assertIn("tts_speech", OPERATION_CATALOG)


class BillingAdminRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "billing.sqlite")
        self.env = patch.dict(
            os.environ,
            {
                "BILLING_ENABLED": "true",
                "BILLING_STORE": "sqlite",
                "BILLING_DB_PATH": self.db_path,
                "ALLOWED_ADMIN_EMAILS": "stever@syntithenai.com",
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

        from fastapi import FastAPI

        import billing_routes

        self.app = FastAPI()
        self.admin_allowlist = {"stever@syntithenai.com"}

        async def verify_admin(_token):
            return {"email": "stever@syntithenai.com"}

        async def verify_user(_token):
            return {"email": "user@example.com"}

        billing_routes.register_billing_routes(
            self.app,
            get_bearer_token=lambda auth: "token" if auth else None,
            verify_google_access_token=verify_admin,
            cors_headers=lambda _origin: {},
            get_free_allowlist=lambda: set(),
            get_embedded_allowlist=lambda: set(),
            get_admin_allowlist=lambda: self.admin_allowlist,
        )
        from fastapi.testclient import TestClient

        self.client = TestClient(self.app)
        self.auth_headers = {"Authorization": "Bearer token"}

        billing.apply_delta("victim@example.com", 0, entry_type="account_created")
        billing.grant_purchase(
            "victim@example.com",
            300,
            provider="comp",
            provider_event_id="comp_victim_1",
        )

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_admin_accounts_succeeds_for_admin(self):
        response = self.client.get("/billing/admin/accounts", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("accounts", body)
        emails = [a["email"] for a in body["accounts"]]
        self.assertIn("victim@example.com", emails)

    def test_admin_accounts_forbidden_for_non_admin(self):
        from fastapi import FastAPI

        import billing_routes

        app = FastAPI()

        async def verify_user(_token):
            return {"email": "user@example.com"}

        billing_routes.register_billing_routes(
            app,
            get_bearer_token=lambda auth: "token" if auth else None,
            verify_google_access_token=verify_user,
            cors_headers=lambda _origin: {},
            get_free_allowlist=lambda: set(),
            get_embedded_allowlist=lambda: set(),
            get_admin_allowlist=lambda: {"stever@syntithenai.com"},
        )
        from fastapi.testclient import TestClient

        client = TestClient(app)
        response = client.get(
            "/billing/admin/accounts",
            headers={"Authorization": "Bearer token"},
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_ledger_forbidden_for_non_admin(self):
        from fastapi import FastAPI

        import billing_routes

        app = FastAPI()

        async def verify_user(_token):
            return {"email": "user@example.com"}

        billing_routes.register_billing_routes(
            app,
            get_bearer_token=lambda auth: "token" if auth else None,
            verify_google_access_token=verify_user,
            cors_headers=lambda _origin: {},
            get_free_allowlist=lambda: set(),
            get_embedded_allowlist=lambda: set(),
            get_admin_allowlist=lambda: {"stever@syntithenai.com"},
        )
        from fastapi.testclient import TestClient

        client = TestClient(app)
        response = client.get(
            "/billing/admin/accounts/victim@example.com/ledger",
            headers={"Authorization": "Bearer token"},
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_ledger_returns_entries_for_admin(self):
        response = self.client.get(
            "/billing/admin/accounts/victim@example.com/ledger",
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(len(body.get("entries") or []) >= 1)

    def test_billing_history_self_scoped_only(self):
        billing.apply_delta("user@example.com", 0, entry_type="account_created")
        from fastapi import FastAPI

        import billing_routes

        app = FastAPI()

        async def verify_user(_token):
            return {"email": "user@example.com"}

        billing_routes.register_billing_routes(
            app,
            get_bearer_token=lambda auth: "token" if auth else None,
            verify_google_access_token=verify_user,
            cors_headers=lambda _origin: {},
            get_free_allowlist=lambda: set(),
            get_embedded_allowlist=lambda: set(),
            get_admin_allowlist=lambda: {"stever@syntithenai.com"},
        )
        from fastapi.testclient import TestClient

        client = TestClient(app)
        response = client.get("/billing/history", headers={"Authorization": "Bearer token"})
        self.assertEqual(response.status_code, 200)
        entries = response.json().get("entries") or []
        for entry in entries:
            # list_ledger is scoped to token email; victim entries must not appear
            pass
        victim_entries = billing.list_ledger("victim@example.com", limit=10)
        victim_ids = {e["id"] for e in victim_entries}
        returned_ids = {e["id"] for e in entries}
        self.assertFalse(victim_ids.intersection(returned_ids))

    def test_admin_patch_forbidden_for_non_admin(self):
        from fastapi import FastAPI

        import billing_routes

        app = FastAPI()

        async def verify_user(_token):
            return {"email": "user@example.com"}

        billing_routes.register_billing_routes(
            app,
            get_bearer_token=lambda auth: "token" if auth else None,
            verify_google_access_token=verify_user,
            cors_headers=lambda _origin: {},
            get_free_allowlist=lambda: set(),
            get_embedded_allowlist=lambda: set(),
            get_admin_allowlist=lambda: {"stever@syntithenai.com"},
        )
        from fastapi.testclient import TestClient

        client = TestClient(app)
        response = client.patch(
            "/billing/admin/accounts/victim@example.com",
            headers={"Authorization": "Bearer token"},
            json={"balanceCents": 999},
        )
        self.assertEqual(response.status_code, 403)


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
