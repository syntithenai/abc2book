import {
  SLEEP_TIMER_PRESETS_MINUTES,
  startPlaybackSleepTimer,
  cancelPlaybackSleepTimer,
  getPlaybackSleepTimerState,
  isPlaybackSleepTimerActive,
  getPlaybackSleepTimerRemainingMs,
  subscribePlaybackSleepTimer,
  setPlaybackSleepTimerStopHandler,
  formatSleepTimerCountdown,
  sleepTimerDurationFromParts,
} from './playbackSleepTimer'

describe('playbackSleepTimer', function() {
  beforeEach(function() {
    jest.useFakeTimers()
    cancelPlaybackSleepTimer()
    setPlaybackSleepTimerStopHandler(null)
  })

  afterEach(function() {
    cancelPlaybackSleepTimer()
    setPlaybackSleepTimerStopHandler(null)
    jest.useRealTimers()
  })

  test('formatSleepTimerCountdown uses M:SS and H:MM:SS', function() {
    expect(formatSleepTimerCountdown(0)).toBe('0:00')
    expect(formatSleepTimerCountdown(5000)).toBe('0:05')
    expect(formatSleepTimerCountdown(65 * 1000)).toBe('1:05')
    expect(formatSleepTimerCountdown((3600 + 65) * 1000)).toBe('1:01:05')
  })

  test('sleepTimerDurationFromParts converts hours and minutes', function() {
    expect(sleepTimerDurationFromParts(0, 0)).toBe(null)
    expect(sleepTimerDurationFromParts('', '')).toBe(null)
    expect(sleepTimerDurationFromParts(0, 15)).toBe(15 * 60 * 1000)
    expect(sleepTimerDurationFromParts(1, 30)).toBe(90 * 60 * 1000)
    expect(SLEEP_TIMER_PRESETS_MINUTES).toContain(30)
  })

  test('startPlaybackSleepTimer fires stop handler when duration elapses', function() {
    const stop = jest.fn()
    setPlaybackSleepTimerStopHandler(stop)
    expect(startPlaybackSleepTimer(5000)).toBe(true)
    expect(isPlaybackSleepTimerActive()).toBe(true)
    expect(getPlaybackSleepTimerRemainingMs()).toBe(5000)

    jest.advanceTimersByTime(4999)
    expect(stop).not.toHaveBeenCalled()
    expect(isPlaybackSleepTimerActive()).toBe(true)

    jest.advanceTimersByTime(1)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(isPlaybackSleepTimerActive()).toBe(false)
    expect(getPlaybackSleepTimerState().active).toBe(false)
  })

  test('cancelPlaybackSleepTimer prevents stop handler', function() {
    const stop = jest.fn()
    setPlaybackSleepTimerStopHandler(stop)
    startPlaybackSleepTimer(10000)
    cancelPlaybackSleepTimer()
    jest.advanceTimersByTime(20000)
    expect(stop).not.toHaveBeenCalled()
    expect(isPlaybackSleepTimerActive()).toBe(false)
  })

  test('subscribePlaybackSleepTimer notifies on start, tick, and cancel', function() {
    const listener = jest.fn()
    const unsubscribe = subscribePlaybackSleepTimer(listener)
    startPlaybackSleepTimer(3000)
    expect(listener).toHaveBeenCalled()
    expect(listener.mock.calls[0][0].active).toBe(true)

    listener.mockClear()
    jest.advanceTimersByTime(1000)
    expect(listener).toHaveBeenCalled()
    expect(listener.mock.calls[0][0].remainingMs).toBeLessThanOrEqual(2000)

    listener.mockClear()
    cancelPlaybackSleepTimer()
    expect(listener).toHaveBeenCalled()
    expect(listener.mock.calls[0][0].active).toBe(false)

    unsubscribe()
  })

  test('rejects durations under one second', function() {
    expect(startPlaybackSleepTimer(0)).toBe(false)
    expect(startPlaybackSleepTimer(500)).toBe(false)
    expect(isPlaybackSleepTimerActive()).toBe(false)
  })
})
