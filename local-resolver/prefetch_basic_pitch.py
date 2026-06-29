"""Predownload basic-pitch model weights during image build."""

import contextlib
import io


def main():
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import Model

        Model(ICASSP_2022_MODEL_PATH)
    print("basic-pitch: ICASSP 2022 model prefetched")


if __name__ == "__main__":
    main()
