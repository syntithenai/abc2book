import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import gpu_prep


class GpuPrepTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_skips(self):
        with patch.object(gpu_prep, "GPU_PREP_ENABLED", False):
            status = await gpu_prep.ensure_gpu_headroom(force=True)
        self.assertEqual(status.get("skipped"), "disabled")

    async def test_stop_and_free_on_force(self):
        with patch.object(gpu_prep, "GPU_PREP_ENABLED", True):
            with patch.object(gpu_prep, "_last_prep_monotonic", 0.0):
                with patch.object(
                    gpu_prep, "stop_qwen", new_callable=AsyncMock
                ) as stop:
                    with patch.object(
                        gpu_prep, "free_comfy", new_callable=AsyncMock
                    ) as free:
                        stop.return_value = "already_down"
                        free.return_value = "comfy_unreachable"
                        status = await gpu_prep.ensure_gpu_headroom(force=True)
        self.assertEqual(status["qwen"], "already_down")
        self.assertEqual(status["comfy"], "comfy_unreachable")
        stop.assert_awaited()
        free.assert_awaited()


if __name__ == "__main__":
    unittest.main()
