import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_SUB,
  METRONOME_TICK,
} from './metronomeTickSounds'
import {
  createRhythm,
  cycleAccentLevel,
  normalizeAccentPattern,
  rhythmFromPreset,
  slotAccentLevel,
  slotBeatIndex,
  slotPulseIndex,
  slotsPerBar,
} from './metronomeRhythmPresets'

describe('metronomeRhythmPresets', function() {
  test('createRhythm normalizes beats and accents', function() {
    const rhythm = createRhythm(3, [METRONOME_ACCENT, METRONOME_MUTE], 2)
    expect(rhythm.beatsPerBar).toBe(3)
    expect(rhythm.accents).toEqual([METRONOME_ACCENT, METRONOME_MUTE, METRONOME_TICK])
    expect(rhythm.pulsesPerBeat).toBe(2)
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
    expect(rhythm.pulsesPerBeat).toBe(3)
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

  test('cycleAccentLevel rotates accent, tick, and mute', function() {
    expect(cycleAccentLevel(METRONOME_ACCENT)).toBe(METRONOME_TICK)
    expect(cycleAccentLevel(METRONOME_TICK)).toBe(METRONOME_MUTE)
    expect(cycleAccentLevel(METRONOME_MUTE)).toBe(METRONOME_ACCENT)
  })
})
