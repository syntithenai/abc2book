import {
  createRhythmConfig,
  normalizeRhythmConfig,
  toggleDrumStep,
  setDrumStep,
  clearDrumTrack,
  fillDrumTrack,
  shiftDrumPattern,
  invertDrumTrack,
  cycleDrumStepSample,
  setDrumStepVelocity,
  applyAccentTemplate,
  copyDrumTrack,
  getDrumStepSample,
  getDrumStepVelocity,
  HAT_OPEN,
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
  rhythmsEqual,
} from './rhythmEngineTypes'
import { slotsPerBar } from './metronomeRhythmPresets'
import {
  applyRhythmPreset,
  getRhythmPresetById,
  ALL_RHYTHM_PRESETS,
  presetIdForRhythmConfig,
} from './drumPatternPresets'
import { normalizePlaybackMetronomeRhythm } from './playbackMetronomeSettings'
import {
  createDrumPatternUndoStack,
  pushDrumPatternState,
  undoDrumPattern,
  canUndoDrumPattern,
} from './drumPatternUndo'
import { quantizeHitTimeToSlot, createRecordingSession } from './drumPatternRecorder'
import { buildDrumGuideConfig } from './practiceTrackDrumGuide'

describe('rhythmEngineTypes', function() {
  test('defaults to click mode', function() {
    const rhythm = createRhythmConfig(4)
    expect(rhythm.engineMode).toBe(ENGINE_MODE_CLICK)
    expect(rhythm.drumPattern).toBeNull()
  })

  test('drum preset produces aligned step count', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    expect(rhythm.engineMode).toBe(ENGINE_MODE_DRUMS)
    expect(rhythm.drumPattern.resolution).toBe(slotsPerBar(rhythm))
    expect(rhythm.drumPattern.tracks[0].steps.length).toBe(16)
  })

  test('toggleDrumStep flips a cell', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const pattern = rhythm.drumPattern
    const wasOn = pattern.tracks[0].steps[0]
    const next = toggleDrumStep(pattern, 'kick', 0)
    expect(next.tracks[0].steps[0]).toBe(wasOn ? 0 : 1)
  })

  test('clearDrumTrack clears one row', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const next = clearDrumTrack(rhythm.drumPattern, 'kick')
    expect(next.tracks.find(function(t) { return t.id === 'kick' }).steps.every(function(s) { return s === 0 })).toBe(true)
  })

  test('fillDrumTrack fills every nth step', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const cleared = clearDrumTrack(rhythm.drumPattern, 'hat')
    const filled = fillDrumTrack(cleared, 'hat', 2)
    const hat = filled.tracks.find(function(t) { return t.id === 'hat' })
    expect(hat.steps[0]).toBe(1)
    expect(hat.steps[1]).toBe(0)
    expect(hat.steps[2]).toBe(1)
  })

  test('shiftDrumPattern rotates steps', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const kick = rhythm.drumPattern.tracks.find(function(t) { return t.id === 'kick' })
    const original = kick.steps.slice()
    const shifted = shiftDrumPattern(rhythm.drumPattern, 1)
    const nextKick = shifted.tracks.find(function(t) { return t.id === 'kick' })
    expect(nextKick.steps[1]).toBe(original[0])
  })

  test('invertDrumTrack toggles all steps', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const inverted = invertDrumTrack(rhythm.drumPattern, 'kick')
    const kick = inverted.tracks.find(function(t) { return t.id === 'kick' })
    expect(kick.steps[0]).toBe(0)
  })

  test('cycleDrumStepSample cycles hat open/closed', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    let pattern = setDrumStep(rhythm.drumPattern, 'hat', 0, false)
    pattern = cycleDrumStepSample(pattern, 'hat', 0)
    let hat = pattern.tracks.find(function(t) { return t.id === 'hat' })
    expect(hat.steps[0]).toBe(1)
    expect(getDrumStepSample(hat, 0)).toBe('hat-closed')
    pattern = cycleDrumStepSample(pattern, 'hat', 0)
    hat = pattern.tracks.find(function(t) { return t.id === 'hat' })
    expect(getDrumStepSample(hat, 0)).toBe(HAT_OPEN)
    pattern = cycleDrumStepSample(pattern, 'hat', 0)
    hat = pattern.tracks.find(function(t) { return t.id === 'hat' })
    expect(hat.steps[0]).toBe(0)
  })

  test('setDrumStepVelocity stores per-step velocity', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const next = setDrumStepVelocity(rhythm.drumPattern, 'snare', 4, 0.5)
    const snare = next.tracks.find(function(t) { return t.id === 'snare' })
    expect(getDrumStepVelocity(snare, 4)).toBeCloseTo(0.5)
  })

  test('applyAccentTemplate adjusts velocities', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const next = applyAccentTemplate(rhythm.drumPattern)
    const snare = next.tracks.find(function(t) { return t.id === 'snare' })
    expect(getDrumStepVelocity(snare, 4)).toBe(1)
  })

  test('copyDrumTrack duplicates row', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const next = copyDrumTrack(rhythm.drumPattern, 'kick', 'tom')
    const kick = next.tracks.find(function(t) { return t.id === 'kick' })
    const tom = next.tracks.find(function(t) { return t.id === 'tom' })
    expect(tom.steps).toEqual(kick.steps)
  })

  test('normalizeRhythmConfig preserves backward compatible click rhythm', function() {
    const legacy = { beatsPerBar: 4, accents: ['accent', 'tick', 'tick', 'tick'], pulsesPerBeat: [1, 1, 1, 1] }
    const normalized = normalizeRhythmConfig(legacy)
    expect(normalized.engineMode).toBe(ENGINE_MODE_CLICK)
    expect(normalized.beatsPerBar).toBe(4)
  })

  test('legacy drum pattern without stepSamples loads', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const legacy = {
      resolution: rhythm.drumPattern.resolution,
      swing: 0,
      tracks: rhythm.drumPattern.tracks.map(function(track) {
        return {
          id: track.id,
          label: track.label,
          sample: track.sample,
          velocity: track.velocity,
          steps: track.steps.slice(),
        }
      }),
    }
    const normalized = normalizeRhythmConfig(Object.assign({}, rhythm, { drumPattern: legacy }))
    expect(normalized.drumPattern.tracks[0].stepSamples).toBeDefined()
    expect(normalized.drumPattern.tracks[0].velocities).toBeDefined()
  })

  test('rhythmsEqual distinguishes drum patterns', function() {
    const a = applyRhythmPreset('rock-basic')
    const b = applyRhythmPreset('funk-16ths')
    expect(rhythmsEqual(a, b)).toBe(false)
  })
})

