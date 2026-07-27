import {
  createRhythmOutputBus,
  armRhythmOutputBus,
  silenceRhythmOutputBus,
  getRhythmOutputDestination,
} from './rhythmOutputBus'

describe('rhythmOutputBus', function() {
  test('silence sets master gain to zero', function() {
    const bus = createRhythmOutputBus()
    const ctx = {
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
    armRhythmOutputBus(bus, ctx)
    silenceRhythmOutputBus(bus, ctx)
    expect(bus.masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 1)
    expect(bus.armed).toBe(false)
  })

  test('armRhythmOutputBus returns gain node', function() {
    const bus = createRhythmOutputBus()
    const ctx = {
      currentTime: 0,
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
    const gain = armRhythmOutputBus(bus, ctx)
    expect(gain).toBe(bus.masterGain)
  })

  test('re-arm after silence creates a new master gain node', function() {
    let createCount = 0
    const bus = createRhythmOutputBus()
    const ctx = {
      currentTime: 0,
      destination: {},
      createGain: function() {
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
      },
    }
    const first = armRhythmOutputBus(bus, ctx)
    silenceRhythmOutputBus(bus, ctx)
    const second = armRhythmOutputBus(bus, ctx)
    expect(second).not.toBe(first)
    expect(createCount).toBe(2)
    expect(first.disconnect).toHaveBeenCalled()
  })

  test('getRhythmOutputDestination returns gain node', function() {
    const bus = createRhythmOutputBus()
    const ctx = {
      currentTime: 0,
      destination: {},
      createGain: function() {
        return {
          gain: { value: 1, connect: jest.fn() },
          connect: jest.fn(),
          disconnect: jest.fn(),
        }
      },
    }
    const dest = getRhythmOutputDestination(bus, ctx)
    expect(dest).toBe(bus.masterGain)
  })
})
