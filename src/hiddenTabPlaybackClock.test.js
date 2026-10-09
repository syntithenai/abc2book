import { createHiddenTabPlaybackClock } from './hiddenTabPlaybackClock'

function makeDoc(hidden) {
  const listeners = {}
  return {
    hidden: hidden,
    addEventListener: function(name, fn) { listeners[name] = fn },
    removeEventListener: function(name) { delete listeners[name] },
    setHidden: function(next) {
      this.hidden = next
      if (listeners.visibilitychange) listeners.visibilitychange()
    },
    hasListener: function() { return !!listeners.visibilitychange },
  }
}

describe('hiddenTabPlaybackClock', function() {
  beforeEach(function() { jest.useFakeTimers() })
  afterEach(function() { jest.useRealTimers() })

  test('does nothing while the tab is visible', function() {
    const doc = makeDoc(false)
    const onNearEnd = jest.fn()
    const clock = createHiddenTabPlaybackClock({
      document: doc,
      isActive: function() { return true },
      getDurationSec: function() { return 10 },
      getPositionSec: function() { return 10 },
      onNearEnd: onNearEnd,
    })
    jest.advanceTimersByTime(2000)
    expect(onNearEnd).not.toHaveBeenCalled()
    expect(clock.isRunning()).toBe(false)
    clock.dispose()
  })

  test('fires once when the buffer plays out while hidden', function() {
    const doc = makeDoc(false)
    let pos = 8
    const onNearEnd = jest.fn()
    const clock = createHiddenTabPlaybackClock({
      document: doc,
      isActive: function() { return true },
      getDurationSec: function() { return 10 },
      getPositionSec: function() { return pos },
      onNearEnd: onNearEnd,
    })
    doc.setHidden(true)
    expect(clock.isRunning()).toBe(true)
    jest.advanceTimersByTime(500)
    expect(onNearEnd).not.toHaveBeenCalled()
    pos = 10
    jest.advanceTimersByTime(300)
    expect(onNearEnd).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(2000)
    expect(onNearEnd).toHaveBeenCalledTimes(1)
    clock.dispose()
  })

  test('re-arms after a repeat restarts from the beginning', function() {
    const doc = makeDoc(true)
    let pos = 10
    const onNearEnd = jest.fn()
    const clock = createHiddenTabPlaybackClock({
      document: doc,
      isActive: function() { return true },
      getDurationSec: function() { return 10 },
      getPositionSec: function() { return pos },
      onNearEnd: onNearEnd,
    })
    expect(onNearEnd).toHaveBeenCalledTimes(1)
    pos = 0.5
    jest.advanceTimersByTime(300)
    pos = 10
    jest.advanceTimersByTime(300)
    expect(onNearEnd).toHaveBeenCalledTimes(2)
    clock.dispose()
  })

  test('ignores inactive playback and stops when visible again', function() {
    const doc = makeDoc(true)
    let active = false
    const onNearEnd = jest.fn()
    const clock = createHiddenTabPlaybackClock({
      document: doc,
      isActive: function() { return active },
      getDurationSec: function() { return 10 },
      getPositionSec: function() { return 10 },
      onNearEnd: onNearEnd,
    })
    jest.advanceTimersByTime(1000)
    expect(onNearEnd).not.toHaveBeenCalled()
    doc.setHidden(false)
    expect(clock.isRunning()).toBe(false)
    active = true
    jest.advanceTimersByTime(1000)
    expect(onNearEnd).not.toHaveBeenCalled()
    clock.dispose()
    expect(doc.hasListener()).toBe(false)
  })

  test('one-shot timer lands on the end between polls', function() {
    const doc = makeDoc(true)
    const start = Date.now()
    const onNearEnd = jest.fn()
    const clock = createHiddenTabPlaybackClock({
      document: doc,
      intervalMs: 60000,
      isActive: function() { return true },
      getDurationSec: function() { return 10 },
      getPositionSec: function() { return 9 + (Date.now() - start) / 1000 },
      getRate: function() { return 1 },
      onNearEnd: onNearEnd,
    })
    jest.advanceTimersByTime(1100)
    expect(onNearEnd).toHaveBeenCalledTimes(1)
    clock.dispose()
  })
})
