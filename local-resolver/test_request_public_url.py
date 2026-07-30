import unittest
from unittest import mock

from request_public_url import request_public_base, request_public_host, request_public_scheme


class RequestPublicUrlTests(unittest.TestCase):
    def _request(self, *, scheme="http", host="localhost:8787", forwarded_proto="", forwarded_host=""):
        request = mock.Mock()
        request.url = mock.Mock(scheme=scheme)
        request.headers = {}
        if host:
            request.headers["host"] = host
        if forwarded_proto:
            request.headers["x-forwarded-proto"] = forwarded_proto
        if forwarded_host:
            request.headers["x-forwarded-host"] = forwarded_host
        return request

    def test_scheme_from_forwarded_proto(self):
        request = self._request(forwarded_proto="https", scheme="http")
        self.assertEqual(request_public_scheme(request), "https")

    def test_public_base_https_behind_caddy(self):
        request = self._request(
            forwarded_proto="https",
            forwarded_host="peppertrees.example.com",
            scheme="http",
            host="local-resolver:8787",
        )
        self.assertEqual(request_public_base(request), "https://peppertrees.example.com")

    def test_public_host_strips_port(self):
        request = self._request(host="peppertrees.example.com:8787")
        self.assertEqual(request_public_host(request), "peppertrees.example.com")


if __name__ == "__main__":
    unittest.main()