describe('drumPatternUndo', function() {
  test('push and undo pattern state', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    let stack = createDrumPatternUndoStack(rhythm.drumPattern)
    const modified = toggleDrumStep(rhythm.drumPattern, 'kick', 0)
    stack = pushDrumPatternState(stack, modified)
    expect(canUndoDrumPattern(stack)).toBe(true)
    stack = undoDrumPattern(stack)
    expect(stack.present.tracks[0].steps[0]).toBe(rhythm.drumPattern.tracks[0].steps[0])
  })
})

describe('drumPatternRecorder', function() {
  test('quantizeHitTimeToSlot maps near downbeat to slot 0', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const slot = quantizeHitTimeToSlot(0.05, 0, rhythm, 120)
    expect(slot).toBe(0)
  })

  test('quantizeHitTimeToSlot prefers active transport slot', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const slot = quantizeHitTimeToSlot(0.9, 0, rhythm, 120, 4)
    expect(slot).toBe(4)
  })

  test('recording session captures hits', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const session = createRecordingSession({
      rhythm: rhythm,
      tempo: 120,
      initialPattern: rhythm.drumPattern,
    })
    session.arm()
    session.setDownbeatTime(0)
    const result = session.noteHit('kick', 0.05)
    expect(result).toBeTruthy()
    expect(result.trackId).toBe('kick')
    const kick = result.pattern.tracks.find(function(t) { return t.id === 'kick' })
    expect(kick.steps[result.slotIndex]).toBe(1)
  })
})

describe('practiceTrackDrumGuide', function() {
  test('buildDrumGuideConfig accepts custom pattern', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const custom = Object.assign({}, rhythm.drumPattern)
    custom.tracks = custom.tracks.map(function(track) {
      return Object.assign({}, track, { steps: track.steps.slice() })
    })
    custom.tracks[0].steps[0] = 0
    custom.tracks[0].steps[2] = 1
    const config = buildDrumGuideConfig({
      timing: { tempoBpm: 120, barBoundariesSec: [0, 2], totalDurationSec: 2 },
      musical: { meter: '4/4', rhythm: rhythm },
    }, {
      customPattern: custom,
      rhythm: rhythm,
    })
    expect(config.customPattern).toBe(true)
    expect(config.tracks.kick).toContain(2)
    expect(config.trackVelocities.kick).toBeDefined()
  })
})

describe('drumPatternPresets', function() {
  test('has at least 30 presets', function() {
    expect(ALL_RHYTHM_PRESETS.length).toBeGreaterThanOrEqual(30)
  })

  test('every drum preset has valid track steps', function() {
    ALL_RHYTHM_PRESETS.filter(function(p) { return p.engineMode === ENGINE_MODE_DRUMS }).forEach(function(preset) {
      const rhythm = applyRhythmPreset(preset.id)
      const slots = slotsPerBar(rhythm)
      rhythm.drumPattern.tracks.forEach(function(track) {
        expect(track.steps.length).toBe(slots)
      })
    })
  })

  test('presetIdForRhythmConfig round-trips rock-basic', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    expect(presetIdForRhythmConfig(rhythm)).toBe('rock-basic')
  })

  test('getRhythmPresetById returns metronome preset', function() {
    const preset = getRhythmPresetById('4-4')
    expect(preset).toBeTruthy()
    expect(preset.engineMode).toBe(ENGINE_MODE_CLICK)
  })
})

describe('playbackMetronomeSettings drum fields', function() {
  test('normalizePlaybackMetronomeRhythm includes engine mode from JSON', function() {
    const rhythm = normalizePlaybackMetronomeRhythm({
      beatsPerBar: 4,
      accents: ['accent', 'tick', 'tick', 'tick'],
      pulsesPerBeat: [4, 4, 4, 4],
      engineMode: ENGINE_MODE_DRUMS,
      presetId: 'rock-basic',
      drumPattern: applyRhythmPreset('rock-basic').drumPattern,
    })
    expect(rhythm.engineMode).toBe(ENGINE_MODE_DRUMS)
    expect(rhythm.presetId).toBe('rock-basic')
    expect(rhythm.drumPattern).toBeTruthy()
  })
})
