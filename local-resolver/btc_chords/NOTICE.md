# Third-party notice: BTC chord model

This directory vendors inference code derived from:

- Park et al., "A Bi-Directional Transformer for Musical Chord Recognition"
  (ISMIR 2019)
- Source: https://github.com/jayg996/BTC-ISMIR19
- License: MIT (see LICENSE)

The default maj/min checkpoint is downloaded at image build time from a public
Hugging Face mirror (`amaai-lab/music2emo` `btc_model.pt`) into
`BTC_MODEL_DIR` (default `/opt/btc-chords`). Override with
`BTC_CHECKPOINT_URL` / `BTC_CHECKPOINT_PATH` if needed.
