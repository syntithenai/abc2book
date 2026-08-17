import unittest
from unittest.mock import patch

from server import (
    build_ytdlp_cmd_for_url,
    is_youtube_target_url,
    ytdlp_error_hint,
    ytdlp_forbidden_error,
    ytdlp_should_retry_youtube,
    youtube_ytdlp_attempts,
)


class YtdlpCmdTest(unittest.TestCase):
    def test_is_youtube_target_url(self):
        self.assertTrue(is_youtube_target_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        self.assertTrue(is_youtube_target_url("https://youtu.be/dQw4w9WgXcQ"))
        self.assertFalse(is_youtube_target_url("https://artist.bandcamp.com/track/foo"))

    def test_youtube_cmd_skips_android_vr_and_uses_deno(self):
        with patch("server.prepare_ytdlp_cookies_path", return_value=None):
            with patch("server.shutil.which", return_value="/usr/bin/deno"):
                cmd = build_ytdlp_cmd_for_url(
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    stream_to_stdout=True,
                )
        self.assertIn("--extractor-args", cmd)
        args = cmd[cmd.index("--extractor-args") + 1]
        self.assertIn("-android_vr", args)
        self.assertEqual(cmd[cmd.index("--js-runtimes") + 1], "deno")
        self.assertIn("-o", cmd)
        self.assertIn("-", cmd)

    def test_bandcamp_cmd_omits_youtube_extractor_args(self):
        with patch("server.prepare_ytdlp_cookies_path", return_value=None):
            with patch("server.shutil.which", return_value="/usr/bin/deno"):
                cmd = build_ytdlp_cmd_for_url(
                    "https://artist.bandcamp.com/track/foo",
                    stream_to_stdout=True,
                )
        self.assertNotIn("--extractor-args", cmd)
        self.assertNotIn("--js-runtimes", cmd)

    def test_fallback_attempt_uses_android_best_audio(self):
        attempts = youtube_ytdlp_attempts()
        self.assertEqual(attempts[0][0], "youtube:player_client=default,-android_vr")
        self.assertEqual(attempts[1], ("youtube:player_client=android", "ba/b"))

    def test_retry_on_format_unavailable(self):
        err = "ERROR: Requested format is not available. Use --list-formats for a list of available formats"
        self.assertFalse(ytdlp_forbidden_error(err))
        self.assertTrue(ytdlp_should_retry_youtube(err))

    def test_403_hint_mentions_cookies_and_proxy(self):
        stderr = "ERROR: unable to download video data: HTTP Error 403: Forbidden"
        self.assertTrue(ytdlp_forbidden_error(stderr))
        hint = ytdlp_error_hint(stderr)
        self.assertIn("403", hint)
        self.assertIn("youtube-cookies.txt", hint)
        self.assertIn("proxy", hint.lower())


if __name__ == "__main__":
    unittest.main()
