import {
  applyRhythmPreset,
  defaultDrumPresetIdForRhythm,
  getCompatibleDrumPresets,
  getDrumPresetsForRhythm,
  getRhythmPresetById,
  getSearchableRhythmPresets,
  presetCompatibleWithRhythm,
  presetMatchesRhythm,
  rhythmSignatureKey,
} from './drumPatternPresets'
import { rhythmFromTimeSignature, slotsPerBar } from './metronomeRhythmPresets'
import { ENGINE_MODE_DRUMS, createRhythmConfig, createEmptyDrumPattern } from './rhythmEngineTypes'
import {
  applyEditorSubdivision,
  EDITOR_SUBDIVISION_HALF_PULSES,
  EDITOR_SUBDIVISION_PULSES,
} from './rhythmGranularity'

describe('drumPatternPresets', function() {
  test('template presets have matching slot counts', function() {
    const templatePresets = [
      'tpl-4-4-backbeat',
      'tpl-6-8-backbeat',
      'tpl-3-4-light',
      'tpl-2-4-light',
      'tpl-12-8-backbeat',
    ]
    templatePresets.forEach(function(presetId) {
      const rhythm = applyRhythmPreset(presetId)
      expect(rhythm.engineMode).toBe(ENGINE_MODE_DRUMS)
      expect(slotsPerBar(rhythm)).toBe(rhythm.drumPattern.resolution)
      rhythm.drumPattern.tracks.forEach(function(track) {
        expect(track.steps.length).toBe(slotsPerBar(rhythm))
      })
    })
  })

  test('defaultDrumPresetIdForRhythm respects time signature', function() {
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('4/4'))).toBe('rock-basic')
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('6/8'))).toBe('tpl-6-8-backbeat')
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('3/4'))).toBe('tpl-3-4-light')
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('2/4'))).toBe('folk-reel')
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('12/8'))).toBe('tpl-12-8-backbeat')
    expect(defaultDrumPresetIdForRhythm(rhythmFromTimeSignature('6/8'))).not.toBe('rock-basic')
  })

  test('presetMatchesRhythm compares beats and pulses', function() {
    const rock = applyRhythmPreset('rock-basic')
    const jig = applyRhythmPreset('tpl-6-8-backbeat')
    expect(presetMatchesRhythm(getRhythmPresetById('rock-basic'), rock)).toBe(true)
    expect(presetMatchesRhythm(getRhythmPresetById('rock-basic'), jig)).toBe(false)
    expect(presetMatchesRhythm(getRhythmPresetById('tpl-6-8-backbeat'), jig)).toBe(true)
  })

  test('rhythmSignatureKey encodes meter grid', function() {
    const rhythm = rhythmFromTimeSignature('6/8')
    expect(rhythmSignatureKey(rhythm)).toBe('2:[3,3]')
  })

  test('getDrumPresetsForRhythm returns only matching meter presets', function() {
    const jigRhythm = rhythmFromTimeSignature('6/8')
    const matches = getDrumPresetsForRhythm(jigRhythm)
    expect(matches.length).toBeGreaterThan(0)
    matches.forEach(function(preset) {
      expect(presetMatchesRhythm(preset, jigRhythm)).toBe(true)
    })
    expect(matches.some(function(preset) { return preset.id === 'rock-basic' })).toBe(false)
    expect(matches.some(function(preset) { return preset.id === 'tpl-6-8-backbeat' })).toBe(true)
  })

  test('presetCompatibleWithRhythm matches coarse quarter grid to 16th presets', function() {
    const coarse = rhythmFromTimeSignature('4/4')
    const rock = getRhythmPresetById('rock-basic')
    expect(presetMatchesRhythm(rock, coarse)).toBe(false)
    expect(presetCompatibleWithRhythm(rock, coarse)).toBe(true)
  })

  test('getCompatibleDrumPresets sorts exact matches first', function() {
    const exact = applyRhythmPreset('rock-basic')
    const compatible = getCompatibleDrumPresets(exact)
    expect(compatible.length).toBeGreaterThan(0)
    expect(presetMatchesRhythm(compatible[0], exact)).toBe(true)
  })

  test('getSearchableRhythmPresets merges user presets', function() {
    const rhythm = rhythmFromTimeSignature('4/4')
    const userPreset = {
      id: 'user-abc',
      label: 'Custom saved groove',
      category: 'My patterns',
      engineMode: ENGINE_MODE_DRUMS,
      beatsPerBar: 4,
      accents: rhythm.accents,
      pulsesPerBeat: [4, 4, 4, 4],
      swing: 0,
      drumPattern: applyRhythmPreset('rock-basic').drumPattern,
    }
    const compatible = getCompatibleDrumPresets(rhythm, { userPresets: [userPreset] })
    expect(compatible.some(function(p) { return p.id === 'user-abc' })).toBe(true)
    const results = getSearchableRhythmPresets(rhythm, {
      engineMode: ENGINE_MODE_DRUMS,
      userPresets: [userPreset],
      query: 'custom saved',
    })
    expect(results.some(function(p) { return p.id === 'user-abc' })).toBe(true)
  })

  test('applyEditorSubdivision remaps drum pattern slots', function() {
    const coarse = createRhythmConfig(4, undefined, [1, 1, 1, 1], {
      engineMode: ENGINE_MODE_DRUMS,
      drumPattern: createEmptyDrumPattern(4),
    })
    const finer = applyEditorSubdivision(
      coarse,
      EDITOR_SUBDIVISION_HALF_PULSES,
      EDITOR_SUBDIVISION_PULSES
    )
    expect(slotsPerBar(finer)).toBe(8)
    expect(finer.drumPattern.resolution).toBe(8)
    expect(finer.presetId).toBe('')
  })
})
