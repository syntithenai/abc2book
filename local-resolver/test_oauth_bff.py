import os
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

import oauth_bff
import server


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or str(payload or "")

    def json(self):
        return self._payload


class FakeAsyncClient:
    def __init__(self, handlers):
        self.handlers = handlers

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, data=None, **kwargs):
        handler = self.handlers.get(("POST", url))
        if not handler:
            return FakeResponse(500, {"error": "unexpected post " + url})
        return handler(data)

    async def get(self, url, headers=None, **kwargs):
        handler = self.handlers.get(("GET", url))
        if not handler:
            return FakeResponse(500, {"error": "unexpected get " + url})
        return handler(headers)


class OAuthBffTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "sessions.sqlite")
        self.env = patch.dict(
            os.environ,
            {
                "GOOGLE_CLIENT_ID": "client-id",
                "GOOGLE_CLIENT_SECRET": "client-secret",
                "AUTH_SESSION_SECRET": "session-secret-value-32bytes-min",
                "AUTH_SESSION_DB_PATH": self.db_path,
                "AUTH_REFRESH_TOKEN_FERNET_KEY": "",
            },
            clear=False,
        )
        self.env.start()
        oauth_bff.GOOGLE_CLIENT_ID = "client-id"
        oauth_bff.GOOGLE_CLIENT_SECRET = "client-secret"
        oauth_bff.AUTH_SESSION_SECRET = "session-secret-value-32bytes-min"
        oauth_bff.AUTH_SESSION_STORE = "sqlite"
        oauth_bff.AUTH_SESSION_DB_PATH = self.db_path
        oauth_bff.AUTH_REFRESH_TOKEN_FERNET_KEY = ""
        oauth_bff._db_initialized = False
        oauth_bff._firestore_client = None
        oauth_bff._refresh_locks = {}
        oauth_bff._fernet = None
        oauth_bff._fernet_checked = False
        oauth_bff.ensure_db()

        server.GOOGLE_CLIENT_ID = "client-id"
        server.GOOGLE_CLIENT_SECRET = "client-secret"
        server.AUTH_SESSION_SECRET = "session-secret-value-32bytes-min"
        server.RESOLVER_ACCESS_EMAILS = {"allowed@example.com"}
        self.client = TestClient(server.app)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_oauth_bff_configured_requires_all_secrets(self):
        self.assertTrue(oauth_bff.oauth_bff_configured())
        oauth_bff.GOOGLE_CLIENT_SECRET = ""
        self.assertFalse(oauth_bff.oauth_bff_configured())

    def test_health_includes_oauth_bff_and_features_map(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertTrue(body.get("oauthBff"))
        self.assertIn("features", body)
        self.assertTrue(body["features"].get("oauthBff"))
        self.assertIn("providers", body)
        self.assertIn("embeddedCreds", body)
        self.assertIn("resolverAccess", body)

    def test_health_ready_features_include_oauth_bff(self):
        with patch.object(server, "_refresh_llm_health_if_stale", new_callable=AsyncMock, return_value=True):
            response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("features", {}).get("oauthBff"))
        self.assertTrue(body.get("oauthBff"))

    def test_exchange_and_refresh_for_allowlisted_and_other_emails(self):
        def token_handler(data):
            self.assertEqual(data.get("grant_type"), "authorization_code")
            return FakeResponse(
                200,
                {
                    "access_token": "access-1",
                    "refresh_token": "refresh-1",
                    "expires_in": 3600,
                    "scope": "openid email profile https://www.googleapis.com/auth/drive.file",
                },
            )

        def userinfo_handler(headers):
            return FakeResponse(
                200,
                {
                    "email": "other@example.com",
                    "name": "Other User",
                    "picture": "https://example.com/p.png",
                },
            )

        handlers = {
            ("POST", oauth_bff.GOOGLE_TOKEN_URL): token_handler,
            ("GET", oauth_bff.GOOGLE_USERINFO_URL): userinfo_handler,
        }
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(handlers)):
            response = self.client.post(
                "/auth/google/exchange",
                json={
                    "code": "auth-code",
                    "code_verifier": "verifier",
                    "redirect_uri": "http://localhost:3000",
                },
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["email"], "other@example.com")
        self.assertFalse(body["allowed_for_media"])
        self.assertEqual(body["access_token"], "access-1")
        session_id = body["session_id"]
        self.assertTrue(session_id)

        oauth_bff.ensure_db()
        with oauth_bff._connect() as conn:
            conn.execute(
                "UPDATE oauth_sessions SET access_token_enc = '', access_expires_at = 0, last_refresh_at = 0 WHERE session_id = ?",
                (session_id,),
            )
            conn.commit()

        def refresh_handler(data):
            self.assertEqual(data.get("grant_type"), "refresh_token")
            self.assertEqual(data.get("refresh_token"), "refresh-1")
            return FakeResponse(
                200,
                {
                    "access_token": "access-2",
                    "expires_in": 3500,
                    "scope": "openid email profile https://www.googleapis.com/auth/drive.file",
                },
            )

        handlers2 = {("POST", oauth_bff.GOOGLE_TOKEN_URL): refresh_handler}
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(handlers2)):
            refresh = self.client.post(
                "/auth/google/refresh",
                headers={"X-Abc-Auth-Session": session_id},
            )
        self.assertEqual(refresh.status_code, 200)
        self.assertEqual(refresh.json()["access_token"], "access-2")

    def test_exchange_allowlisted_email_sets_allowed_for_media(self):
        handlers = {
            ("POST", oauth_bff.GOOGLE_TOKEN_URL): lambda data: FakeResponse(
                200,
                {
                    "access_token": "a",
                    "refresh_token": "r",
                    "expires_in": 3600,
                    "scope": "email",
                },
            ),
            ("GET", oauth_bff.GOOGLE_USERINFO_URL): lambda headers: FakeResponse(
                200, {"email": "allowed@example.com", "name": "Allowed"}
            ),
        }
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(handlers)):
            response = self.client.post(
                "/auth/google/exchange",
                json={
                    "code": "c",
                    "code_verifier": "v",
                    "redirect_uri": "http://localhost:3000",
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["allowed_for_media"])

    def test_exchange_missing_refresh_token(self):
        handlers = {
            ("POST", oauth_bff.GOOGLE_TOKEN_URL): lambda data: FakeResponse(
                200, {"access_token": "a", "expires_in": 3600, "scope": "email"}
            ),
            ("GET", oauth_bff.GOOGLE_USERINFO_URL): lambda headers: FakeResponse(
                200, {"email": "online@example.com", "name": "Online"}
            ),
        }
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(handlers)):
            response = self.client.post(
                "/auth/google/exchange",
                json={
                    "code": "c",
                    "code_verifier": "v",
                    "redirect_uri": "http://localhost:3000",
                },
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["access_token"], "a")
        self.assertEqual(body["email"], "online@example.com")
        self.assertEqual(body.get("session_id") or "", "")
        self.assertFalse(body.get("offline"))

    def test_refresh_returns_cached_access_token_without_google_call(self):
        import asyncio

        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh",
            scopes="email",
            allowed_for_media=False,
            session_id="sess-cache",
        )
        oauth_bff._store_access_cache("sess-cache", "cached-access", 3600, "email")

        async def fail_if_called(*args, **kwargs):
            raise AssertionError("Google token endpoint should not be called")

        with patch("oauth_bff.httpx.AsyncClient") as client_cls:
            client_cls.return_value.__aenter__.return_value.post = fail_if_called
            result = asyncio.run(oauth_bff.refresh_access_token("sess-cache"))

        self.assertEqual(result["access_token"], "cached-access")
        self.assertTrue(result.get("cached"))

    def test_refresh_rate_limited_when_called_too_soon(self):
        import asyncio

        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh",
            scopes="email",
            allowed_for_media=False,
            session_id="sess-limit",
        )
        oauth_bff._store_access_cache("sess-limit", "access", 3600, "email")
        oauth_bff.ensure_db()
        with oauth_bff._connect() as conn:
            conn.execute(
                "UPDATE oauth_sessions SET access_token_enc = '', access_expires_at = 0 WHERE session_id = ?",
                ("sess-limit",),
            )
            conn.commit()

        result = asyncio.run(oauth_bff.refresh_access_token("sess-limit"))
        self.assertEqual(result.get("error"), "refresh_rate_limited")
        self.assertEqual(result.get("status"), 429)
        self.assertGreater(result.get("retry_after") or 0, 0)

    def test_logout_deletes_session(self):
        oauth_bff.upsert_session(
            email="user@example.com",
            refresh_token="refresh",
            scopes="email",
            allowed_for_media=False,
            session_id="sess-1",
        )
        # Logout clears our session and must not call Google revoke.
        calls = []

        class TrackingClient(FakeAsyncClient):
            async def post(self, url, data=None, **kwargs):
                calls.append(("POST", url))
                return await super().post(url, data=data, **kwargs)

        with patch("oauth_bff.httpx.AsyncClient", return_value=TrackingClient({})):
            response = self.client.post(
                "/auth/google/logout",
                headers={"X-Abc-Auth-Session": "sess-1"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(oauth_bff.get_session("sess-1"))
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
