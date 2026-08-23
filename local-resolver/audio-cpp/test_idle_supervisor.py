"""Tests for audio.cpp idle supervisor restart argv hardening."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


def _load_idle_supervisor():
    path = Path(__file__).resolve().parent / "idle_supervisor.py"
    spec = importlib.util.spec_from_file_location("idle_supervisor", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class IdleSupervisorRestartArgvTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_idle_supervisor()

    def test_defaults_to_systemctl_user_restart(self):
        argv = self.mod.resolve_restart_argv({})
        self.assertEqual(
            argv,
            ["systemctl", "--user", "restart", "abc2book-audio-cpp.service"],
        )

    def test_respects_custom_unit(self):
        argv = self.mod.resolve_restart_argv({
            "AUDIO_CPP_SYSTEMD_UNIT": "my-sidecar.service",
        })
        self.assertEqual(
            argv,
            ["systemctl", "--user", "restart", "my-sidecar.service"],
        )

    def test_parses_quoted_restart_command(self):
        argv = self.mod.resolve_restart_argv({
            "AUDIO_CPP_RESTART_CMD": "systemctl --user restart abc2book-audio-cpp.service",
        })
        self.assertEqual(
            argv,
            ["systemctl", "--user", "restart", "abc2book-audio-cpp.service"],
        )

    def test_repairs_truncated_systemctl_only_command(self):
        # Historical systemd Environment= bug left AUDIO_CPP_RESTART_CMD=systemctl
        argv = self.mod.resolve_restart_argv({
            "AUDIO_CPP_RESTART_CMD": "systemctl",
            "AUDIO_CPP_SYSTEMD_UNIT": "abc2book-audio-cpp.service",
        })
        self.assertEqual(
            argv,
            ["systemctl", "--user", "restart", "abc2book-audio-cpp.service"],
        )

    def test_repairs_truncated_systemctl_user_only(self):
        argv = self.mod.resolve_restart_argv({
            "AUDIO_CPP_RESTART_CMD": "systemctl --user",
        })
        self.assertEqual(
            argv,
            ["systemctl", "--user", "restart", "abc2book-audio-cpp.service"],
        )


if __name__ == "__main__":
    unittest.main()
