import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import subprocess_utils


class SubprocessUtilsTests(unittest.TestCase):
    def test_heavy_job_slot_is_reentrant(self):
        async def run():
            with patch("gpu_prep.ensure_gpu_headroom", new_callable=AsyncMock) as mock_prep:
                mock_prep.return_value = {"skipped": "test"}
                async with subprocess_utils.heavy_job_slot():
                    async with subprocess_utils.heavy_job_slot():
                        return subprocess_utils._heavy_job_depth.get()

        depth = asyncio.run(run())
        self.assertEqual(depth, 1)

    def test_terminate_subprocess_tree_noop_when_exited(self):
        proc = MagicMock()
        proc.returncode = 0
        asyncio.run(subprocess_utils.terminate_subprocess_tree(proc))

    def test_run_subprocess_kills_on_cancel(self):
        async def run():
            with patch(
                "subprocess_utils.terminate_subprocess_tree",
                new_callable=AsyncMock,
            ) as mock_kill:
                with patch(
                    "subprocess_utils.asyncio.create_subprocess_exec",
                    new_callable=AsyncMock,
                ) as mock_exec:
                    mock_proc = MagicMock()
                    mock_proc.returncode = None
                    mock_proc.pid = 424242

                    async def slow_communicate():
                        await asyncio.sleep(10)
                        return b"", b""

                    mock_proc.communicate = slow_communicate
                    mock_exec.return_value = mock_proc

                    task = asyncio.create_task(
                        subprocess_utils.run_subprocess_with_disconnect(["sleep", "10"])
                    )
                    await asyncio.sleep(0.05)
                    task.cancel()
                    with self.assertRaises(asyncio.CancelledError):
                        await task
                    mock_kill.assert_called_once_with(mock_proc)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
