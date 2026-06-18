# Pitch & Tempo Control Implementation Checklist

**Project**: abc2book  
**Feature**: High-quality pitch & tempo for ABC synth playback (SoundTouch.js WSOLA)  
**Date**: 17 June 2026  
**Audience**: Step-by-step guide for implementers

> **Read first:** [PITCH_TEMPO_IMPLEMENTATION.md](./PITCH_TEMPO_IMPLEMENTATION.md) for architecture rationale.

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Phase 1: Verify Environment](#phase-1-verify-environment)
3. [Phase 2: Create Utility Files](#phase-2-create-utility-files)
4. [Phase 3: Integrate into useAbcSynth.js](#phase-3-integrate-into-useabcsynthjs)
5. [Phase 4: Create UI Components](#phase-4-create-ui-components)
6. [Phase 5: Modify Abc.js](#phase-5-modify-abcjs)
7. [Phase 6: Modify MusicSingle.js](#phase-6-modify-musicsinglejs)
8. [Phase 7: Clean Up Warp-Based Tempo](#phase-7-clean-up-warp-based-tempo)
9. [Phase 8: Build & Manual Testing](#phase-8-build--manual-testing)
10. [Rollback Plan](#rollback-plan)
11. [Success Criteria](#success-criteria)

---

## Before You Start

### What this feature does

- **Tempo (0.25x–2.0x):** Slow down or speed up ABC synth playback **without changing pitch**
- **Pitch (±12 semitones):** Transpose playback **without changing speed**
- **Fine tune (±50 cents):** Sub-semitone pitch adjustment

### What this feature does NOT do (v1)

- Does not affect YouTube or external audio links (those keep using `PlaybackSpeedSelector`)
- Does not replace ABC notation transpose (`TransposeModal`) — that edits the score

### Key files in the existing codebase

| File | Role |
|------|------|
| `src/useAbcSynth.js` | **Main integration point** — owns CreateSynth playback |
| `src/components/Abc.js` | Renders ABC, delegates to useAbcSynth |
| `src/components/MusicSingle.js` | Single-tune view; passes `warp` prop today |
| `src/useTuneBookMediaController.js` | `playbackSpeed` state for media player |
| `node_modules/abcjs/src/synth/create-synth.js` | Pre-renders tune to `audioBuffers[0]` |

### Do NOT create these (from v1 plan — incorrect)

- ~~`src/useHighQualityAudioPlayback.js`~~ — wrong SoundTouch API, wrong layer
- Modifications to ~~`src/useMidiSynth.js`~~ — not used for main ABC playback

---

## Phase 1: Verify Environment

### Step 1.1: Confirm soundtouchjs is installed

```bash
cd /home/stever/projects/abc2book
grep soundtouchjs package.json
npm ls soundtouchjs
```

Expected: `"soundtouchjs": "^0.3.0"` in package.json.

If missing:

```bash
npm install --save soundtouchjs
```

### Step 1.2: Confirm build works

```bash
npm run build
echo $?   # must print 0
```

### Step 1.3: Verify SoundTouch API locally

```bash
node -e "const m=require('soundtouchjs'); console.log(Object.keys(m))"
```

Expected output includes: `PitchShifter`, `SoundTouch`

---

## Phase 2: Create Utility Files

### Step 2.1: Create `src/pitchTempoUtils.js`

**Path:** `/home/stever/projects/abc2book/src/pitchTempoUtils.js`

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

**Verify:** `npm run build` → exit 0

---

### Step 2.2: Create `src/pitchTempoShifter.js`

**Path:** `/home/stever/projects/abc2book/src/pitchTempoShifter.js`

Copy the complete class from [PITCH_TEMPO_IMPLEMENTATION.md § File 2](./PITCH_TEMPO_IMPLEMENTATION.md#file-2-srcpitchtemposhifterjs-new).

Key points:
- Import `{ PitchShifter } from 'soundtouchjs'` — **not** default import
- Use `BUFFER_SIZE = 16384`
- `applySettings()` sets both `shifter.tempo` and `shifter.pitchSemitones`
- `connect()` / `disconnect()` manage GainNode lifecycle
- `seek(ratio)` uses `shifter.percentagePlayed = ratio * 100`

**Verify:** `npm run build` → exit 0

---

## Phase 3: Integrate into useAbcSynth.js

**Path:** `/home/stever/projects/abc2book/src/useAbcSynth.js`

This is the most important phase. Work through each sub-step in order.

### Step 3.1: Add import

At top of file, after existing imports:

```javascript
import PitchTempoShifter from './pitchTempoShifter';
```

### Step 3.2: Add refs (~line 20, after `currentTime` ref)

```javascript
const pitchShifterRef = useRef(null);
const pitchTempoSettingsRef = useRef({ tempo: 1.0, pitch: 0, fineTune: 0 });
```

### Step 3.3: Add pitch/tempo functions (~line 470, before `startPlaying`)

Add these functions:

```javascript
function destroyPitchShifter() {
  if (pitchShifterRef.current) {
    pitchShifterRef.current.destroy();
    pitchShifterRef.current = null;
  }
}

function initPitchShifter(audioContext, audioBuffer) {
  destroyPitchShifter();
  if (!audioBuffer) return;

  pitchShifterRef.current = new PitchTempoShifter(
    audioContext,
    audioBuffer,
    function onTimeUpdate(timePlayed) {
      if (props.mediaController) {
        props.mediaController.onAbcTimeUpdate(timePlayed);
        currentTime.current = timePlayed;
      }
    },
    function onEnded() {
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
  if (pitchShifterRef.current) {
    pitchShifterRef.current.applySettings(factor, pitchTempoSettingsRef.current.pitch, pitchTempoSettingsRef.current.fineTune);
  }
}

function setPitchSemitones(semitones) {
  pitchTempoSettingsRef.current.pitch = semitones;
  if (pitchShifterRef.current) {
    pitchShifterRef.current.applySettings(pitchTempoSettingsRef.current.tempo, semitones, pitchTempoSettingsRef.current.fineTune);
  }
}

function setFineTuneCents(cents) {
  pitchTempoSettingsRef.current.fineTune = cents;
  if (pitchShifterRef.current) {
    pitchShifterRef.current.applySettings(pitchTempoSettingsRef.current.tempo, pitchTempoSettingsRef.current.pitch, cents);
  }
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

### Step 3.4: Modify `assignStateOnCompletion` (~line 526)

Inside the block `if (midiBuffer && midiBuffer.duration > 0)`, after `setMidiBuffer(midiBuffer)`:

```javascript
if (midiBuffer.audioBuffers && midiBuffer.audioBuffers[0]) {
  initPitchShifter(audioContext, midiBuffer.audioBuffers[0]);
}
```

### Step 3.5: Modify `startMidiAndTiming` (~line 570)

Replace the function body:

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

### Step 3.6: Modify `stopPlaying` (~line 514)

Add **before** `gmidiBuffer.current.pause()`:

```javascript
if (pitchShifterRef.current) pitchShifterRef.current.disconnect();
```

### Step 3.7: Modify `seekPlayer` (~line 555)

Inside the try block, after `gmidiBuffer.current.seek(seekTo)`:

```javascript
if (pitchShifterRef.current) pitchShifterRef.current.seek(seekTo);
```

### Step 3.8: Modify `resetAudioState` (~line 544)

Add at start of try block:

```javascript
destroyPitchShifter();
```

### Step 3.9: Fix playbackSpeed handler (~line 167)

**Replace** the block that stops and resets audio on speed change:

```javascript
// OLD (delete):
if (props.mediaController.playbackSpeed !== lastPlaybackSpeed) {
    stopPlaying()
    resetAudioState()
}

// NEW (insert):
if (props.mediaController.playbackSpeed !== lastPlaybackSpeed) {
    setTempoFactor(props.mediaController.playbackSpeed);
}
```

### Step 3.10: Fix metronome tempo (~line 627)

Replace `var warp = props.warp > 0 ? props.warp : 1` usage with:

```javascript
var effectiveTempo = tune.tempo * pitchTempoSettingsRef.current.tempo;
metronome.current = new Metronome(gaudioContext.current, effectiveTempo, o.getBeatsPerMeasure(), metronomeBeats, ...);
```

### Step 3.11: Export new functions

Add to the return object at bottom of file:

```javascript
setTempoFactor, setPitchSemitones, setFineTuneCents, getPitchTempoState, resetPitchTempo,
```

**Verify:** `npm run build` → exit 0

---

## Phase 4: Create UI Components

### Step 4.1: Create `src/components/PitchTempoControls.js`

**Path:** `/home/stever/projects/abc2book/src/components/PitchTempoControls.js`

```javascript
import React, { useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { formatPitchDisplay, formatFineTuneDisplay } from '../pitchTempoUtils';
import './PitchTempoControls.css';

export default function PitchTempoControls(props) {
  const { show, onHide, getState, onTempoChange, onPitchChange, onFineTuneChange, onReset } = props;

  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState('standard');

  const presets = {
    standard: { label: 'Standard', tempo: 1.0, pitch: 0, fineTune: 0 },
    slowPractice: { label: 'Slow Practice (75%)', tempo: 0.75, pitch: 0, fineTune: 0 },
    slowPractice50: { label: 'Slow (50%)', tempo: 0.5, pitch: 0, fineTune: 0 },
    fastReview: { label: 'Fast Review (125%)', tempo: 1.25, pitch: 0, fineTune: 0 },
    capoSimulator: { label: 'Capo +2 Semitones', tempo: 1.0, pitch: 2, fineTune: 0 },
    learnerPack: { label: 'Learner Pack', tempo: 0.75, pitch: -2, fineTune: 0 },
  };

  useEffect(() => {
    if (show && getState) {
      const state = getState();
      setTempo(state.tempo);
      setPitch(state.pitch);
      setFineTune(state.fineTune);
    }
  }, [show, getState]);

  const applyPreset = (key) => {
    const preset = presets[key];
    setSelectedPreset(key);
    setTempo(preset.tempo);
    setPitch(preset.pitch);
    setFineTune(preset.fineTune);
    if (onTempoChange) onTempoChange(preset.tempo);
    if (onPitchChange) onPitchChange(preset.pitch);
    if (onFineTuneChange) onFineTuneChange(preset.fineTune);
  };

  const handleReset = () => {
    applyPreset('standard');
    if (onReset) onReset();
  };

  const tempoPercent = Math.round(tempo * 100);

  return (
    <Modal show={show} onHide={onHide} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>Pitch &amp; Tempo Controls</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="pitch-tempo-controls">
          <p className="pitch-tempo-scope-note">
            Applies to synthesized ABC playback. YouTube and audio links use the separate Playback Speed control in media options.
          </p>

          <div className="control-section">
            <h6>Tempo (Speed)</h6>
            <div className="control-display">
              <span className="display-value">{tempoPercent}%</span>
              <span className="display-unit">Normal speed = 100%</span>
            </div>
            <input type="range" min="0.25" max="2.0" step="0.01" value={tempo}
              onChange={(e) => { const v = parseFloat(e.target.value); setTempo(v); if (onTempoChange) onTempoChange(v); }}
              className="slider tempo-slider" />
            <div className="slider-labels"><span>25%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span></div>
          </div>

          <div className="control-section">
            <h6>Pitch (Semitones)</h6>
            <div className="control-display">
              <span className="display-value">{formatPitchDisplay(pitch)}</span>
              <span className="display-unit">±12 semitones</span>
            </div>
            <input type="range" min="-12" max="12" step="1" value={pitch}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setPitch(v); if (onPitchChange) onPitchChange(v); }}
              className="slider pitch-slider" />
            <div className="slider-labels"><span>-12</span><span>-6</span><span>0</span><span>+6</span><span>+12</span></div>
          </div>

          <div className="control-section">
            <h6>Fine Tuning (Cents)</h6>
            <div className="control-display">
              <span className="display-value">{formatFineTuneDisplay(fineTune)}</span>
              <span className="display-unit">±50 cents</span>
            </div>
            <input type="range" min="-50" max="50" step="1" value={fineTune}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setFineTune(v); if (onFineTuneChange) onFineTuneChange(v); }}
              className="slider fine-tune-slider" />
            <div className="slider-labels"><span>-50¢</span><span>0¢</span><span>+50¢</span></div>
          </div>

          <div className="presets-section">
            <h6>Quick Presets</h6>
            <div className="preset-buttons">
              {Object.entries(presets).map(([key, preset]) => (
                <Button key={key} variant={selectedPreset === key ? 'primary' : 'outline-primary'} size="sm"
                  onClick={() => applyPreset(key)}>{preset.label}</Button>
              ))}
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleReset}>Reset to Standard</Button>
        <Button variant="primary" onClick={onHide}>Done</Button>
      </Modal.Footer>
    </Modal>
  );
}
```

### Step 4.2: Create `src/components/PitchTempoControls.css`

**Path:** `/home/stever/projects/abc2book/src/components/PitchTempoControls.css`

Use the CSS from the original checklist (Step 2.3) plus:

```css
.pitch-tempo-scope-note {
  font-size: 0.875rem;
  color: #6c757d;
  margin-bottom: 1rem;
}
```

**Verify:** `npm run build` → exit 0

---

## Phase 5: Modify Abc.js

**Path:** `/home/stever/projects/abc2book/src/components/Abc.js`

### Step 5.1: Add imports

```javascript
import PitchTempoControls from './PitchTempoControls';
```

### Step 5.2: Destructure pitch/tempo methods from abcSynth (~line 18)

Add to destructuring:

```javascript
setTempoFactor, setPitchSemitones, setFineTuneCents, getPitchTempoState, resetPitchTempo,
```

### Step 5.3: Add modal state

```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false);
```

### Step 5.4: Sync modal from parent prop (for MusicSingle)

```javascript
useEffect(() => {
  if (props.showPitchTempoControls) setShowPitchTempoControls(true);
}, [props.showPitchTempoControls]);

useEffect(() => {
  if (!showPitchTempoControls && props.onPitchTempoControlsHide) {
    props.onPitchTempoControlsHide();
  }
}, [showPitchTempoControls]);
```

### Step 5.5: Sync initial tempo from mediaController

```javascript
useEffect(() => {
  if (props.mediaController && props.mediaController.playbackSpeed) {
    setTempoFactor(props.mediaController.playbackSpeed);
  }
}, [props.mediaController?.playbackSpeed]);
```

### Step 5.6: Remove warp tempo multiplication in `updateOnChange()` (~lines 25–28)

Delete:

```javascript
var useWarp = props.warp >= 0.25 && props.warp <= 2 ? props.warp : 1
tune.tempo = tune.tempo > 0 ? tune.tempo * useWarp : 100 * useWarp
```

Tune renders at its stored base tempo always.

### Step 5.7: Add UI to JSX return (~line 188, inside `<>`)

```javascript
{!props.hidePitchTempoButton && (
  <Button onClick={() => setShowPitchTempoControls(true)} variant="outline-secondary" size="sm"
    title="Pitch & Tempo Controls" style={{ marginLeft: '0.3em' }}>
    Pitch/Tempo
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

**Verify:** `npm run build` → exit 0

---

## Phase 6: Modify MusicSingle.js

**Path:** `/home/stever/projects/abc2book/src/components/MusicSingle.js`

### Step 6.1: Add state (~line 55)

```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false);
```

### Step 6.2: Add button in music-buttons toolbar (~line 371)

Inside the toolbar div, add when in music view:

```javascript
{props.viewMode === 'music' && tune && props.tunebook.hasNotesOrChords(tune) && (
  <Button
    onClick={() => setShowPitchTempoControls(true)}
    variant="outline-secondary"
    size="sm"
    title="Adjust pitch and tempo"
    style={{ float: 'left', marginLeft: '0.3em' }}
  >
    Pitch/Tempo
  </Button>
)}
```

### Step 6.3: Update Abc component props (~lines 518–519)

Add to both `{autoStart && <Abc ...` and `{!autoStart && <Abc ...`:

```javascript
warp={1}
showPitchTempoControls={showPitchTempoControls}
onPitchTempoControlsHide={() => setShowPitchTempoControls(false)}
hidePitchTempoButton={true}
```

Remove or replace `warp={props.mediaController.playbackSpeed}` with `warp={1}`.

**Verify:** `npm run build` → exit 0

---

## Phase 7: Clean Up Warp-Based Tempo

### Step 7.1: MediaPlayerMedia.js (~line 81)

In the tune-change effect, **remove or guard** this block for MIDI playback:

```javascript
// Remove for MIDI — tempo now handled by PitchShifter:
// var useWarp = ...
// tune.tempo = tune.tempo * useWarp
```

Only apply warp multiplication when playing external media, not ABC synth.

### Step 7.2: Optional — clarify PlaybackSpeedSelector

In `src/components/PlaybackSpeedSelector.js`, update label:

```javascript
<Form.Label>Playback Speed (YouTube / audio links)</Form.Label>
```

---

## Phase 8: Build & Manual Testing

### Step 8.1: Build

```bash
cd /home/stever/projects/abc2book
npm run build
echo $?
```

### Step 8.2: Dev server

```bash
npm start
```

Open http://localhost:3000, navigate to a tune with ABC notation.

### Step 8.3: Manual test checklist

**UI**
- [ ] "Pitch/Tempo" button visible in music view toolbar
- [ ] Modal opens with three sliders and six presets
- [ ] Scope note mentions ABC-only behavior

**Tempo**
- [ ] Set tempo to 50%, play — music slows, pitch unchanged
- [ ] Change tempo while playing — no full re-render / loading spinner
- [ ] Compare to old behavior — no "chipmunk" or "bass drop" artifact

**Pitch**
- [ ] Set +3 semitones — pitch rises, speed unchanged
- [ ] Set -5 semitones — pitch lowers, speed unchanged

**Combined**
- [ ] 75% tempo + -2 pitch (Learner Pack preset) — both apply

**Transport**
- [ ] Pause / resume works
- [ ] Seek bar / click-to-seek works
- [ ] Repeat mode restarts correctly

**Edge cases**
- [ ] Switch to different tune — no errors, settings reset or persist as designed
- [ ] Play YouTube link — playback speed selector still works independently

### Step 8.4: Console check

Open DevTools → Console. Confirm no errors during:
- Open modal
- Adjust sliders while playing
- Pause / seek / tune change

---

## Rollback Plan

```bash
cd /home/stever/projects/abc2book

# Remove new files
rm -f src/pitchTempoUtils.js
rm -f src/pitchTempoShifter.js
rm -f src/components/PitchTempoControls.js
rm -f src/components/PitchTempoControls.css

# Restore modified files
git checkout src/useAbcSynth.js
git checkout src/components/Abc.js
git checkout src/components/MusicSingle.js
git checkout src/components/MediaPlayerMedia.js

npm run build
```

To disable WSOLA without full rollback, set in `useAbcSynth.js`:

```javascript
const usePitchShifterRef = useRef(false);
```

This falls back to native CreateSynth playback.

---

## Success Criteria

- [ ] `npm run build` exits 0
- [ ] No console errors during playback
- [ ] 50% tempo preserves pitch (WSOLA quality)
- [ ] Pitch ±12 semitones without speed change
- [ ] Tempo slider does not trigger audio re-render
- [ ] Cursor / seek stay reasonably synced
- [ ] All manual tests in Phase 8.3 pass

---

## File Checklist (copy for PR description)

| File | Status |
|------|--------|
| `src/pitchTempoUtils.js` | CREATE |
| `src/pitchTempoShifter.js` | CREATE |
| `src/useAbcSynth.js` | MODIFY (core) |
| `src/components/PitchTempoControls.js` | CREATE |
| `src/components/PitchTempoControls.css` | CREATE |
| `src/components/Abc.js` | MODIFY |
| `src/components/MusicSingle.js` | MODIFY |
| `src/components/MediaPlayerMedia.js` | MODIFY (optional warp cleanup) |
| `src/components/PlaybackSpeedSelector.js` | MODIFY (optional label) |

**Document Version**: 2.0  
**Last Updated**: 17 June 2026
