/**
 * @jest-environment node
 */
import {
  abcToContour,
  contourSimilarity,
  extractPitchMidiSequence,
  pitchesToIntervalString,
  pitchesToParsonsCode,
} from './abcContour'

const SAMPLE_A = `X:1
T:Test A
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2A2:|
`

const SAMPLE_B = `X:1
T:Test B close
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2G2:|
`

const SAMPLE_UNRELATED = `X:1
T:Other
M:3/4
L:1/8
K:Am
|:A2c2 e2|a2e2 c2:|
`

describe('abcContour', () => {
  test('extracts pitches', () => {
    const pitches = extractPitchMidiSequence(SAMPLE_A)
    expect(pitches.length).toBeGreaterThanOrEqual(6)
  })

  test('builds interval and parsons strings', () => {
    const pitches = extractPitchMidiSequence(SAMPLE_A)
    const intervals = pitchesToIntervalString(pitches)
    const parsons = pitchesToParsonsCode(pitches)
    expect(intervals).toBeTruthy()
    expect(parsons.startsWith('*')).toBe(true)
    expect(parsons).toContain('U')
  })

  test('scores close tunes highly', () => {
    const a = abcToContour(SAMPLE_A)
    const b = abcToContour(SAMPLE_B)
    expect(contourSimilarity(a, b)).toBeGreaterThanOrEqual(70)
  })

  test('scores unrelated tunes low', () => {
    const a = abcToContour(SAMPLE_A)
    const b = abcToContour(SAMPLE_UNRELATED)
    expect(contourSimilarity(a, b)).toBeLessThan(70)
  })
})
