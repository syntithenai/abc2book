# Chord recognition fixtures

Place short WAV/MP3 clips here for offline A/B runs, optionally with matching
`.lab` ground truth (start end label per line, mir_eval style).

Example files:

- `example.lab` — sample ground-truth progression (no audio committed)
- `your-song.wav` + `your-song.lab` — local only

```bash
# From local-resolver/
python3 scripts/eval_chords.py test_fixtures/chords/your-song.wav \
  --lab test_fixtures/chords/your-song.lab \
  --backends auto,btc,madmom,autochord \
  --snapshot /tmp/chord-snapshots
```

## Transcription trust A/B recipe

Use local WAVs only (do not commit audio). Snapshot under `/tmp` and compare
`inputsUsed`, warning codes, note counts, and unique chord labels.

```bash
# Chords backends
python3 scripts/eval_chords.py test_fixtures/chords/piano-clip.wav \
  --backends auto,btc \
  --snapshot /tmp/chord-ab

# Melody backends (piano should prefer Kong when installed)
python3 scripts/eval_melody_backends.py test_fixtures/chords/piano-clip.wav \
  --music-type piano \
  --snapshot /tmp/melody-ab

# Full analyze-style transcription gate (auto vs basic-pitch vs kong)
python3 eval_transcription.py test_fixtures/chords/piano-clip.wav \
  --melody-backends auto,basic-pitch,kong \
  --music-type piano \
  --snapshot /tmp/transcription-ab
```

Suggested clip types for a fair gate: solo piano, sung vocal + band, instrumental
band. After each run, check the snapshot JSON for:

- `inputsUsed.stemModel` — piano runs should be `htdemucs_6s`
- `inputsUsed.keySource` — `tune` | `chords` | `melody` | `none`
- `inputsUsed.melodyVoicing` — piano defaults to `full`
- `warnings` — e.g. `stems_separated_inline`, `stem_model_mismatch`, `amt_fallback_basic_pitch`
- chord unique labels / melody note counts vs your ear or `.lab` / MIDI reference

Do not change `auto` melody defaults until this A/B looks better on your fixtures.

Audio binaries are not committed; keep local copies under this directory.
