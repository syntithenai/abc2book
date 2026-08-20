/**
 * @jest-environment jsdom
 */
import { playalongRollHeight, tightPitchRangeFromNotes } from './PlayalongPitchCompareRoll'

describe('PlayalongPitchCompareRoll', function() {
  test('tightPitchRangeFromNotes pads only around the notes on that line', function() {
    const range = tightPitchRangeFromNotes([
      { midi: 67 },
      { midi: 69 },
      { midi: 71 },
    ])
    expect(range.min).toBeGreaterThan(66)
    expect(range.min).toBeLessThan(67)
    expect(range.max).toBeGreaterThan(71)
    expect(range.max).toBeLessThan(72)
  })

  test('playalongRollHeight follows the line pitch span instead of a fixed canvas', function() {
    const clustered = playalongRollHeight([{ midi: 60 }, { midi: 62 }])
    const wide = playalongRollHeight([{ midi: 60 }, { midi: 72 }])
    expect(clustered).toBeLessThan(60)
    expect(wide).toBeGreaterThan(clustered)
    expect(wide).toBeGreaterThan(clustered * 1.8)
  })
})
