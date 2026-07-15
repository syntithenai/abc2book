import { pitchRangeFromNotes } from './PracticeWarmupPitchRoll'

describe('PracticeWarmupPitchRoll pitch range', function() {
  it('pads half the note span above and below', function() {
    const range = pitchRangeFromNotes([
      { midi: 48 },
      { midi: 60 },
    ])
    // span 12 → pad 6 → 42..66
    expect(range.min).toBe(42)
    expect(range.max).toBe(66)
  })

  it('ignores live traces when sizing the canvas', function() {
    const range = pitchRangeFromNotes(
      [{ midi: 50 }, { midi: 55 }],
      // second arg used to expand range; must be ignored if passed
      [{ points: [{ midi: 90, cents: 0, expectedMidi: 90 }] }]
    )
    expect(range.min).toBe(50 - 2.5)
    expect(range.max).toBe(55 + 2.5)
  })

  it('uses a minimum span for single-pitch warmups', function() {
    const range = pitchRangeFromNotes([{ midi: 40 }])
    expect(range.max - range.min).toBe(4)
    expect(range.min).toBe(38)
    expect(range.max).toBe(42)
  })
})
