import {
  averageTapPeaks,
  labelLikelyModes,
  tapPeakShifts,
  concatFloat32Chunks,
  mergeStereoFrameChunks
} from './audioAnalysisTapCapture'

describe('audioAnalysisTapCapture', function() {
  test('averageTapPeaks clusters nearby peaks', function() {
    const notes = [
      { features: { peaks: [{ hz: 280, db: -20 }, { hz: 450, db: -25 }] } },
      { features: { peaks: [{ hz: 285, db: -18 }, { hz: 455, db: -24 }] } },
      { features: { peaks: [{ hz: 282, db: -19 }, { hz: 448, db: -26 }] } }
    ]
    const avg = averageTapPeaks(notes, 15)
    expect(avg.length).toBe(2)
    expect(avg[0].hz).toBeGreaterThan(275)
    expect(avg[0].hz).toBeLessThan(290)
  })

  test('averageTapPeaks reads featuresR when requested', function() {
    const notes = [
      {
        features: { peaks: [{ hz: 100, db: -30 }] },
        featuresR: { peaks: [{ hz: 290, db: -20 }, { hz: 440, db: -22 }] }
      },
      {
        features: { peaks: [{ hz: 105, db: -31 }] },
        featuresR: { peaks: [{ hz: 295, db: -18 }, { hz: 445, db: -21 }] }
      },
      {
        features: { peaks: [{ hz: 102, db: -29 }] },
        featuresR: { peaks: [{ hz: 292, db: -19 }, { hz: 442, db: -23 }] }
      }
    ]
    const avgL = averageTapPeaks(notes, 15)
    const avgR = averageTapPeaks(notes, 15, 'featuresR')
    expect(avgL.length).toBe(1)
    expect(avgL[0].hz).toBeGreaterThan(95)
    expect(avgL[0].hz).toBeLessThan(110)
    expect(avgR.length).toBe(2)
    expect(avgR[0].hz).toBeGreaterThan(285)
    expect(avgR[0].hz).toBeLessThan(300)
  })

  test('labelLikelyModes and tapPeakShifts', function() {
    const a = labelLikelyModes([{ hz: 290, db: -20 }, { hz: 440, db: -22 }])
    expect(a[0].label).toBe('A0?')
    expect(a[1].label).toBe('B1−?')
    const b = labelLikelyModes([{ hz: 300, db: -20 }, { hz: 450, db: -22 }])
    const shifts = tapPeakShifts(a, b)
    expect(shifts.length).toBe(2)
    expect(shifts[0].deltaHz).toBeCloseTo(10, 0)
  })

  test('concatFloat32Chunks and mergeStereoFrameChunks', function() {
    const a = new Float32Array([1, 2])
    const b = new Float32Array([3])
    const concat = concatFloat32Chunks([a, b])
    expect(Array.from(concat)).toEqual([1, 2, 3])

    const leftChunks = [new Float32Array([0.1, 0.2]), new Float32Array([0.3])]
    const rightChunks = [new Float32Array([0.4, 0.5]), new Float32Array([0.6, 0.7])]
    const merged = mergeStereoFrameChunks(leftChunks, rightChunks)
    expect(merged.left.length).toBe(3)
    expect(merged.right.length).toBe(3)
    expect(merged.left[2]).toBeCloseTo(0.3)
    expect(merged.right[2]).toBeCloseTo(0.6)
  })
})
