# Metronome and drum timing contract

This document is the source of truth for MIDI playback count-in, during-playback
metronome/drums, and handoff behaviour. Changes to metronome timing **must** update
the corresponding tests listed in the regression section below.

## Beat grid

| Concept | Definition |
|---------|------------|
| **Rhythm grid** | Configured metronome rhythm (`beatsPerBar`, `pulsesPerBeat`, `accents`, optional `drumPattern`). All clicks and drum hits map to **slots** via `slotsPerBar` in `metronomeRhythmPresets.js`. |
| **Music clock** | `beatCallback` in `useAbcSynth.js` → `currentTime.current` via `timingProgressToAudioSeconds` in `playbackStateLogic.js`. The **only** playhead writer during MIDI playback. |
| **Tempo** | `computePlaybackMetronomeTempo` from `millisecondsPerMeasure / beatsPerMeasure / tempoFactor`. Used for TimingCallbacks `qpm` and click spacing. |
| **Slot duration** | `60 / tempo / pulsesForBeat(beatIndex)` seconds per slot (swing may redistribute within a beat). |

### abcjs vs rhythm beat units

abcjs `getBeatsPerMeasure()` follows the tune's `L:` default (often **2** half-note
beats per 4/4 bar). The metronome rhythm preset uses **4** quarter-note beats per 4/4
bar. Count-in **must** use `rhythmAlignedCountInInput` so click count matches the
rhythm grid, not raw abcjs beat count.

## Count-in (no music playing)

| Case | Expected clicks | Gap before first note |
|------|----------------|----------------------|
| 4/4, 1 bar, no anacrusis | 4 quarter clicks | 1 slot (next subdivision), then music at audio ratio 0 |
| 4/4, 1-beat anacrusis | 3 clicks | 1 slot, then pickup on correct upbeat |
| 6/8, 1 bar | 6 eighth clicks | 1 eighth slot |
| `countInBarOnly` (practice) | Full bar from time signature, ignore implicit pickup | Standard 1-slot gap |
| Fractional pickup (`delayMs > 0`) | `floor(totalBeatsBeforeMusic)` clicks | `delayMs` wall-clock wait |

**During-playback handoff:** music starts on the **next metronome slot** after the last
count-in slot (`onSlotChange`), not via `setTimeout(beatDuration)`.

**Count-in-only (metronome stops):** use `Metronome` completion callback +
`countInMusicStartDelayMs`.

## During playback (music playing)

| Requirement | Rule |
|-------------|------|
| Zero drift | Clicks/drums scheduled from the **music clock** via `musicLockedMetronomeScheduler.js`, not a free-running oscillator. |
| Scheduling | On each `beatCallback` (and start/resume/seek), schedule slot boundaries in `[musicSeconds, musicSeconds + LOOKAHEAD]` onto `audioContext.currentTime`. |
| Seek | Reset scheduler state; re-anchor from new `musicSeconds`. |
| Tempo change | Reset scheduler; reschedule lookahead at new tempo. |
| Seamless handoff | Stop count-in `Metronome` interval; music-locked scheduler continues without replaying the current slot. |

## Drums

Drums use the **same slot grid and scheduler as clicks** (`playRhythmSlot` → `playDrumSlot`).

- `drumPattern.resolution` must equal `slotsPerBar(rhythm)` (enforced in `normalizeRhythmConfig`).
- Swing (`drumPattern.swing`, 0–0.5) lengthens the first pulse and shortens the second within each beat that has two or more pulses.

## Do not

- Start `Metronome` with `maxBeats = 0` during playback (infinite free-running mode). Count-in only.
- Use `setTimeout` for beat alignment during playback.
- Pass raw abcjs `getBeatsPerMeasure()` to count-in without rhythm alignment.
- Put timing math inline in `useAbcSynth.js` — use `playbackStateLogic.js`, `metronomeRhythmPresets.js`, `musicLockedMetronomeScheduler.js`.

## Regression tests required

Any PR touching metronome timing must pass:

- `src/playbackStateLogic.test.js` (count-in, slot mapping, rhythm alignment)
- `src/metronomeRhythmPresets.test.js`
- `src/musicLockedMetronomeScheduler.test.js`
- `e2e/playback-smoke.js` (count-in beat count)

## Example timelines (4/4, 120 BPM, no anacrusis)

```
Count-in:  |1   2   3   4| gap |MUSIC START (slot 0 accent)
            click click click click  (1 beat)  note...
```

6/8 one bar count-in at 120 BPM (beat = dotted quarter, 6 eighth slots):

```
Count-in:  |1-2-3 4-5-6| gap |MUSIC
            x x x x x x    (1 eighth)  ...
```
