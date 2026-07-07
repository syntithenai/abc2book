import os
import unittest
from unittest.mock import MagicMock, patch

import prefetch_vision


class PrefetchVisionTests(unittest.TestCase):
    def test_configure_cache_env(self):
        with patch.dict(os.environ, {}, clear=True):
            prefetch_vision._configure_cache_env()
            self.assertEqual(os.environ["PADDLE_PDX_CACHE_HOME"], "/opt/vision-cache")

    @patch("prefetch_vision.subprocess.run")
    def test_prefetch_homr_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="ok", stderr="")
        prefetch_vision._prefetch_homr()
        mock_run.assert_called_once()

    def test_verify_paddle_models_missing(self):
        with patch.object(prefetch_vision.Path, "is_dir", return_value=False):
            with self.assertRaises(RuntimeError):
                prefetch_vision._verify_paddle_models()


if __name__ == "__main__":
    unittest.main()
