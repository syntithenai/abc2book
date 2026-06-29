"""Predownload madmom RNN weights during image build."""

import contextlib
import io


def main():
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        # Only the RNN processors download neural-network weights at build time.
        # The DBN trackers are deterministic and require no downloads (and their
        # constructors need runtime args like fps), so we skip them here.
        from madmom.features.beats import RNNBeatProcessor
        from madmom.features.downbeats import RNNDownBeatProcessor

        RNNBeatProcessor()
        RNNDownBeatProcessor()
    print("madmom: beat and downbeat models prefetched")


if __name__ == "__main__":
    main()
