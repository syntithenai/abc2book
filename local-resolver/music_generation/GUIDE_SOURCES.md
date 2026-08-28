# Practice-track guide sources

Stable Audio init-audio **restyles** the FluidSynth guide WAV. It cannot invent good harmony from clunky MIDI.

## Sources

| Source | How built | When used |
|--------|-----------|-----------|
| **chord_chart** (default) | Melody-only `score.mid` + harmony from `chordsPerBar` via `guide_harmony.py` | When the timing plan includes a chord chart |
| **abcjs** (legacy) | `abcjs.synth.getMidiFile({ chordsOff: false })` boom-chick | When no chord chart; spike A/B only |

## Listen gate

Before tuning prompts or `initNoiseLevel`, export and listen to the guide alone:

```bash
python3 music_generation/scripts/export_guide_only.py \
  --score /path/to/score.mid \
  --timing-plan /path/to/plan.json \
  --out /tmp/guide-check \
  --compare-abcjs
```

Checklist (ear is final authority):

1. Melody pitches clear and complete
2. Harmony matches chord chart (not random GM pulses)
3. No polka/oom-pa bass (especially classical)
4. Simple pads/strums OK; clunky boom-chick not OK

Job cache artifacts: `score.mid`, `score-guide-style.mid`, `guide.wav`.

## Spike matrix

```bash
python3 music_generation/scripts/fidelity_spike_amazing_grace.py \
  --melody melody.wav --score score.mid --timing-plan plan.json
```

Compares `{abcjs, chord_chart} × {classical, trad} × {fast, balanced}` with paired guide + output WAVs.
