# AMT / melody transcription fixtures

Place local WAV/MP3 clips here for offline melody backend A/B (not committed).

```bash
# From local-resolver/
python3 scripts/eval_melody_backends.py test_fixtures/amt/piano-clip.wav \
  --music-type piano \
  --snapshot /tmp/melody-backends-ab

python3 eval_transcription.py test_fixtures/amt/piano-clip.wav \
  --melody-backends auto,basic-pitch,kong \
  --music-type piano \
  --snapshot /tmp/transcription-ab
```

Compare snapshots for `inputsUsed` (`stemModel`, `melodyVoicing`, `melodyBackend`),
note counts, and warning codes. See also `../chords/README.md` for the shared
trust A/B recipe with chords.
