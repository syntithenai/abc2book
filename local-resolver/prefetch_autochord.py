"""Predownload autochord model and VAMP plugin during image build."""

import importlib.util
import os
from shutil import copy

import gdown
import vamp

_CHROMA_VAMP_KEY = "nnls-chroma:nnls-chroma"
_CHORD_MODEL_URL = "https://drive.google.com/uc?id=1XBn7FyYjF8Ff6EuC7PjwwPzFBLRXGP7n"
_EXT_RES_DIR = os.path.join(os.path.expanduser("~"), ".autochord")
_CHORD_MODEL_DIR = os.path.join(_EXT_RES_DIR, "chroma-seq-bilstm-crf-v1")
_SAMPLE_RATE = 44100


def _autochord_resource_path(relative_path):
    spec = importlib.util.find_spec("autochord")
    if not spec or not spec.submodule_search_locations:
        raise RuntimeError("autochord package not found")
    return os.path.join(spec.submodule_search_locations[0], relative_path)


def download_model():
    if os.path.exists(_CHORD_MODEL_DIR):
        print(f"autochord: model already present at {_CHORD_MODEL_DIR}")
        return

    os.makedirs(_EXT_RES_DIR, exist_ok=True)
    model_zip = os.path.join(_EXT_RES_DIR, "model.zip")
    gdown.download(_CHORD_MODEL_URL, model_zip, quiet=False)
    model_files = gdown.extractall(model_zip)
    model_files.sort()
    os.remove(model_zip)
    print(f"autochord: model downloaded to {model_files[0]}")


def setup_chroma_vamp():
    chroma_vamp_lib = _autochord_resource_path("res/nnls-chroma.so")
    vamp_paths = vamp.vampyhost.get_plugin_path()
    vamp_lib_fn = os.path.basename(chroma_vamp_lib)

    for path in vamp_paths:
        try:
            target = os.path.join(path, vamp_lib_fn)
            if not os.path.exists(target):
                os.makedirs(path, exist_ok=True)
                copy(chroma_vamp_lib, target)
            vamp.vampyhost.load_plugin(
                _CHROMA_VAMP_KEY,
                _SAMPLE_RATE,
                vamp.vampyhost.ADAPT_NONE,
            )
            print(f"autochord: VAMP plugin ready in {path}")
            return
        except Exception:
            continue

    raise RuntimeError("Failed to set up NNLS-Chroma VAMP plugin")


if __name__ == "__main__":
    download_model()
    setup_chroma_vamp()
