#!/usr/bin/env python3
"""Install crepe with model weights pre-fetched.

crepe's setup.py downloads five .h5.bz2 files from GitHub during install.
That often fails in Docker builds (503/timeouts) and is hard to retry inside
PEP 517 isolated builds. We download and decompress the weights first, then
install from the populated source tree with --no-build-isolation.
"""

from __future__ import annotations

import bz2
import os
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

CREPE_VERSION = "0.0.16"
CREPE_TARBALL_URL = (
    "https://files.pythonhosted.org/packages/b3/09/e43fac5dd0e2805309f7ee32634d00a355cf58cdcc94b576e79ffd535ef3/"
    f"crepe-{CREPE_VERSION}.tar.gz"
)
WEIGHT_BASE_URL = "https://github.com/marl/crepe/raw/models/"
MODEL_CAPACITIES = ("tiny", "small", "medium", "large", "full")
MAX_DOWNLOAD_ATTEMPTS = 5


def _download(url: str, dest: str) -> None:
    tmp = dest + ".partial"
    last_exc: Exception | None = None
    for attempt in range(1, MAX_DOWNLOAD_ATTEMPTS + 1):
        try:
            urllib.request.urlretrieve(url, tmp)
            os.replace(tmp, dest)
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            last_exc = exc
            if os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
            if attempt < MAX_DOWNLOAD_ATTEMPTS:
                delay = min(2**attempt, 30)
                print(
                    f"crepe: download attempt {attempt} failed ({exc}); retrying in {delay}s",
                    file=sys.stderr,
                )
                time.sleep(delay)
    raise RuntimeError(
        f"crepe: failed to download {url} after {MAX_DOWNLOAD_ATTEMPTS} attempts: {last_exc}"
    )


def _ensure_weights(source_root: str) -> None:
    weights_dir = os.path.join(source_root, "crepe")
    os.makedirs(weights_dir, exist_ok=True)
    for capacity in MODEL_CAPACITIES:
        weight_name = f"model-{capacity}.h5"
        weight_path = os.path.join(weights_dir, weight_name)
        if os.path.isfile(weight_path):
            continue

        compressed_name = weight_name + ".bz2"
        compressed_path = os.path.join(weights_dir, compressed_name)
        if not os.path.isfile(compressed_path):
            print(f"crepe: downloading {compressed_name}")
            _download(WEIGHT_BASE_URL + compressed_name, compressed_path)

        print(f"crepe: decompressing {compressed_name}")
        with bz2.BZ2File(compressed_path, "rb") as source, open(weight_path, "wb") as target:
            target.write(source.read())
        os.unlink(compressed_path)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="crepe-install-") as tmp:
        tarball_path = os.path.join(tmp, f"crepe-{CREPE_VERSION}.tar.gz")
        print(f"crepe: downloading source {CREPE_VERSION}")
        _download(CREPE_TARBALL_URL, tarball_path)

        source_root = os.path.join(tmp, f"crepe-{CREPE_VERSION}")
        with tarfile.open(tarball_path, "r:gz") as archive:
            archive.extractall(tmp)

        _ensure_weights(source_root)

        print("crepe: installing with --no-build-isolation")
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--no-build-isolation",
                source_root,
            ],
            check=True,
        )

    print("crepe: install complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
