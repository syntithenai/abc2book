import {
  createRhythmPlaybackController,
  startRhythmCountIn,
  enterRhythmPlaying,
  getRhythmPlaybackPhase,
  PHASE_PLAYING,
  PHASE_ENTRY_GAP,
} from './rhythmPlaybackController'
import { createRhythmOutputBus, armRhythmOutputBus } from './rhythmOutputBus'
import { rhythmFromPreset } from './metronomeRhythmPresets'
import { applyRhythmPreset } from './drumPatternPresets'

function mockAudioContext() {
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: function() {
      return {
        gain: {
          value: 1,
          cancelScheduledValues: function() {},
          setValueAtTime: function(v) { this.value = v },
        },
        connect: function() {},
        disconnect: function() {},
      }
    },
  }
}

function advanceAudioClock(ctx, steps, stepSec) {
  for (let i = 0; i < steps; i++) {
    ctx.currentTime += stepSec
    jest.advanceTimersByTime(25)
  }
}

describe('rhythmTimingIntegration', function() {
  test('playing phase schedules quarter slots on audio clock', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    const rhythm = rhythmFromPreset('4-4')
    const hits = []

    enterRhythmPlaying(controller, {
      rhythm: rhythm,
      tempo: 120,
      audioContext: ctx,
      musicSeconds: 0,
      musicStartAudioTime: 0,
      playSlot: function(ac, audioTime, r, slotInBar) {
        hits.push({ slotInBar: slotInBar, audioTime: audioTime })
      },
      getMusicSeconds: function() { return ctx.currentTime },
      getTempoFactor: function() { return 1 },
    })

    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_PLAYING)
    advanceAudioClock(ctx, 40, 0.125)

    const slots = hits.map(function(h) { return h.slotInBar })
    expect(slots).toContain(0)
    expect(slots).toContain(1)
    expect(slots).toContain(2)
    expect(slots).toContain(3)
    expect(new Set(slots).size).toBe(4)
    jest.useRealTimers()
  })

  test('count-in emits four quarter slots before playing handoff', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const slots = []
    let musicStarted = false

    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      slotCount: 4,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function(ac, t, r, slotInBar) {
        slots.push(slotInBar)
      },
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
      onMusicStart: function() {
        musicStarted = true
      },
    })

    advanceAudioClock(ctx, 80, 0.05)
    expect(slots.length).toBe(4)
    expect(musicStarted).toBe(true)
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_ENTRY_GAP)
    jest.useRealTimers()
  })

  test('6/8 playing phase schedules compound beat slots across one bar', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    const rhythm = rhythmFromPreset('6-8')
    const hits = []

    enterRhythmPlaying(controller, {
      rhythm: rhythm,
      tempo: 120,
      audioContext: ctx,
      musicSeconds: 0,
      musicStartAudioTime: 0,
      playSlot: function(ac, audioTime, r, slotInBar) {
        hits.push({ slotInBar: slotInBar })
      },
      getMusicSeconds: function() { return ctx.currentTime },
      getTempoFactor: function() { return 1 },
    })

    advanceAudioClock(ctx, 20, 0.25)
    const slots = hits.map(function(h) { return h.slotInBar })
    expect(slots).toContain(0)
    expect(slots).toContain(1)
    expect(new Set(slots).size).toBeGreaterThanOrEqual(2)
    jest.useRealTimers()
  })

  test('drum preset schedules multiple step slots per bar during playback', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    const rhythm = applyRhythmPreset('rock-basic')
    const hits = []

    enterRhythmPlaying(controller, {
      rhythm: rhythm,
      tempo: 120,
      audioContext: ctx,
      musicSeconds: 0,
      musicStartAudioTime: 0,
      playSlot: function(ac, audioTime, r, slotInBar) {
        hits.push(slotInBar)
      },
      getMusicSeconds: function() { return ctx.currentTime },
      getTempoFactor: function() { return 1 },
    })

    advanceAudioClock(ctx, 48, 0.125)
    expect(new Set(hits).size).toBeGreaterThanOrEqual(4)
    jest.useRealTimers()
  })
})
