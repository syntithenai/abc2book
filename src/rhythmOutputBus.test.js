import {
  createRhythmOutputBus,
  armRhythmOutputBus,
  silenceRhythmOutputBus,
  ensureRhythmOutputBus,
  getRhythmOutputDestination,
} from './rhythmOutputBus'

function mockCtx() {
  return {
    currentTime: 1,
    destination: {},
    createGain: function() {
      return {
        gain: {
          value: 1,
          cancelScheduledValues: jest.fn(),
          setValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
        disconnect: jest.fn(),
      }
    },
  }
}

describe('rhythmOutputBus', function() {
  test('silence disconnects and clears master gain', function() {
    const bus = createRhythmOutputBus()
    const ctx = mockCtx()
    const first = armRhythmOutputBus(bus, ctx)
    silenceRhythmOutputBus(bus, ctx)
    expect(first.disconnect).toHaveBeenCalled()
    expect(bus.masterGain).toBeNull()
    expect(bus.armed).toBe(false)
  })

  test('armRhythmOutputBus returns gain node', function() {
    const bus = createRhythmOutputBus()
    const ctx = mockCtx()
    const gain = armRhythmOutputBus(bus, ctx)
    expect(gain).toBe(bus.masterGain)
  })

  test('re-arm after silence creates a new master gain node', function() {
    let createCount = 0
    const bus = createRhythmOutputBus()
    const ctx = mockCtx()
    ctx.createGain = function() {
      createCount += 1
      return {
        gain: {
          value: 1,
          cancelScheduledValues: jest.fn(),
          setValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
        disconnect: jest.fn(),
      }
    }
    const first = armRhythmOutputBus(bus, ctx)
    silenceRhythmOutputBus(bus, ctx)
    const second = armRhythmOutputBus(bus, ctx)
    expect(second).not.toBe(first)
    expect(createCount).toBe(2)
    expect(first.disconnect).toHaveBeenCalled()
  })

  test('ensure after silence does not revive the old muted gain', function() {
    let createCount = 0
    const bus = createRhythmOutputBus()
    const ctx = mockCtx()
    ctx.createGain = function() {
      createCount += 1
      return {
        gain: {
          value: 1,
          cancelScheduledValues: jest.fn(),
          setValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
        disconnect: jest.fn(),
      }
    }
    const first = armRhythmOutputBus(bus, ctx)
    silenceRhythmOutputBus(bus, ctx)
    // Concurrent playing-tick path used to re-arm the silenced node and unmute
    // leftover scheduled clicks before count-in created a fresh bus.
    const revived = ensureRhythmOutputBus(bus, ctx)
    expect(revived).not.toBe(first)
    expect(createCount).toBe(2)
    const armed = armRhythmOutputBus(bus, ctx)
    expect(armed).toBe(revived)
    expect(createCount).toBe(2)
  })

  test('getRhythmOutputDestination returns gain node', function() {
    const bus = createRhythmOutputBus()
    const ctx = mockCtx()
    const dest = getRhythmOutputDestination(bus, ctx)
    expect(dest).toBe(bus.masterGain)
  })
})
