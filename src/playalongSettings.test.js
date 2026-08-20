import {
  DEFAULT_PLAYALONG_SETTINGS,
  PLAYALONG_SETTINGS_STORAGE_KEY,
  clampCutoffPercent,
  clampPlayalongRepeats,
  cutoffPercentToHoldRms,
  cutoffPercentToRmsFloor,
  loadPlayalongSettings,
  normalizePlayalongInstrument,
  normalizePlayalongSettings,
  playalongInstrumentHzRange,
  playalongTrackingCacheKey,
  playalongTrackingOptions,
  savePlayalongSettings,
} from './playalongSettings'
import { PRACTICE_REFERENCE_GAIN_MAX } from './practiceSessionSettings'

describe('playalongSettings', function() {
  beforeEach(function() {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  test('clamps cutoff percent to 0–100', function() {
    expect(clampCutoffPercent(-10)).toBe(0)
    expect(clampCutoffPercent(150)).toBe(100)
    expect(clampCutoffPercent('nope')).toBe(DEFAULT_PLAYALONG_SETTINGS.cutoffPercent)
    expect(clampCutoffPercent(50)).toBe(50)
  })

  test('maps cutoff percent to RMS floors', function() {
    expect(cutoffPercentToRmsFloor(0)).toBeCloseTo(0.00004, 6)
    expect(cutoffPercentToRmsFloor(50)).toBeCloseTo(0.0055, 5)
    expect(cutoffPercentToRmsFloor(100)).toBeCloseTo(0.028, 5)
    expect(cutoffPercentToHoldRms(0)).toBeCloseTo(0.000034, 6)
    expect(cutoffPercentToHoldRms(50)).toBeCloseTo(0.0033, 5)
  })

  test('normalizes unknown instruments to whistle', function() {
    expect(normalizePlayalongInstrument('whistle')).toBe('whistle')
    expect(normalizePlayalongInstrument('cello')).toBe('cello')
    expect(normalizePlayalongInstrument('kazoo')).toBe('whistle')
  })

  test('whistle Hz range keeps high Ds above the old 1200 Hz cap', function() {
    const whistle = playalongInstrumentHzRange('whistle')
    expect(whistle.minHz).toBeGreaterThan(240)
    expect(whistle.minHz).toBeLessThan(300)
    expect(whistle.maxHz).toBeGreaterThan(1200)
    expect(whistle.highestMidi).toBe(95)
  })

  test('high D whistle / recorder range sits above low D whistle', function() {
    const low = playalongInstrumentHzRange('whistle')
    const high = playalongInstrumentHzRange('whistle-high-d')
    expect(normalizePlayalongInstrument('whistle-high-d')).toBe('whistle-high-d')
    expect(high.lowestMidi).toBe(74)
    expect(high.highestMidi).toBe(98)
    expect(high.minHz).toBeGreaterThan(low.minHz)
    expect(high.maxHz).toBeGreaterThan(low.maxHz)
  })

  test('cello range sits below whistle', function() {
    const cello = playalongInstrumentHzRange('cello')
    const whistle = playalongInstrumentHzRange('whistle')
    expect(cello.minHz).toBeLessThan(whistle.minHz)
    expect(cello.maxHz).toBeLessThan(whistle.maxHz)
  })

  test('tracking options combine cutoff and instrument', function() {
    const tracking = playalongTrackingOptions({
      cutoffPercent: 100,
      instrumentId: 'whistle',
      playbackGain: 0.12,
    })
    expect(tracking.rmsFloor).toBeCloseTo(0.028, 5)
    expect(tracking.holdRms).toBeCloseTo(0.0168, 5)
    expect(tracking.maxHz).toBeGreaterThan(1200)
    expect(tracking.minMidi).toBe(60)
    expect(tracking.maxMidi).toBe(97)
  })

  test('clamps playback gain to the practice quiet-reference max', function() {
    const next = normalizePlayalongSettings({
      cutoffPercent: 50,
      playbackGain: 1,
      instrumentId: 'flute',
    })
    expect(next.playbackGain).toBe(PRACTICE_REFERENCE_GAIN_MAX)
    expect(next.instrumentId).toBe('flute')
  })

  test('clamps repeats to 1–10 with default 3', function() {
    expect(clampPlayalongRepeats(0)).toBe(1)
    expect(clampPlayalongRepeats(3)).toBe(3)
    expect(clampPlayalongRepeats(10)).toBe(10)
    expect(clampPlayalongRepeats(99)).toBe(10)
    expect(DEFAULT_PLAYALONG_SETTINGS.repeats).toBe(3)
  })

  test('tracking cache key changes when cutoff changes', function() {
    const low = playalongTrackingCacheKey({ cutoffPercent: 20, instrumentId: 'whistle', playbackGain: 0.12, repeats: 3 })
    const high = playalongTrackingCacheKey({ cutoffPercent: 80, instrumentId: 'whistle', playbackGain: 0.12, repeats: 3 })
    expect(low).not.toBe(high)
  })

  test('persists settings in localStorage', function() {
    const saved = savePlayalongSettings({
      cutoffPercent: 80,
      playbackGain: 0.2,
      instrumentId: 'violin',
    })
    expect(saved.cutoffPercent).toBe(80)
    expect(JSON.parse(localStorage.getItem(PLAYALONG_SETTINGS_STORAGE_KEY)).instrumentId).toBe('violin')
    expect(loadPlayalongSettings()).toEqual(saved)
  })
})
