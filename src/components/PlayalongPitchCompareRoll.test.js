/**
 * @jest-environment jsdom
 */
import {
  displayMidi,
  paintLiveOverlayFromSnapshot,
  playalongRollHeight,
  tightPitchRangeFromNotes,
} from './PlayalongPitchCompareRoll'

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

  test('displayMidi uses folded pitch when it matches the written note', function() {
    expect(displayMidi({
      sourceMidi: 79,
      rawMidi: 79,
      expectedMidi: 67,
      foldedMidi: 67,
    })).toBe(67)
  })

  test('displayMidi keeps raw pitch when the folded value is still wrong', function() {
    expect(displayMidi({
      sourceMidi: 72.2,
      rawMidi: 72.2,
      expectedMidi: 60,
      foldedMidi: 72.2,
    })).toBeCloseTo(72.2, 5)
  })

  test('paintLiveOverlayFromSnapshot reads the latest ref sample without React state', function() {
    const pointsRef = { current: [{ timeMs: 1000, rawMidi: 60 }] }
    const getLivePitchSnapshot = function() {
      return {
        points: pointsRef.current,
        musicStartOffsetSeconds: 1,
        tempoBpm: 120,
        version: pointsRef.current.length,
      }
    }
    const props = {
      line: {
        startBeat: 0,
        endBeat: 4,
        notes: [{ midi: 60, startBeat: 0, endBeat: 1 }],
      },
      getLivePitchSnapshot: getLivePitchSnapshot,
      playbackSpeed: 1,
      soundingMap: [],
    }
    let traces = paintLiveOverlayFromSnapshot(props)
    expect(traces.length).toBeGreaterThan(0)
    expect(traces[0].live).toBe(true)
    expect(traces[0].points[0].rawMidi).toBe(60)

    pointsRef.current = [
      { timeMs: 1000, rawMidi: 60 },
      { timeMs: 1250, rawMidi: 62 },
    ]
    traces = paintLiveOverlayFromSnapshot(props)
    expect(traces[0].points[traces[0].points.length - 1].rawMidi).toBe(62)
  })
})
