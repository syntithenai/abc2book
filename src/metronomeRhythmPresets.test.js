import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_SUB,
  METRONOME_TICK,
} from './metronomeTickSounds'
import {
  createRhythm,
  cycleAccentLevel,
  defaultMetronomeRhythm,
  formatRhythmText,
  normalizeAccentPattern,
  normalizeTimeSignatureText,
  parseRhythmText,
  presetIdForRhythm,
  rhythmFromPreset,
  rhythmFromTimeSignature,
  rhythmKey,
  rhythmsEqual,
  slotAccentLevel,
  slotBeatIndex,
  slotPulseIndex,
  slotsForBeatCount,
  slotsPerBar,
} from './metronomeRhythmPresets'

describe('metronomeRhythmPresets', function() {
  test('createRhythm normalizes beats, accents, and per-beat pulses', function() {
    const rhythm = createRhythm(3, [METRONOME_ACCENT, METRONOME_MUTE], 2)
    expect(rhythm.beatsPerBar).toBe(3)
    expect(rhythm.accents).toEqual([METRONOME_ACCENT, METRONOME_MUTE, METRONOME_TICK])
    expect(rhythm.pulsesPerBeat).toEqual([2, 2, 2])
  })

  test('createRhythm accepts a pulses array and pads it', function() {
    const rhythm = createRhythm(4, [METRONOME_ACCENT], [3, 2])
    expect(rhythm.pulsesPerBeat).toEqual([3, 2, 2, 2])
    expect(slotsPerBar(rhythm)).toBe(9)
  })

  test('normalizeAccentPattern pads and clamps invalid values', function() {
    expect(normalizeAccentPattern([METRONOME_ACCENT], 4)).toEqual([
      METRONOME_ACCENT,
      METRONOME_TICK,
      METRONOME_TICK,
      METRONOME_TICK,
    ])
    expect(normalizeAccentPattern(['bogus'], 2)).toEqual([METRONOME_TICK, METRONOME_TICK])
  })

  test('rhythmFromPreset loads 6/8 compound feel', function() {
    const rhythm = rhythmFromPreset('6-8')
    expect(rhythm.beatsPerBar).toBe(2)
    expect(rhythm.pulsesPerBeat).toEqual([3, 3])
    expect(slotsPerBar(rhythm)).toBe(6)
  })

  test('slotAccentLevel distinguishes beat accents and subdivisions', function() {
    const rhythm = createRhythm(2, [METRONOME_ACCENT, METRONOME_TICK], 3)
    expect(slotAccentLevel(rhythm, 0)).toBe(METRONOME_ACCENT)
    expect(slotAccentLevel(rhythm, 1)).toBe(METRONOME_SUB)
    expect(slotAccentLevel(rhythm, 2)).toBe(METRONOME_SUB)
    expect(slotAccentLevel(rhythm, 3)).toBe(METRONOME_TICK)
    expect(slotBeatIndex(rhythm, 4)).toBe(1)
    expect(slotPulseIndex(rhythm, 4)).toBe(1)
  })

  test('slot helpers support uneven pulses per beat', function() {
    const rhythm = createRhythm(2, [METRONOME_ACCENT, METRONOME_TICK], [3, 2])
    expect(slotsPerBar(rhythm)).toBe(5)
    expect(slotBeatIndex(rhythm, 3)).toBe(1)
    expect(slotPulseIndex(rhythm, 3)).toBe(0)
    expect(slotAccentLevel(rhythm, 3)).toBe(METRONOME_TICK)
    expect(slotPulseIndex(rhythm, 4)).toBe(1)
    expect(slotAccentLevel(rhythm, 4)).toBe(METRONOME_SUB)
  })

  test('cycleAccentLevel rotates accent, tick, and mute', function() {
    expect(cycleAccentLevel(METRONOME_ACCENT)).toBe(METRONOME_TICK)
    expect(cycleAccentLevel(METRONOME_TICK)).toBe(METRONOME_MUTE)
    expect(cycleAccentLevel(METRONOME_MUTE)).toBe(METRONOME_ACCENT)
  })

  test('defaultMetronomeRhythm is 4/4 with accent on the first beat', function() {
    const rhythm = defaultMetronomeRhythm()
    expect(rhythm.beatsPerBar).toBe(4)
    expect(rhythm.pulsesPerBeat).toEqual([1, 1, 1, 1])
    expect(rhythm.accents).toEqual([
      METRONOME_ACCENT,
      METRONOME_TICK,
      METRONOME_TICK,
      METRONOME_TICK,
    ])
    expect(presetIdForRhythm(rhythm)).toBe('4-4')
  })

  test('slotsForBeatCount expands beats using pulses per beat', function() {
    const rhythm = createRhythm(3, [METRONOME_ACCENT], 3)
    expect(slotsForBeatCount(rhythm, 3)).toBe(9)
    expect(slotsForBeatCount(rhythm, 1)).toBe(3)
    expect(slotsForBeatCount(rhythm, 4)).toBe(12)
    const mixed = createRhythm(2, [METRONOME_ACCENT], [3, 2])
    expect(slotsForBeatCount(mixed, 2)).toBe(5)
    expect(slotsForBeatCount(mixed, 4)).toBe(10)
  })

  test('rhythmsEqual compares full rhythm patterns', function() {
    const a = createRhythm(3, [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK], 1)
    const b = createRhythm(3, [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK], 1)
    const c = createRhythm(4, [METRONOME_ACCENT], 1)
    expect(rhythmsEqual(a, b)).toBe(true)
    expect(rhythmsEqual(a, c)).toBe(false)
    expect(rhythmKey(a)).toBe(rhythmKey(b))
    expect(rhythmKey(a)).not.toBe(rhythmKey(c))
  })

  test('normalizeTimeSignatureText handles ABC common and cut time', function() {
    expect(normalizeTimeSignatureText('C')).toBe('4/4')
    expect(normalizeTimeSignatureText('c')).toBe('4/4')
    expect(normalizeTimeSignatureText('C|')).toBe('2/2')
  })

  test('rhythmFromTimeSignature uses full preset accents for known meters', function() {
    expect(rhythmFromTimeSignature('6/8')).toEqual(rhythmFromPreset('6-8'))
    expect(rhythmFromTimeSignature('3/4')).toEqual(rhythmFromPreset('3-4'))
    expect(rhythmFromTimeSignature('C')).toEqual(rhythmFromPreset('4-4'))
  })

  test('parseRhythmText converts time signatures with first-beat accent', function() {
    expect(parseRhythmText('4/4')).toEqual(defaultMetronomeRhythm())
    expect(parseRhythmText('3-4')).toEqual(createRhythm(3, [METRONOME_ACCENT], 1))
    expect(parseRhythmText('6/8')).toEqual(createRhythm(2, [METRONOME_ACCENT], 3))
    expect(parseRhythmText('9/8').beatsPerBar).toBe(3)
    expect(parseRhythmText('9/8').pulsesPerBeat).toEqual([3, 3, 3])
    expect(parseRhythmText('7/8')).toEqual(createRhythm(4, [METRONOME_ACCENT], 2))
    expect(parseRhythmText('5/4').accents).toEqual([
      METRONOME_ACCENT,
      METRONOME_TICK,
      METRONOME_TICK,
      METRONOME_TICK,
      METRONOME_TICK,
    ])
    expect(parseRhythmText('5/4').pulsesPerBeat).toEqual([1, 1, 1, 1, 1])
    expect(parseRhythmText('3+2')).toEqual(createRhythm(2, [METRONOME_ACCENT], [3, 2]))
    expect(parseRhythmText('nope')).toBeNull()
  })

  test('formatRhythmText prefers known labels and additive patterns', function() {
    expect(formatRhythmText(defaultMetronomeRhythm())).toBe('4/4')
    expect(formatRhythmText(createRhythm(2, [METRONOME_ACCENT], 3))).toBe('6/8')
    expect(formatRhythmText(createRhythm(5, [METRONOME_ACCENT], 1))).toBe('5/4')
    expect(formatRhythmText(createRhythm(2, [METRONOME_ACCENT], [3, 2]))).toBe('3+2')
  })
})
