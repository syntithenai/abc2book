import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from local_service_auth import (
    is_local_service_call,
    is_local_service_request,
    mark_local_service_request,
    reset_local_service_request,
)

TOKEN = "s3cret-token"
AUTH = "Bearer " + TOKEN


class LocalServiceCallTests(unittest.TestCase):
    def check(self, auth=AUTH, host="172.18.0.1", headers=None, path="/snapcast-playback/session", token=TOKEN):
        return is_local_service_call(auth, host, headers or {}, path, token=token)

    def test_accepts_bridge_gateway_and_loopback(self):
        self.assertTrue(self.check())
        self.assertTrue(self.check(host="127.0.0.1"))
        self.assertTrue(self.check(host="::1"))
        self.assertTrue(self.check(path="/search-music-collection"))

    def test_rejects_without_configured_token(self):
        self.assertFalse(self.check(token=""))

    def test_rejects_wrong_or_missing_token(self):
        self.assertFalse(self.check(auth="Bearer nope"))
        self.assertFalse(self.check(auth=None))
        self.assertFalse(self.check(auth=TOKEN))

    def test_rejects_lan_and_public_peers(self):
        self.assertFalse(self.check(host="10.1.1.50"))
        self.assertFalse(self.check(host="192.168.1.4"))
        self.assertFalse(self.check(host="8.8.8.8"))
        self.assertFalse(self.check(host=""))

    def test_rejects_proxied_requests(self):
        self.assertFalse(self.check(headers={"X-Forwarded-For": "1.2.3.4"}))
        self.assertFalse(self.check(headers={"Forwarded": "for=1.2.3.4"}))
        self.assertFalse(self.check(headers={"X-Real-IP": "1.2.3.4"}))

    def test_rejects_other_paths(self):
        self.assertFalse(self.check(path="/voice-command"))
        self.assertFalse(self.check(path="/billing/balance"))


class MiddlewareContextTests(unittest.TestCase):
    def test_marker_visible_in_endpoint_and_reset_after(self):
        app = FastAPI()

        @app.middleware("http")
        async def mw(request: Request, call_next):
            marker = mark_local_service_request(
                is_local_service_call(
                    request.headers.get("authorization"), "127.0.0.1", request.headers, request.url.path, token=TOKEN
                )
            )
            try:
                return await call_next(request)
            finally:
                reset_local_service_request(marker)

        @app.get("/snapcast-playback/plugin")
        async def plugin():
            return {"local": is_local_service_request()}

        client = TestClient(app)
        self.assertTrue(client.get("/snapcast-playback/plugin", headers={"Authorization": AUTH}).json()["local"])
        self.assertFalse(client.get("/snapcast-playback/plugin").json()["local"])
        self.assertFalse(is_local_service_request())


if __name__ == "__main__":
    unittest.main()
