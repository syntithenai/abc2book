import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import oauth_bff
import server_light
from test_oauth_bff import FakeAsyncClient, FakeResponse


class ServerLightOAuthBffTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "sessions.sqlite")
        self.env = patch.dict(
            os.environ,
            {
                "GOOGLE_CLIENT_ID": "client-id",
                "GOOGLE_CLIENT_SECRET": "client-secret",
                "AUTH_SESSION_SECRET": "session-secret-value-32bytes-min",
                "AUTH_SESSION_STORE": "sqlite",
                "AUTH_SESSION_DB_PATH": self.db_path,
                "AUTH_REFRESH_TOKEN_FERNET_KEY": "",
                "REQUIRE_AUTH": "false",
            },
            clear=False,
        )
        self.env.start()
        oauth_bff.GOOGLE_CLIENT_ID = "client-id"
        oauth_bff.GOOGLE_CLIENT_SECRET = "client-secret"
        oauth_bff.AUTH_SESSION_SECRET = "session-secret-value-32bytes-min"
        oauth_bff.AUTH_SESSION_STORE = "sqlite"
        oauth_bff.AUTH_SESSION_DB_PATH = self.db_path
        oauth_bff._db_initialized = False
        oauth_bff._firestore_client = None
        oauth_bff._refresh_locks = {}
        oauth_bff.ensure_db()
        self.client = TestClient(server_light.app)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_health_includes_oauth_bff_when_configured(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("oauthBff"))
        self.assertTrue(body.get("features", {}).get("oauthBff"))

    def test_exchange_and_refresh_round_trip(self):
        handlers = {
            ("POST", oauth_bff.GOOGLE_TOKEN_URL): lambda data: FakeResponse(
                200,
                {
                    "access_token": "access-1",
                    "refresh_token": "refresh-1",
                    "expires_in": 3600,
                    "scope": "email",
                },
            ),
            ("GET", oauth_bff.GOOGLE_USERINFO_URL): lambda headers: FakeResponse(
                200, {"email": "user@example.com", "name": "User"}
            ),
        }
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(handlers)):
            exchange = self.client.post(
                "/auth/google/exchange",
                json={
                    "code": "auth-code",
                    "code_verifier": "verifier",
                    "redirect_uri": "http://localhost:3000",
                },
            )
        self.assertEqual(exchange.status_code, 200)
        session_id = exchange.json()["session_id"]
        self.assertTrue(session_id)

        oauth_bff.ensure_db()
        with oauth_bff._connect() as conn:
            conn.execute(
                "UPDATE oauth_sessions SET access_token_enc = '', access_expires_at = 0, last_refresh_at = 0 WHERE session_id = ?",
                (session_id,),
            )
            conn.commit()

        refresh_handlers = {
            ("POST", oauth_bff.GOOGLE_TOKEN_URL): lambda data: FakeResponse(
                200,
                {
                    "access_token": "access-2",
                    "expires_in": 3500,
                    "scope": "email",
                },
            ),
        }
        with patch("oauth_bff.httpx.AsyncClient", return_value=FakeAsyncClient(refresh_handlers)):
            refresh = self.client.post(
                "/auth/google/refresh",
                headers={"X-Abc-Auth-Session": session_id},
            )
        self.assertEqual(refresh.status_code, 200)
        self.assertEqual(refresh.json()["access_token"], "access-2")


if __name__ == "__main__":
    unittest.main()
