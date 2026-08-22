import {
  GLOBAL_TEMPO_PERCENT_MAX,
  GLOBAL_TEMPO_PERCENT_MIN,
  formatGlobalTempoDisplay,
  getGlobalTempoFactor,
  getGlobalTempoLastPercent,
  getGlobalTempoPercent,
  isGlobalTempoOverrideActive,
  normalizeGlobalTempoPercent,
  resolvePlaybackTempo,
  setGlobalTempoPercent,
  subscribeGlobalTempo,
} from './globalTempoSettings'

describe('globalTempoSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('defaults to off', function() {
    expect(getGlobalTempoPercent()).toBe(0)
    expect(isGlobalTempoOverrideActive()).toBe(false)
    expect(getGlobalTempoFactor()).toBe(null)
  })

  test('treats zero as off and ignores per-song tempo only when set', function() {
    expect(resolvePlaybackTempo(0.75)).toBe(0.75)
    setGlobalTempoPercent(80)
    expect(isGlobalTempoOverrideActive()).toBe(true)
    expect(getGlobalTempoFactor()).toBe(0.8)
    expect(resolvePlaybackTempo(0.75)).toBe(0.8)
    setGlobalTempoPercent(0)
    expect(resolvePlaybackTempo(0.75)).toBe(0.75)
  })

  test('clamps active values to the supported percent range', function() {
    expect(normalizeGlobalTempoPercent(10)).toBe(GLOBAL_TEMPO_PERCENT_MIN)
    expect(normalizeGlobalTempoPercent(250)).toBe(GLOBAL_TEMPO_PERCENT_MAX)
    expect(setGlobalTempoPercent(5)).toBe(GLOBAL_TEMPO_PERCENT_MIN)
    expect(getGlobalTempoPercent()).toBe(GLOBAL_TEMPO_PERCENT_MIN)
  })

  test('formats off versus a forced percent', function() {
    expect(formatGlobalTempoDisplay(0)).toBe('Off')
    expect(formatGlobalTempoDisplay(125)).toBe('125%')
  })

  test('notifies subscribers when the override changes', function() {
    const listener = jest.fn()
    const unsubscribe = subscribeGlobalTempo(listener)
    setGlobalTempoPercent(90)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setGlobalTempoPercent(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test('remembers the last active percent when turning off', function() {
    setGlobalTempoPercent(90)
    expect(getGlobalTempoLastPercent()).toBe(90)
    setGlobalTempoPercent(0)
    expect(getGlobalTempoPercent()).toBe(0)
    expect(getGlobalTempoLastPercent()).toBe(90)
  })
})
