import {
  expandSequencePreset,
  defaultSequencePresetId,
  SEQUENCE_PRESET_IDS,
  midiToNoteName
} from './audioAnalysisSequences'

describe('audioAnalysisSequences', function() {
  test('midiToNoteName round-trips common notes', function() {
    expect(midiToNoteName(55)).toBe('G3')
    expect(midiToNoteName(69)).toBe('A4')
  })

  test('open strings for violin GDAE', function() {
    const notes = expandSequencePreset(SEQUENCE_PRESET_IDS.open, 'violin', 'gdae')
    expect(notes.map(function(n) { return n.targetNote })).toEqual(['G3', 'D4', 'A4', 'E5'])
    expect(notes[0].stringIndex).toBe(0)
  })

  test('violin uses fiddle cross tunings', function() {
    const notes = expandSequencePreset(SEQUENCE_PRESET_IDS.open, 'violin', 'aeae')
    expect(notes.map(function(n) { return n.targetNote })).toEqual(['A3', 'E4', 'A4', 'E5'])
  })

  test('open + octaves doubles count', function() {
    const notes = expandSequencePreset(SEQUENCE_PRESET_IDS.openOctaves, 'violin', 'gdae')
    expect(notes.length).toBe(8)
    expect(notes[1].targetNote).toBe('G4')
  })

  test('saunders grid is 13 notes per string', function() {
    const notes = expandSequencePreset(SEQUENCE_PRESET_IDS.saunders, 'violin', 'gdae')
    expect(notes.length).toBe(4 * 13)
    expect(notes[0].targetNote).toBe('G3')
    expect(notes[12].targetNote).toBe('G4')
  })

  test('default sequence is saunders for bowed, open otherwise', function() {
    expect(defaultSequencePresetId('violin')).toBe(SEQUENCE_PRESET_IDS.saunders)
    expect(defaultSequencePresetId('guitar')).toBe(SEQUENCE_PRESET_IDS.open)
  })
})
