import {
  createRhythmConfig,
  normalizeRhythmConfig,
  toggleDrumStep,
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

  test('normalizeRhythmConfig preserves backward compatible click rhythm', function() {
    const legacy = { beatsPerBar: 4, accents: ['accent', 'tick', 'tick', 'tick'], pulsesPerBeat: [1, 1, 1, 1] }
    const normalized = normalizeRhythmConfig(legacy)
    expect(normalized.engineMode).toBe(ENGINE_MODE_CLICK)
    expect(normalized.beatsPerBar).toBe(4)
  })

  test('rhythmsEqual distinguishes drum patterns', function() {
    const a = applyRhythmPreset('rock-basic')
    const b = applyRhythmPreset('funk-16ths')
    expect(rhythmsEqual(a, b)).toBe(false)
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
