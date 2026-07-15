import {
  pitchClose,
  medianMidiFromSamples,
  summarizeRepPitch,
  summarizeRepTiming,
  aggregateRepSummaries,
  liveIntonationBand,
  liveCentsToExpectedMidi,
  mergeResolverScore,
  SCORING_PITCH_TOLERANCE_SEMITONES,
} from './practiceAccuracyScorer'
import { midiToFrequency } from './tunerTuningUtils'

describe('practiceAccuracyScorer', function() {
  test('pitchClose within tolerance', function() {
    expect(pitchClose(60, 60, SCORING_PITCH_TOLERANCE_SEMITONES)).toBe(true)
    expect(pitchClose(60, 61, 0.55)).toBe(false)
    expect(pitchClose(60, 60.5, 0.55)).toBe(true)
  })

  test('medianMidiFromSamples', function() {
    const midi = medianMidiFromSamples([
      { frequency: midiToFrequency(60) },
      { frequency: midiToFrequency(60) },
      { midi: 61 },
    ])
    expect(midi).toBe(60)
  })

  test('summarizeRepPitch with synthetic samples', function() {
    const windows = [
      { midi: 60, startBeat: 0, startMs: 0, endMs: 500 },
      { midi: 62, startBeat: 1, startMs: 500, endMs: 1000 },
    ]
    const samples = [
      { timeMs: 100, frequency: midiToFrequency(60), gated: true },
      { timeMs: 200, frequency: midiToFrequency(60), gated: true },
      { timeMs: 300, frequency: midiToFrequency(60), gated: true },
      { timeMs: 600, frequency: midiToFrequency(62), gated: true },
      { timeMs: 700, frequency: midiToFrequency(62), gated: true },
      { timeMs: 800, frequency: midiToFrequency(62), gated: true },
    ]
    const summary = summarizeRepPitch(windows, samples)
    expect(summary.pitchPct).toBe(100)
    expect(summary.hits).toBe(2)
  })

  test('summarizeRepPitch marks missed with too few samples', function() {
    const windows = [{ midi: 60, startBeat: 0, startMs: 0, endMs: 500 }]
    const summary = summarizeRepPitch(windows, [{ timeMs: 100, frequency: 440, gated: true }])
    expect(summary.missed).toBe(1)
    expect(summary.pitchPct).toBe(0)
  })

  test('summarizeRepTiming', function() {
    const windows = [{ startBeat: 0, startMs: 1000, endMs: 1500 }]
    const onsets = [{ timeMs: 1020 }]
    const summary = summarizeRepTiming(windows, onsets, { toleranceMs: 80 })
    expect(summary.timingPct).toBe(100)
  })

  test('liveIntonationBand thresholds', function() {
    expect(liveIntonationBand(3)).toBe('green')
    expect(liveIntonationBand(10)).toBe('amber')
    expect(liveIntonationBand(20)).toBe('red')
  })

  test('liveCentsToExpectedMidi folds octaves into ±600', function() {
    const expected = 60
    const octaveBelow = midiToFrequency(48)
    const folded = liveCentsToExpectedMidi(octaveBelow, expected)
    expect(folded).not.toBeNull()
    expect(Math.abs(folded)).toBeLessThan(50)
    const slightlySharp = midiToFrequency(60) * Math.pow(2, 30 / 1200)
    expect(liveCentsToExpectedMidi(slightlySharp, expected)).toBeCloseTo(30, 0)
  })

  test('foldMidiNearExpected maps octave neighbors onto expected', function() {
    const { foldMidiNearExpected } = require('./practiceAccuracyScorer')
    expect(foldMidiNearExpected(48, 60)).toBeCloseTo(60, 5)
    expect(foldMidiNearExpected(72, 60)).toBeCloseTo(60, 5)
    expect(foldMidiNearExpected(62, 60)).toBeCloseTo(62, 5)
  })

  test('aggregateRepSummaries', function() {
    const agg = aggregateRepSummaries([
      { pitchPct: 70, repIndex: 0 },
      { pitchPct: 90, repIndex: 1 },
    ])
    expect(agg.average.pitchPct).toBe(80)
    expect(agg.best.pitchPct).toBe(90)
    expect(agg.last.pitchPct).toBe(90)
  })

  test('mergeResolverScore replaces browser', function() {
    const merged = mergeResolverScore({ pitchPct: 70 }, { pitchPct: 85 })
    expect(merged.pitchPct).toBe(85)
    expect(merged.source).toBe('resolver')
  })
})
