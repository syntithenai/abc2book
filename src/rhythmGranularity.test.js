import { applyRhythmPreset } from './drumPatternPresets'
import { rhythmFromTimeSignature, slotsPerBar } from './metronomeRhythmPresets'
import {
  ENGINE_MODE_DRUMS,
  createRhythmConfig,
  createEmptyDrumPattern,
  setDrumStep,
} from './rhythmEngineTypes'
import {
  EDITOR_SUBDIVISION_BEATS,
  EDITOR_SUBDIVISION_PULSES,
  EDITOR_SUBDIVISION_HALF_PULSES,
  applyEditorSubdivision,
  beatGroupIsOn,
  beatsMatchPulsesView,
  getEditorSlotCount,
  getEditorSubdivisionOptions,
  setDrumBeatSteps,
  slotRangeForBeat,
} from './rhythmGranularity'

describe('rhythmGranularity', function() {
  test('getEditorSubdivisionOptions always includes beats, pulses, and half pulses', function() {
    const rhythm = rhythmFromTimeSignature('4/4')
    const options = getEditorSubdivisionOptions(rhythm)
    expect(options.some(function(o) { return o.id === EDITOR_SUBDIVISION_BEATS })).toBe(true)
    expect(options.some(function(o) { return o.id === EDITOR_SUBDIVISION_PULSES })).toBe(true)
    expect(options.some(function(o) { return o.id === EDITOR_SUBDIVISION_HALF_PULSES })).toBe(true)
    expect(options).toHaveLength(3)
  })

  test('getEditorSubdivisionOptions includes beats when pulses differ from beats', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const options = getEditorSubdivisionOptions(rhythm)
    expect(beatsMatchPulsesView(rhythm)).toBe(false)
    expect(options.some(function(o) { return o.id === EDITOR_SUBDIVISION_BEATS })).toBe(true)
  })

  test('getEditorSlotCount returns beat groups in beats mode', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    expect(getEditorSlotCount(rhythm, EDITOR_SUBDIVISION_BEATS)).toBe(4)
    expect(getEditorSlotCount(rhythm, EDITOR_SUBDIVISION_PULSES)).toBe(16)
  })

  test('applyEditorSubdivision doubles pulses for half pulses', function() {
    const rhythm = createRhythmConfig(4, undefined, [2, 2, 2, 2], {
      engineMode: ENGINE_MODE_DRUMS,
      drumPattern: createEmptyDrumPattern(8),
    })
    const finer = applyEditorSubdivision(
      rhythm,
      EDITOR_SUBDIVISION_HALF_PULSES,
      EDITOR_SUBDIVISION_PULSES
    )
    expect(finer.pulsesPerBeat).toEqual([4, 4, 4, 4])
    expect(slotsPerBar(finer)).toBe(16)
    expect(finer.presetId).toBe('')
  })

  test('applyEditorSubdivision halves pulses when leaving half pulses', function() {
    const rhythm = createRhythmConfig(4, undefined, [4, 4, 4, 4], {
      engineMode: ENGINE_MODE_DRUMS,
      drumPattern: createEmptyDrumPattern(16),
    })
    const coarser = applyEditorSubdivision(
      rhythm,
      EDITOR_SUBDIVISION_PULSES,
      EDITOR_SUBDIVISION_HALF_PULSES
    )
    expect(coarser.pulsesPerBeat).toEqual([2, 2, 2, 2])
    expect(slotsPerBar(coarser)).toBe(8)
  })

  test('setDrumBeatSteps toggles all pulse slots in a beat', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    let pattern = rhythm.drumPattern
    pattern = setDrumStep(pattern, 'kick', 0, 1)
    pattern = setDrumBeatSteps(pattern, 'snare', 1, rhythm, true)
    const snare = pattern.tracks.find(function(t) { return t.id === 'snare' })
    const range = slotRangeForBeat(rhythm, 1)
    for (let i = 0; i < range.count; i++) {
      expect(snare.steps[range.start + i]).toBe(1)
    }
    expect(beatGroupIsOn(snare, rhythm, 1)).toBe(true)
  })
})
