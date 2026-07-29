import os
import unittest
import unittest.mock

from snapcast_config import (
    snapcast_enabled,
    snapclient_enabled,
    snapclient_hostname,
    snapclient_soundcard,
)


class SnapcastConfigTests(unittest.TestCase):
    def test_snapclient_defaults_when_snapcast_enabled(self):
        with unittest.mock.patch.dict(os.environ, {"SNAPCAST_ENABLED": "true"}, clear=False):
            self.assertTrue(snapclient_enabled())
            self.assertEqual(snapclient_hostname(), "resolver-host")
            self.assertEqual(snapclient_soundcard(), "default")

    def test_snapclient_disabled_when_snapcast_off(self):
        with unittest.mock.patch.dict(os.environ, {"SNAPCAST_ENABLED": "false"}, clear=False):
            self.assertFalse(snapcast_enabled())
            self.assertFalse(snapclient_enabled())

    def test_snapclient_opt_out(self):
        env = {"SNAPCAST_ENABLED": "true", "SNAPCLIENT_ENABLED": "false"}
        with unittest.mock.patch.dict(os.environ, env, clear=False):
            self.assertFalse(snapclient_enabled())


if __name__ == "__main__":
    unittest.main()
