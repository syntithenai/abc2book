# High-Quality Pitch & Tempo Control Implementation Plan

**Date**: 17 June 2026  
**Status**: Ready for implementation  
**Objective**: Integrate professional-grade pitch and tempo adjustment using SoundTouch.js (WSOLA) for ABC/MIDI playback in abc2book.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture (As-Is)](#current-architecture-as-is)
3. [Why Previous Approach Failed](#why-previous-approach-failed)
4. [Target Architecture (To-Be)](#target-architecture-to-be)
5. [SoundTouch.js API (Correct Usage)](#soundtouchjs-api-correct-usage)
6. [Implementation Phases](#implementation-phases)
7. [Detailed Code Changes](#detailed-code-changes)
8. [Component Specifications](#component-specifications)
9. [Migration: Removing Warp-Based Tempo](#migration-removing-warp-based-tempo)
10. [Testing Strategy](#testing-strategy)
11. [Quality Assurance](#quality-assurance)
12. [Known Limitations & Future Work](#known-limitations--future-work)

---

## Executive Summary

**Critical finding from codebase review (June 2026):**

The original plan created a React hook (`useHighQualityAudioPlayback`) that initialized SoundTouch but **never connected it to the audio pipeline**. Sliders would update state without affecting playback.

**Correct integration point:** `src/useAbcSynth.js` — this hook owns abcjs `CreateSynth` playback, pre-rendered `AudioBuffer`s, timing callbacks, and the media controller sync.

**Correct SoundTouch API:** `import { PitchShifter } from 'soundtouchjs'` — not `import SoundTouch from 'soundtouchjs'`.

**Dependency status:** `soundtouchjs@^0.3.0` is already in `package.json`.

---

## Current Architecture (As-Is)

```
ABC notation
    ↓
useAbcTools.js (abc2json / json2abc)
    ↓
Abc.js → useAbcSynth.js
    ↓
abcjs.renderAbc() → visualObj
    ↓
abcjs.synth.CreateSynth()
    ├─ init() + prime() → single stereo AudioBuffer (audioBuffers[0])
    ├─ start() → AudioBufferSourceNode → destination  ← changes pitch when slowed
    └─ TimingCallbacks → cursor + mediaController sync
    ↓
MusicSingle.js passes warp={mediaController.playbackSpeed}
    ↓
Abc.js multiplies tune.tempo by warp → full audio re-render on speed change
```

**Problems with current tempo control:**

| Mechanism | Location | Effect |
|-----------|----------|--------|
| `warp` prop | `Abc.js` line 25–28 | Multiplies BPM before synth render — **re-renders entire audio** |
| `playbackSpeed` | `useTuneBookMediaController.js` | Sets `HTMLMediaElement.playbackRate` for YouTube/audio files — **also shifts pitch** |
| `PlaybackSpeedSelector` | `MediaPlayerOptionsModal.js` | Affects external media only; MIDI uses warp instead |

There is **no independent pitch control** today. Transpose (`TransposeModal`) changes the ABC notation and triggers re-render — that is notation transpose, not playback pitch shift.

---

## Why Previous Approach Failed

### Wrong library API

```javascript
// ❌ WRONG — this constructor does not exist for playback
import SoundTouch from 'soundtouchjs';
soundTouchRef.current = new SoundTouch(sampleRate);
soundTouchRef.current.pitch = pitchRatio;
```

```javascript
// ✅ CORRECT — PitchShifter wraps a decoded AudioBuffer
import { PitchShifter } from 'soundtouchjs';
const shifter = new PitchShifter(audioContext, audioBuffer, 16384);
shifter.tempo = 0.75;           // 75% speed, pitch preserved
shifter.pitchSemitones = 2;     // +2 semitones, tempo preserved
shifter.connect(gainNode);
gainNode.connect(audioContext.destination);
```

### Hook in wrong layer

Calling `useHighQualityAudioPlayback(gaudioContext)` from `Abc.js` fails because:

1. `gaudioContext` is a **ref** (`gaudioContext.current`), not the context at hook init time
2. `mediaController` has **no `audioContext` property** — the context is created inside `useAbcSynth.primeAudio()`
3. A separate hook instance in `MusicSingle.js` cannot control playback owned by `useAbcSynth` inside `Abc.js`

### useMidiSynth.js is not the main path

`useMidiSynth.js` (midi-player-js + soundfont-player) is a separate code path. Main tune playback goes through `useAbcSynth.js` → abcjs CreateSynth. Do **not** modify `useMidiSynth.js` for this feature.

---

## Target Architecture (To-Be)

```
ABC notation (base tempo, no warp)
    ↓
useAbcSynth.js
    ├─ primeTune() → CreateSynth → audioBuffers[0] (stereo mix)
    ├─ initPitchShifter(audioBuffers[0]) → PitchShifter instance
    ├─ startMidiAndTiming():
    │     pitchShifter.connect(gainNode) → destination   ← WSOLA output
    │     timingCallbacks.start()                          ← cursor sync
    ├─ pitchShifter.on('play') → mediaController.onAbcTimeUpdate()
    └─ Real-time: shifter.tempo / shifter.pitchSemitones (no re-render)
    ↓
PitchTempoControls.js (UI modal)
    ↓
MusicSingle.js button → props → Abc.js → useAbcSynth setters
```

**External media (YouTube, MP3 links):** Keep existing `playbackSpeed` / `PlaybackSpeedSelector` behavior. Pitch/tempo controls apply to **ABC synth playback only** (when `mediaLinkNumber === null`). Document this in the UI.

---

## SoundTouch.js API (Correct Usage)

Reference: `node_modules/soundtouchjs/README.md` and `public/example.js`

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `new PitchShifter(ctx, audioBuffer, bufferSize)` | constructor | `bufferSize`: 1024–16384; use **16384** for quality |
| `shifter.tempo` | number | Speed multiplier (0.25–2.0). 1.0 = normal |
| `shifter.pitchSemitones` | number | ±12 semitones (use fractional for cents) |
| `shifter.pitch` | number | Frequency ratio (2^(semitones/12)) — prefer pitchSemitones |
| `shifter.connect(node)` | method | Connect to GainNode or destination |
| `shifter.disconnect()` | method | Pause output |
| `shifter.on('play', cb)` | event | `{ timePlayed, formattedTimePlayed, percentagePlayed }` |
| `shifter.percentagePlayed` | number/setter | 0–100, for seek |
| `shifter.duration` | number | Source buffer duration in seconds |

**Fine tuning:** Combine into semitones: `pitchSemitones = pitch + fineTuneCents / 100`

**End of playback:** PitchShifter calls internal `onEnd` when buffer exhausted — wire this to repeat/end logic.

---

## Implementation Phases

| Phase | Task | Est. |
|-------|------|------|
| 1 | Create `pitchTempoUtils.js` + `pitchTempoShifter.js` | 1–2 h |
| 2 | Integrate into `useAbcSynth.js` (core) | 3–4 h |
| 3 | Create `PitchTempoControls.js` + CSS | 2 h |
| 4 | Wire `Abc.js` + `MusicSingle.js`; remove warp for MIDI | 1–2 h |
| 5 | Test tempo, pitch, seek, pause, repeats, cursor sync | 2–3 h |

---

## Detailed Code Changes

### File 1: `src/pitchTempoUtils.js` (NEW)

Pure utility functions — no React, no audio.

```javascript
export const TEMPO_MIN = 0.25;
export const TEMPO_MAX = 2.0;
export const PITCH_MIN = -12;
export const PITCH_MAX = 12;
export const FINE_TUNE_MIN = -50;
export const FINE_TUNE_MAX = 50;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function combinedPitchSemitones(pitchSemitones, fineTuneCents) {
  return clamp(pitchSemitones, PITCH_MIN, PITCH_MAX) + clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX) / 100;
}

export function formatPitchDisplay(pitch) {
  if (pitch === 0) return 'Original';
  return `${pitch > 0 ? '+' : ''}${pitch} st`;
}

export function formatFineTuneDisplay(cents) {
  if (cents === 0) return '0¢';
  return `${cents > 0 ? '+' : ''}${cents}¢`;
}
```

---

### File 2: `src/pitchTempoShifter.js` (NEW)

Non-React wrapper around PitchShifter. Owns connect/disconnect lifecycle.

```javascript
import { PitchShifter } from 'soundtouchjs';
import { clamp, combinedPitchSemitones, TEMPO_MIN, TEMPO_MAX, PITCH_MIN, PITCH_MAX, FINE_TUNE_MIN, FINE_TUNE_MAX } from './pitchTempoUtils';

const BUFFER_SIZE = 16384;

export default class PitchTempoShifter {
  constructor(audioContext, audioBuffer, onTimeUpdate, onEnded) {
    this.audioContext = audioContext;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this.shifter = new PitchShifter(audioContext, audioBuffer, BUFFER_SIZE, onEnded);
    this.shifter.on('play', (detail) => {
      if (onTimeUpdate) onTimeUpdate(detail.timePlayed, detail.percentagePlayed / 100);
    });
    this._tempo = 1.0;
    this._pitch = 0;
    this._fineTune = 0;
    this._connected = false;
  }

  get duration() {
    return this.shifter.duration;
  }

  applySettings(tempo, pitchSemitones, fineTuneCents) {
    this._tempo = clamp(tempo, TEMPO_MIN, TEMPO_MAX);
    this._pitch = clamp(pitchSemitones, PITCH_MIN, PITCH_MAX);
    this._fineTune = clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX);
    this.shifter.tempo = this._tempo;
    this.shifter.pitchSemitones = combinedPitchSemitones(this._pitch, this._fineTune);
  }

  getState() {
    return { tempo: this._tempo, pitch: this._pitch, fineTune: this._fineTune };
  }

  connect() {
    if (!this._connected) {
      this.shifter.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      this._connected = true;
    }
  }

  disconnect() {
    if (this._connected) {
      this.shifter.disconnect();
      this.gainNode.disconnect();
      this._connected = false;
    }
  }

  seek(ratio) {
    this.shifter.percentagePlayed = clamp(ratio, 0, 1) * 100;
  }

  getCurrentTime() {
    return this.shifter.timePlayed;
  }

  destroy() {
    this.disconnect();
    this.shifter.off();
  }
}
```

---

### File 3: `src/useAbcSynth.js` (MODIFY — critical)

Add imports at top:

```javascript
import PitchTempoShifter from './pitchTempoShifter';
```

Add refs after existing refs (~line 20):

```javascript
const pitchShifterRef = useRef(null);
const pitchTempoSettingsRef = useRef({ tempo: 1.0, pitch: 0, fineTune: 0 });
const usePitchShifterRef = useRef(true); // set false to fall back to native playback
```

Add pitch/tempo API functions (before `return` statement):

```javascript
function destroyPitchShifter() {
  if (pitchShifterRef.current) {
    pitchShifterRef.current.destroy();
    pitchShifterRef.current = null;
  }
}

function initPitchShifter(audioContext, audioBuffer) {
  destroyPitchShifter();
  if (!audioBuffer || !usePitchShifterRef.current) return;

  pitchShifterRef.current = new PitchTempoShifter(
    audioContext,
    audioBuffer,
    function onTimeUpdate(timePlayed, ratio) {
      if (gmidiBuffer.current && props.mediaController) {
        props.mediaController.onAbcTimeUpdate(timePlayed);
        currentTime.current = timePlayed;
      }
    },
    function onEnded() {
      // Mirror beatCallback end-of-tune logic — call stopPlaying + props.onEnded
      stopPlaying();
      if (props.onEnded) props.onEnded();
    }
  );
  pitchShifterRef.current.applySettings(
    pitchTempoSettingsRef.current.tempo,
    pitchTempoSettingsRef.current.pitch,
    pitchTempoSettingsRef.current.fineTune
  );
}

function setTempoFactor(factor) {
  pitchTempoSettingsRef.current.tempo = factor;
  if (pitchShifterRef.current) pitchShifterRef.current.applySettings(factor, pitchTempoSettingsRef.current.pitch, pitchTempoSettingsRef.current.fineTune);
}

function setPitchSemitones(semitones) {
  pitchTempoSettingsRef.current.pitch = semitones;
  if (pitchShifterRef.current) pitchShifterRef.current.applySettings(pitchTempoSettingsRef.current.tempo, semitones, pitchTempoSettingsRef.current.fineTune);
}

function setFineTuneCents(cents) {
  pitchTempoSettingsRef.current.fineTune = cents;
  if (pitchShifterRef.current) pitchShifterRef.current.applySettings(pitchTempoSettingsRef.current.tempo, pitchTempoSettingsRef.current.pitch, cents);
}

function getPitchTempoState() {
  return { ...pitchTempoSettingsRef.current };
}

function resetPitchTempo() {
  setTempoFactor(1.0);
  setPitchSemitones(0);
  setFineTuneCents(0);
}
```

**Modify `assignStateOnCompletion`** — after `setMidiBuffer(midiBuffer)`:

```javascript
if (midiBuffer && midiBuffer.audioBuffers && midiBuffer.audioBuffers[0]) {
  initPitchShifter(audioContext, midiBuffer.audioBuffers[0]);
}
```

**Modify `startMidiAndTiming`** — replace direct `gmidiBuffer.start()`:

```javascript
function startMidiAndTiming() {
  try {
    if (pitchShifterRef.current) {
      pitchShifterRef.current.connect();
    } else if (gmidiBuffer.current) {
      gmidiBuffer.current.start();
    }
    if (gtimingCallbacks.current) gtimingCallbacks.current.start();
  } catch (e) {
    console.log('startMidiAndTiming ERROR', e);
  }
}
```

**Modify `stopPlaying`** — add before `gmidiBuffer.pause()`:

```javascript
if (pitchShifterRef.current) pitchShifterRef.current.disconnect();
```

**Modify `seekPlayer`** — after `gmidiBuffer.seek`:

```javascript
if (pitchShifterRef.current) pitchShifterRef.current.seek(seekTo);
```

**Modify `resetAudioState`** — add:

```javascript
destroyPitchShifter();
```

**Remove or bypass warp-based re-render on playbackSpeed change** (~lines 167–171):

```javascript
// OLD: stopPlaying(); resetAudioState(); on playbackSpeed change
// NEW: apply tempo live without re-render
if (props.mediaController.playbackSpeed !== lastPlaybackSpeed) {
  setTempoFactor(props.mediaController.playbackSpeed);
}
```

**Modify metronome warp** (~line 627): use `pitchTempoSettingsRef.current.tempo` instead of `props.warp`:

```javascript
var effectiveTempo = tune.tempo * pitchTempoSettingsRef.current.tempo;
metronome.current = new Metronome(gaudioContext.current, effectiveTempo, ...);
```

**Export new functions** in return object:

```javascript
setTempoFactor, setPitchSemitones, setFineTuneCents, getPitchTempoState, resetPitchTempo,
```

---

### File 4: `src/components/PitchTempoControls.js` (NEW)

Same UI as original plan (sliders + presets). Props:

```javascript
<PitchTempoControls
  show={boolean}
  onHide={function}
  getState={function}           // () => { tempo, pitch, fineTune }
  onTempoChange={function}      // (factor) => void
  onPitchChange={function}      // (semitones) => void
  onFineTuneChange={function}   // (cents) => void
  onReset={function}            // () => void
/>
```

Remove dependency on `audioPlayback` hook object — use callback props from `useAbcSynth` instead.

Add note in info box: *"Applies to synthesized ABC playback. YouTube and audio links use the separate Playback Speed control."*

---

### File 5: `src/components/PitchTempoControls.css` (NEW)

Unchanged from original plan — see IMPLEMENTATION_CHECKLIST.md Step 2.3.

---

### File 6: `src/components/Abc.js` (MODIFY)

Add imports:

```javascript
import PitchTempoControls from './PitchTempoControls';
```

Destructure new methods from `abcSynth`:

```javascript
var { ..., setTempoFactor, setPitchSemitones, setFineTuneCents, getPitchTempoState, resetPitchTempo } = abcSynth;
```

Add state (or use props from parent for MusicSingle):

```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false);
// Allow parent to control modal visibility:
// useEffect(() => { if (props.showPitchTempoControls !== undefined) setShowPitchTempoControls(props.showPitchTempoControls); }, [props.showPitchTempoControls]);
```

Add to JSX (inside the `<>` fragment, after TempoControl):

```javascript
{!props.hidePitchTempoButton && (
  <Button onClick={() => setShowPitchTempoControls(true)} variant="outline-secondary" size="sm" title="Pitch & Tempo">
    🎵 Pitch/Tempo
  </Button>
)}
<PitchTempoControls
  show={showPitchTempoControls}
  onHide={() => setShowPitchTempoControls(false)}
  getState={getPitchTempoState}
  onTempoChange={setTempoFactor}
  onPitchChange={setPitchSemitones}
  onFineTuneChange={setFineTuneCents}
  onReset={resetPitchTempo}
/>
```

**Remove warp tempo multiplication** in `updateOnChange()` (lines 25–28):

```javascript
// DELETE these lines — render at base tempo always:
// var useWarp = props.warp >= 0.25 && props.warp <= 2 ? props.warp : 1
// tune.tempo = tune.tempo > 0 ? tune.tempo * useWarp : 100 * useWarp
```

**Remove `props.warp` from useEffect dependency** (line 68) — or keep warp prop but ignore it for tempo.

**On mount / when parent passes initial tempo:** sync from `mediaController.playbackSpeed`:

```javascript
useEffect(() => {
  if (props.mediaController && props.mediaController.playbackSpeed) {
    setTempoFactor(props.mediaController.playbackSpeed);
  }
}, [props.mediaController?.playbackSpeed]);
```

---

### File 7: `src/components/MusicSingle.js` (MODIFY)

**Change Abc warp prop** (lines 518–519):

```javascript
// OLD: warp={props.mediaController.playbackSpeed}
// NEW: warp={1}  — tempo handled by PitchShifter at playback time
warp={1}
```

**Add pitch/tempo button** in `music-buttons` div (~line 371), inside `{props.viewMode === 'music' && (...)}`:

```javascript
{props.viewMode === 'music' && props.tunebook.hasNotesOrChords(tune) && (
  <Button
    onClick={() => setShowPitchTempoControls(true)}
    variant="outline-secondary"
    size="sm"
    title="Adjust pitch and tempo"
    style={{ float: 'left', marginLeft: '0.3em' }}
  >
    🎵 Pitch/Tempo
  </Button>
)}
```

**Add state:**

```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false);
```

**Pass to Abc:**

```javascript
showPitchTempoControls={showPitchTempoControls}
onPitchTempoControlsHide={() => setShowPitchTempoControls(false)}
hidePitchTempoButton={true}  // button lives in MusicSingle toolbar
```

**In Abc.js**, sync external show prop:

```javascript
useEffect(() => {
  if (props.showPitchTempoControls) setShowPitchTempoControls(true);
}, [props.showPitchTempoControls]);
```

---

## Component Specifications

### PitchTempoControls

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `show` | boolean | yes | Modal visibility |
| `onHide` | function | yes | Close handler |
| `getState` | function | yes | Returns `{ tempo, pitch, fineTune }` |
| `onTempoChange` | function | yes | `(0.25–2.0) => void` |
| `onPitchChange` | function | yes | `(-12 to 12) => void` |
| `onFineTuneChange` | function | yes | `(-50 to 50) => void` |
| `onReset` | function | no | Reset all to defaults |

### useAbcSynth pitch/tempo API

| Method | Description |
|--------|-------------|
| `setTempoFactor(factor)` | 0.25–2.0, live update |
| `setPitchSemitones(n)` | -12 to +12, live update |
| `setFineTuneCents(n)` | -50 to +50, live update |
| `getPitchTempoState()` | Current settings object |
| `resetPitchTempo()` | Reset to 1.0x / 0st / 0¢ |

---

## Migration: Removing Warp-Based Tempo

| File | Change |
|------|--------|
| `Abc.js` | Stop multiplying `tune.tempo` by warp |
| `MusicSingle.js` | Pass `warp={1}` to Abc |
| `useAbcSynth.js` | Apply tempo via PitchShifter; don't reset audio on playbackSpeed change |
| `MediaPlayerMedia.js` line 81–82 | Remove `tune.tempo = tune.tempo * useWarp` for MIDI path |
| `PlaybackSpeedSelector` | Add UI note: affects YouTube/audio links only |

**Audio cache:** Cache key in `getAudioHash()` includes `tune.tempo` — keep as base BPM only. Do **not** include pitch/tempo adjustment values (applied at playback).

**TimingCallbacks:** May drift slightly under extreme tempo values. Use PitchShifter `play` event for `mediaController.onAbcTimeUpdate` as source of truth during WSOLA playback.

---

## Testing Strategy

### Functional tests

| # | Test | Expected |
|---|------|----------|
| 1 | Tempo 50%, play tune | Slower, same pitch, no chipmunk effect |
| 2 | Pitch +3st, tempo 100% | Higher pitch, same speed |
| 3 | Tempo 75% + pitch -2st | Both apply independently |
| 4 | Adjust slider while playing | Smooth change, no pop/click |
| 5 | Pause / resume | Resumes from correct position |
| 6 | Seek via progress bar | PitchShifter seek matches cursor |
| 7 | Repeat mode | Re-seeks to 0 correctly |
| 8 | Change tune | PitchShifter destroyed and recreated |
| 9 | YouTube link playing | Playback speed selector still works; pitch/tempo modal shows ABC-only note |
| 10 | Preset "Slow Practice" | Tempo 75%, pitch 0 |

### Quality comparison

Compare 50% tempo against:
1. Old warp approach (should sound worse — lower pitch)
2. transpose.video (should be comparable)

---

## Quality Assurance

### Success criteria

- [ ] Tempo change does **not** re-render audio (no loading spinner on slider move)
- [ ] 50% tempo preserves pitch (WSOLA, not chipmunk/bass drop)
- [ ] ±12 semitone pitch shift without tempo change
- [ ] Cursor and seek bar stay synced during adjusted playback
- [ ] `npm run build` exits 0
- [ ] No console errors on Chrome, Firefox, Safari

### Performance targets

| Metric | Target |
|--------|--------|
| CPU during WSOLA playback | < 30% |
| Latency (buffer) | 100–200 ms acceptable |
| Slider response | < 100 ms |

---

## Known Limitations & Future Work

1. **ScriptProcessorNode deprecation:** SoundTouch.js v0.3.0 uses ScriptProcessor (not AudioWorklet). Acceptable for now; migrate to [soundtouchjs-audio-worklet](https://github.com/cutterbl/soundtouchjs-audio-worklet) later.
2. **External media:** YouTube/audio files still use native playbackRate (pitch coupling). Full WSOLA for external media requires fetching/decoding the file — out of scope.
3. **Mobile CPU:** May need to reduce buffer size or disable WSOLA on low-end devices.
4. **Notation transpose vs playback pitch:** `TransposeModal` changes ABC key; pitch slider changes playback only. Document distinction in UI.
5. **Custom user presets:** Future enhancement (localStorage).

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/pitchTempoUtils.js` | CREATE | Clamp/format helpers |
| `src/pitchTempoShifter.js` | CREATE | PitchShifter wrapper class |
| `src/useAbcSynth.js` | MODIFY | **Core audio integration** |
| `src/components/PitchTempoControls.js` | CREATE | UI modal |
| `src/components/PitchTempoControls.css` | CREATE | Styles |
| `src/components/Abc.js` | MODIFY | Wire UI + remove warp |
| `src/components/MusicSingle.js` | MODIFY | Toolbar button, warp=1 |
| ~~`src/useHighQualityAudioPlayback.js`~~ | DO NOT CREATE | Wrong API / wrong layer |
| ~~`src/useMidiSynth.js`~~ | DO NOT MODIFY | Not main playback path |

---

## References

- SoundTouch.js: https://github.com/cutterbl/SoundTouchJS
- abcjs CreateSynth: `node_modules/abcjs/src/synth/create-synth.js`
- AudioWorklet fork: https://github.com/cutterbl/soundtouchjs-audio-worklet

**Document Version**: 2.0  
**Last Updated**: 17 June 2026
