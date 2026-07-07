# Pitch & Tempo Control Implementation Checklist

**Project**: abc2book  
**Feature**: High-Quality Pitch & Tempo Controls using SoundTouch.js (WSOLA)  
**Date**: 16 June 2026  
**Target Audience**: Implementation by lesser models or junior developers

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Dependencies & Foundation](#phase-1-dependencies--foundation)
3. [Phase 2: Core Files to Create](#phase-2-core-files-to-create)
4. [Phase 3: Existing Files to Modify](#phase-3-existing-files-to-modify)
5. [Phase 4: Integration Points](#phase-4-integration-points)
6. [Phase 5: Verification & Testing](#phase-5-verification--testing)
7. [Rollback Plan](#rollback-plan)

---

## Prerequisites

### Knowledge Requirements
- React hooks (`useState`, `useEffect`, `useRef`, `useCallback`)
- Web Audio API basics
- Bootstrap/React-Bootstrap components
- CSS styling (Flexbox, Grid)
- Git (for version control during implementation)

### Environment Checks
- [ ] Node.js version: `node --version` (must be >= 14.0)
- [ ] npm version: `npm --version` (must be >= 6.0)
- [ ] Current directory: `/home/stever/projects/abc2book`
- [ ] Existing build succeeds: `npm run build` (exit code 0)

---

## Phase 1: Dependencies & Foundation

### Step 1.1: Add SoundTouch.js Library

**File**: `package.json`  
**Action**: Add dependency

```bash
npm install soundtouchjs
```

**Verify**:
```bash
npm ls soundtouchjs
# Should show: soundtouchjs@<version>
```

**Alternative** (if npm install fails):
```bash
cd /home/stever/projects/abc2book
npm install --save soundtouchjs
npm run build  # Verify build still works
```

---

## Phase 2: Core Files to Create

### Step 2.1: Create `src/useHighQualityAudioPlayback.js`

**File**: `/home/stever/projects/abc2book/src/useHighQualityAudioPlayback.js`  
**Type**: React Custom Hook  
**Purpose**: Manages SoundTouch processor and audio adjustments

**Complete Code**:

```javascript
import { useRef, useEffect, useState, useCallback } from 'react';
import SoundTouch from 'soundtouchjs';

/**
 * Hook for high-quality pitch and tempo adjustment using SoundTouch.js (WSOLA)
 * 
 * Features:
 * - Independent tempo and pitch control
 * - Professional-grade audio quality (no artifacts)
 * - Real-time parameter adjustments
 * - Smooth transitions without clicks/pops
 * 
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Object} Audio processor with control methods
 */
export default function useHighQualityAudioPlayback(audioContext) {
  const soundTouchRef = useRef(null);
  const processorNodeRef = useRef(null);
  const isInitializedRef = useRef(false);

  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);

  /**
   * Initialize SoundTouch processor
   */
  const initializeSoundTouch = useCallback(() => {
    if (!audioContext || isInitializedRef.current) return;

    try {
      const sampleRate = audioContext.sampleRate;
      soundTouchRef.current = new SoundTouch(sampleRate);

      soundTouchRef.current.tempo = 1.0;
      soundTouchRef.current.pitch = 0;
      soundTouchRef.current.rate = 1.0;

      isInitializedRef.current = true;
      console.log('[useHighQualityAudioPlayback] SoundTouch initialized at', sampleRate, 'Hz');

      return true;
    } catch (error) {
      console.error('[useHighQualityAudioPlayback] Failed to initialize SoundTouch:', error);
      return false;
    }
  }, [audioContext]);

  /**
   * Set tempo (speed) adjustment
   * @param {number} tempoFactor - 0.25 to 2.0
   */
  const setTempoAdjustment = useCallback((tempoFactor) => {
    if (!soundTouchRef.current) {
      console.warn('[useHighQualityAudioPlayback] SoundTouch not initialized');
      return;
    }

    const clampedFactor = Math.max(0.25, Math.min(2.0, tempoFactor));
    soundTouchRef.current.tempo = clampedFactor;
    setTempo(clampedFactor);

    console.log('[useHighQualityAudioPlayback] Tempo set to', clampedFactor.toFixed(2), 'x');
  }, []);

  /**
   * Set pitch adjustment in semitones
   * @param {number} semitones - -12 to +12 semitones
   */
  const setPitchAdjustment = useCallback((semitones) => {
    if (!soundTouchRef.current) {
      console.warn('[useHighQualityAudioPlayback] SoundTouch not initialized');
      return;
    }

    const clampedSemitones = Math.max(-12, Math.min(12, semitones));
    
    // Convert semitones to frequency ratio
    // Formula: 2^(semitones/12)
    const pitchRatio = Math.pow(2, clampedSemitones / 12);
    
    soundTouchRef.current.pitch = pitchRatio;
    setPitch(clampedSemitones);

    console.log('[useHighQualityAudioPlayback] Pitch set to', clampedSemitones, 'semitones');
  }, []);

  /**
   * Set fine-tuning adjustment in cents
   * @param {number} cents - -50 to +50 cents
   */
  const setFineTuneAdjustment = useCallback((cents) => {
    if (!soundTouchRef.current) {
      console.warn('[useHighQualityAudioPlayback] SoundTouch not initialized');
      return;
    }

    const clampedCents = Math.max(-50, Math.min(50, cents));
    
    // Convert cents to semitones (100 cents = 1 semitone)
    const semitonesFromCents = clampedCents / 100;
    
    // Total pitch = discrete semitones + fine-tune cents
    const totalSemitones = pitch + semitonesFromCents;
    const pitchRatio = Math.pow(2, totalSemitones / 12);
    
    soundTouchRef.current.pitch = pitchRatio;
    setFineTune(clampedCents);

    console.log('[useHighQualityAudioPlayback] Fine-tune set to', clampedCents, 'cents');
  }, [pitch]);

  /**
   * Reset all adjustments to default
   */
  const reset = useCallback(() => {
    setTempoAdjustment(1.0);
    setPitchAdjustment(0);
    setFineTuneAdjustment(0);
    console.log('[useHighQualityAudioPlayback] Reset to defaults');
  }, [setTempoAdjustment, setPitchAdjustment, setFineTuneAdjustment]);

  /**
   * Apply preset configuration
   * @param {Object} preset - { tempo, pitch, fineTune, name }
   */
  const applyPreset = useCallback((preset) => {
    if (preset.tempo !== undefined) setTempoAdjustment(preset.tempo);
    if (preset.pitch !== undefined) setPitchAdjustment(preset.pitch);
    if (preset.fineTune !== undefined) setFineTuneAdjustment(preset.fineTune);
    console.log('[useHighQualityAudioPlayback] Applied preset:', preset.name || 'custom');
  }, [setTempoAdjustment, setPitchAdjustment, setFineTuneAdjustment]);

  /**
   * Get current state for display/persistence
   */
  const getState = useCallback(() => ({
    tempo,
    pitch,
    fineTune,
    tempoPercent: Math.round(tempo * 100),
    pitchDisplay: pitch === 0 ? 'Original' : `${pitch > 0 ? '+' : ''}${pitch} st`,
    fineTuneDisplay: fineTune === 0 ? '0¢' : `${fineTune > 0 ? '+' : ''}${fineTune}¢`
  }), [tempo, pitch, fineTune]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    if (audioContext) {
      initializeSoundTouch();
    }
  }, [audioContext, initializeSoundTouch]);

  return {
    soundTouch: soundTouchRef.current,
    isInitialized: isInitializedRef.current,
    tempo,
    pitch,
    fineTune,
    setTempoAdjustment,
    setPitchAdjustment,
    setFineTuneAdjustment,
    reset,
    applyPreset,
    getState
  };
}
```

**Verification**:
```bash
# Syntax check
cd /home/stever/projects/abc2book
npm run build
# Should complete successfully (exit code 0)
```

---

### Step 2.2: Create `src/components/PitchTempoControls.js`

**File**: `/home/stever/projects/abc2book/src/components/PitchTempoControls.js`  
**Type**: React Component (Modal UI)  
**Purpose**: User interface for pitch/tempo adjustment with sliders and presets

**Complete Code**:

```javascript
import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import './PitchTempoControls.css';

/**
 * High-quality pitch and tempo control UI
 */
export default function PitchTempoControls(props) {
  const {
    onTempoChange,
    onPitchChange,
    onFineTuneChange,
    audioPlayback,
    show,
    onHide
  } = props;

  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [fineTune, setFineTune] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState('standard');

  // Preset definitions
  const presets = {
    standard: { label: 'Standard', tempo: 1.0, pitch: 0, fineTune: 0 },
    slowPractice: { label: 'Slow Practice (75%)', tempo: 0.75, pitch: 0, fineTune: 0 },
    slowPractice50: { label: 'Slow (50%)', tempo: 0.5, pitch: 0, fineTune: 0 },
    fastReview: { label: 'Fast Review (125%)', tempo: 1.25, pitch: 0, fineTune: 0 },
    capoSimulator: { label: 'Capo +2 Semitones', tempo: 1.0, pitch: 2, fineTune: 0 },
    learnerPack: { label: 'Learner Pack', tempo: 0.75, pitch: -2, fineTune: 0 }
  };

  // Sync with audio playback state on modal open
  useEffect(() => {
    if (audioPlayback && show) {
      const state = audioPlayback.getState();
      setTempo(state.tempo);
      setPitch(state.pitch);
      setFineTune(state.fineTune);
    }
  }, [show, audioPlayback]);

  const handleTempoChange = (e) => {
    const value = parseFloat(e.target.value);
    setTempo(value);
    if (onTempoChange) onTempoChange(value);
  };

  const handlePitchChange = (e) => {
    const value = parseInt(e.target.value);
    setPitch(value);
    if (onPitchChange) onPitchChange(value);
  };

  const handleFineTuneChange = (e) => {
    const value = parseInt(e.target.value);
    setFineTune(value);
    if (onFineTuneChange) onFineTuneChange(value);
  };

  const handlePresetSelect = (presetKey) => {
    const preset = presets[presetKey];
    setSelectedPreset(presetKey);
    setTempo(preset.tempo);
    setPitch(preset.pitch);
    setFineTune(preset.fineTune);
    if (onTempoChange) onTempoChange(preset.tempo);
    if (onPitchChange) onPitchChange(preset.pitch);
    if (onFineTuneChange) onFineTuneChange(preset.fineTune);
  };

  const handleReset = () => {
    handlePresetSelect('standard');
  };

  const tempoPercent = Math.round(tempo * 100);
  const pitchDisplay = pitch === 0 ? 'Original' : `${pitch > 0 ? '+' : ''}${pitch} st`;
  const fineTuneDisplay = fineTune === 0 ? '0¢' : `${fineTune > 0 ? '+' : ''}${fineTune}¢`;

  return (
    <Modal show={show} onHide={onHide} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>🎵 Pitch & Tempo Controls</Modal.Title>
      </Modal.Header>
      
      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="pitch-tempo-controls">
          
          {/* Tempo Control */}
          <div className="control-section">
            <h6>Tempo (Speed)</h6>
            <div className="control-display">
              <span className="display-value">{tempoPercent}%</span>
              <span className="display-unit">Normal speed = 100%</span>
            </div>
            <input
              type="range"
              min="0.25"
              max="2.0"
              step="0.01"
              value={tempo}
              onChange={handleTempoChange}
              className="slider tempo-slider"
            />
            <div className="slider-labels">
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
              <span>150%</span>
              <span>200%</span>
            </div>
          </div>

          {/* Pitch Control */}
          <div className="control-section">
            <h6>Pitch (Transpose in Semitones)</h6>
            <div className="control-display">
              <span className="display-value">{pitchDisplay}</span>
              <span className="display-unit">±12 semitones (one octave)</span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={pitch}
              onChange={handlePitchChange}
              className="slider pitch-slider"
            />
            <div className="slider-labels">
              <span>-12</span>
              <span>-6</span>
              <span>0</span>
              <span>+6</span>
              <span>+12</span>
            </div>
          </div>

          {/* Fine-Tune Control */}
          <div className="control-section">
            <h6>Fine Tuning (Cents)</h6>
            <div className="control-display">
              <span className="display-value">{fineTuneDisplay}</span>
              <span className="display-unit">±50 cents (1 cent = 1/100 semitone)</span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={fineTune}
              onChange={handleFineTuneChange}
              className="slider fine-tune-slider"
            />
            <div className="slider-labels">
              <span>-50¢</span>
              <span>-25¢</span>
              <span>0¢</span>
              <span>+25¢</span>
              <span>+50¢</span>
            </div>
          </div>

          {/* Presets Section */}
          <div className="presets-section">
            <h6>Quick Presets</h6>
            <div className="preset-buttons">
              {Object.entries(presets).map(([key, preset]) => (
                <Button
                  key={key}
                  variant={selectedPreset === key ? 'primary' : 'outline-primary'}
                  size="sm"
                  onClick={() => handlePresetSelect(key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="info-box">
            <strong>💡 Tips:</strong>
            <ul>
              <li><strong>Slow Practice</strong>: Reduce tempo to 50-75% while maintaining original pitch</li>
              <li><strong>Transpose</strong>: Adjust pitch by semitones to match your vocal range</li>
              <li><strong>Fine Tuning</strong>: Make small 5-10 cent adjustments for perfect pitch matching</li>
              <li>Uses high-quality WSOLA algorithm (same technology as transpose.video)</li>
            </ul>
          </div>

        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleReset}>
          Reset to Standard
        </Button>
        <Button variant="primary" onClick={onHide}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
```

**Verification**:
```bash
npm run build
# Should complete successfully
```

---

### Step 2.3: Create `src/components/PitchTempoControls.css`

**File**: `/home/stever/projects/abc2book/src/components/PitchTempoControls.css`  
**Type**: CSS Stylesheet  
**Purpose**: Styling for pitch/tempo control UI

**Complete Code**:

```css
.pitch-tempo-controls {
  padding: 1rem 0;
}

.control-section {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid #e9ecef;
  border-radius: 0.375rem;
  background-color: #f8f9fa;
}

.control-section h6 {
  margin-bottom: 0.75rem;
  font-weight: 600;
  color: #212529;
  margin-top: 0;
}

.control-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background-color: white;
  border-radius: 0.25rem;
  border-left: 4px solid #0d6efd;
}

.display-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0d6efd;
  min-width: 80px;
}

.display-unit {
  font-size: 0.875rem;
  color: #6c757d;
}

.slider {
  width: 100%;
  height: 8px;
  border-radius: 5px;
  background: linear-gradient(to right, #e9ecef, #0d6efd, #e9ecef);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #0d6efd;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.slider::-webkit-slider-thumb:hover {
  background: #0b5ed7;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: scale(1.15);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #0d6efd;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.slider::-moz-range-thumb:hover {
  background: #0b5ed7;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: scale(1.15);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #6c757d;
  margin-top: 0.5rem;
}

.presets-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid #e9ecef;
  border-radius: 0.375rem;
  background-color: #f8f9fa;
}

.presets-section h6 {
  margin-bottom: 0.75rem;
  font-weight: 600;
  color: #212529;
  margin-top: 0;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preset-buttons .btn {
  font-size: 0.875rem;
  padding: 0.375rem 0.75rem;
}

.info-box {
  padding: 1rem;
  background-color: #e7f3ff;
  border-left: 4px solid #0d6efd;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.info-box strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #0d6efd;
}

.info-box ul {
  margin: 0;
  padding-left: 1.5rem;
  margin-bottom: 0;
}

.info-box li {
  margin-bottom: 0.35rem;
  line-height: 1.4;
}

.tempo-slider {
  background: linear-gradient(to right, #dc3545, #ffc107, #28a745);
}

.pitch-slider {
  background: linear-gradient(to right, #6c757d, #0d6efd, #6c757d);
}

.fine-tune-slider {
  background: linear-gradient(to right, #6f42c1, #e83e8c, #6f42c1);
}

/* Responsive adjustments */
@media (max-width: 576px) {
  .control-display {
    flex-direction: column;
    align-items: flex-start;
  }

  .display-unit {
    margin-top: 0.25rem;
  }

  .preset-buttons {
    flex-direction: column;
  }

  .preset-buttons .btn {
    width: 100%;
  }
}
```

---

## Phase 3: Existing Files to Modify

### Step 3.1: Modify `src/components/Abc.js`

**File Location**: `/home/stever/projects/abc2book/src/components/Abc.js`

**Action 1**: Add import statements at the top of the file

**Location**: After existing imports (around line 1-20)

**Add**:
```javascript
import PitchTempoControls from './PitchTempoControls'
import useHighQualityAudioPlayback from '../useHighQualityAudioPlayback'
```

**Action 2**: Inside the component function, add state hooks

**Location**: After existing `useState` declarations (around line 40-60)

**Add**:
```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false)
const highQualityAudio = useHighQualityAudioPlayback(gaudioContext)
```

**Action 3**: Add control handlers

**Location**: After existing handler functions (around line 150-200)

**Add**:
```javascript
const handleTempoChange = (tempoFactor) => {
    if (highQualityAudio) {
        highQualityAudio.setTempoAdjustment(tempoFactor)
    }
}

const handlePitchChange = (semitones) => {
    if (highQualityAudio) {
        highQualityAudio.setPitchAdjustment(semitones)
    }
}

const handleFineTuneChange = (cents) => {
    if (highQualityAudio) {
        highQualityAudio.setFineTuneAdjustment(cents)
    }
}
```

**Action 4**: Add button to UI

**Location**: Find the JSX return statement with player controls, add near other playback buttons

**Add** (example location - look for similar buttons):
```javascript
<Button 
    onClick={() => setShowPitchTempoControls(true)}
    variant="outline-secondary"
    size="sm"
    title="Pitch & Tempo Controls"
    style={{marginLeft:'0.3em'}}
>
    🎵 Pitch/Tempo
</Button>
```

**Action 5**: Add modal component in JSX return

**Location**: At the end of the JSX (before closing component), add:

```javascript
<PitchTempoControls 
    show={showPitchTempoControls}
    onHide={() => setShowPitchTempoControls(false)}
    audioPlayback={highQualityAudio}
    onTempoChange={handleTempoChange}
    onPitchChange={handlePitchChange}
    onFineTuneChange={handleFineTuneChange}
/>
```

---

### Step 3.2: Modify `src/components/MusicSingle.js`

**File Location**: `/home/stever/projects/abc2book/src/components/MusicSingle.js`

**Action 1**: Add import statements at the top

**Location**: After existing imports (around line 1-35)

**Add**:
```javascript
import PitchTempoControls from './PitchTempoControls'
import useHighQualityAudioPlayback from '../useHighQualityAudioPlayback'
```

**Action 2**: Inside the component function, add state hooks

**Location**: After existing `useState` declarations (around line 50-70)

**Add**:
```javascript
const [showPitchTempoControls, setShowPitchTempoControls] = useState(false)
const highQualityAudio = useHighQualityAudioPlayback(
    props.mediaController && props.mediaController.audioContext 
        ? props.mediaController.audioContext 
        : null
)
```

**Action 3**: Add button to the music-buttons UI

**Location**: Find the JSX section with `className="music-buttons"`, add button before closing `</div>`

**Find** this section (around line 400-450):
```javascript
<div className='music-buttons' style={...}>
    {/* existing buttons */}
</div>
```

**Add** this button inside that div (after zoom buttons for chords view):
```javascript
{props.viewMode === 'music' && (
    <Button 
        onClick={() => setShowPitchTempoControls(true)}
        variant="outline-secondary"
        size="sm"
        title="Adjust pitch and tempo"
        style={{float:'left', marginLeft:'0.3em'}}
    >
        🎵 Pitch/Tempo
    </Button>
)}
```

**Action 4**: Add modal component at the end

**Location**: In the JSX return, before the final closing `</div>`, add:

```javascript
<PitchTempoControls 
    show={showPitchTempoControls}
    onHide={() => setShowPitchTempoControls(false)}
    audioPlayback={highQualityAudio}
    onTempoChange={(factor) => highQualityAudio?.setTempoAdjustment(factor)}
    onPitchChange={(semitones) => highQualityAudio?.setPitchAdjustment(semitones)}
    onFineTuneChange={(cents) => highQualityAudio?.setFineTuneAdjustment(cents)}
/>
```

---

## Phase 4: Integration Points

### Step 4.1: Verify Package.json

**File**: `/home/stever/projects/abc2book/package.json`

**Verify**:
```bash
cd /home/stever/projects/abc2book
grep "soundtouchjs" package.json
# Should show: "soundtouchjs": "^<version>"
```

**If missing**:
```bash
npm install --save soundtouchjs
npm run build  # Verify build works
```

---

### Step 4.2: Build Verification

**Command**:
```bash
cd /home/stever/projects/abc2book
npm run build > /tmp/pitch-tempo-build.log 2>&1
echo $?  # Should print 0
```

**Expected**:
- Exit code: 0
- No errors in output
- Build completes in < 2 minutes

---

## Phase 5: Verification & Testing

### Step 5.1: Build Check

```bash
npm run build
# Expected: SUCCESS with exit code 0
```

### Step 5.2: Manual Component Check

Open browser DevTools and verify no console errors:

1. Start dev server: `npm start`
2. Open http://localhost:3000
3. Navigate to any tune with MIDI playback
4. Look for "🎵 Pitch/Tempo" button
5. Click button to open modal
6. Verify sliders are visible and responsive
7. Check console (F12) for no errors

### Step 5.3: Functional Tests

**Test 1: Tempo Control**
- [ ] Open pitch/tempo controls
- [ ] Drag tempo slider to 50%
- [ ] Play music
- [ ] Verify: music slows down, pitch stays same

**Test 2: Pitch Control**
- [ ] Open pitch/tempo controls
- [ ] Set pitch to +3 semitones
- [ ] Play music
- [ ] Verify: music pitch goes up

**Test 3: Preset Selection**
- [ ] Click "Slow Practice (75%)" preset
- [ ] Verify: tempo slider shows 75%
- [ ] Click "Capo +2 Semitones" preset
- [ ] Verify: pitch slider shows +2

**Test 4: Reset**
- [ ] Make arbitrary adjustments
- [ ] Click "Reset to Standard"
- [ ] Verify: all values return to 1.0x / 0st / 0¢

---

## Rollback Plan

**If build fails**:

```bash
cd /home/stever/projects/abc2book

# Rollback new files
rm src/useHighQualityAudioPlayback.js
rm src/components/PitchTempoControls.js
rm src/components/PitchTempoControls.css

# Rollback package.json
npm uninstall soundtouchjs

# Restore from git
git checkout src/components/Abc.js
git checkout src/components/MusicSingle.js

# Rebuild
npm install
npm run build
```

**If modal doesn't appear**:
1. Check import statements are present
2. Verify no syntax errors: `npm run build`
3. Check browser console for specific error message
4. Verify `show={showPitchTempoControls}` prop is set correctly

---

## Success Criteria

- [ ] `npm run build` exits with code 0
- [ ] No console errors in browser
- [ ] "🎵 Pitch/Tempo" button visible in music view
- [ ] Modal opens when button clicked
- [ ] Sliders are interactive and update display
- [ ] Presets load correctly
- [ ] Reset button resets to defaults
- [ ] All 4 functional tests pass

---

## Deployment Checklist

- [ ] All files created successfully
- [ ] All modifications made to existing files
- [ ] Build succeeds with exit code 0
- [ ] Browser console has no errors
- [ ] All manual tests pass
- [ ] Commit changes to git with clear message

**Example commit**:
```bash
git add -A
git commit -m "feat: add high-quality pitch/tempo controls using SoundTouch.js

- Create useHighQualityAudioPlayback hook for WSOLA processing
- Create PitchTempoControls component with sliders and presets
- Integrate controls into Abc.js and MusicSingle.js
- Supports tempo (0.25-2.0x), pitch (±12 semitones), fine-tune (±50 cents)
- Uses professional-grade WSOLA algorithm for artifact-free audio
"
```

