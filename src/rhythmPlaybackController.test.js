import {
    createRhythmPlaybackController,
    stopRhythmPlaybackController,
    startRhythmCountIn,
    enterRhythmPlaying,
    tickRhythmPlaying,
    beginRhythmPlayingAtMusicStart,
    getRhythmPlaybackPhase,
    setRhythmPlaybackRhythm,
    PHASE_IDLE,
    PHASE_ENTRY_GAP,
    PHASE_PLAYING,
} from './rhythmPlaybackController'
import { createRhythmOutputBus, armRhythmOutputBus } from './rhythmOutputBus'
import { rhythmFromPreset, slotsPerBar } from './metronomeRhythmPresets'

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

function advancePlayingTicks(ctx, steps) {
  for (let i = 0; i < steps; i++) {
    ctx.currentTime += 0.05
    jest.advanceTimersByTime(25)
  }
}

describe('rhythmPlaybackController', function() {
  test('count-in reports slot emissions via onSlot', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const beats = []
    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      slotCount: 4,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function() {},
      onSlot: function(slot, emitted, total) {
        beats.push(emitted)
      },
      onMusicStart: function() {},
    })
    expect(beats).toEqual([1, 2, 3, 4])
    jest.useRealTimers()
  })

  test('stop silences output during count-in', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      slotCount: 4,
      duringPlayback: false,
      audioContext: ctx,
      playSlot: function() {},
      onMusicStart: function() {},
    })
    stopRhythmPlaybackController(controller)
    expect(bus.masterGain).toBeNull()
    expect(bus.armed).toBe(false)
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_IDLE)
    jest.useRealTimers()
  })

  test('2/4 count-in at 100 BPM spaces quarter clicks evenly', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const clickTimes = []

    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('2-4'),
      tempo: 100,
      slotCount: 2,
      duringPlayback: false,
      audioContext: ctx,
      playSlot: function(ac, audioTime) {
        clickTimes.push(audioTime)
      },
      onMusicStart: function() {},
    })

    expect(clickTimes.length).toBe(2)
    expect(clickTimes[1] - clickTimes[0]).toBeCloseTo(0.6, 4)
    jest.useRealTimers()
  })

  test('playing tick does not schedule during count-in entry gap', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const hits = []

    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      slotCount: 4,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function(ac, audioTime, rhythm, slotInBar) {
        hits.push(slotInBar)
      },
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
      onMusicStart: function() {},
    })

    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_ENTRY_GAP)
    expect(hits.length).toBe(4)
    const countInHits = hits.length
    tickRhythmPlaying(controller)
    expect(hits.length).toBe(countInHits)
    jest.useRealTimers()
  })

  test('count-in with duringPlayback hands off to playing interval', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    let musicSeconds = 0
    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      slotCount: 4,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function() {},
      getMusicSeconds: function() { return musicSeconds },
      getTempoFactor: function() { return 1 },
      onMusicStart: function() {
        beginRhythmPlayingAtMusicStart(controller, {
          musicSeconds: 0,
          musicStartAudioTime: controller.musicStartAudioTime,
        })
      },
    })
    beginRhythmPlayingAtMusicStart(controller, {
      musicSeconds: 0,
      musicStartAudioTime: controller.musicStartAudioTime,
      musicStartSlot: controller.musicStartSlot,
    })
    advancePlayingTicks(ctx, 80)
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_PLAYING)
    musicSeconds = 0.5
    advancePlayingTicks(ctx, 20)
    stopRhythmPlaybackController(controller)
    jest.useRealTimers()
  })

  test('3/4 anacrusis keeps count-in beat spacing through playing phase', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const clickTimes = []
    startRhythmCountIn(controller, {
      rhythm: rhythmFromPreset('3-4'),
      tempo: 120,
      slotCount: 2,
      pickupBeats: 1,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function(ac, audioTime) {
        clickTimes.push(audioTime)
      },
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
      onMusicStart: function(startAt) {
        beginRhythmPlayingAtMusicStart(controller, {
          musicSeconds: 0,
          musicStartAudioTime: startAt,
          musicStartSlot: controller.musicStartSlot,
        })
      },
    })
    expect(clickTimes.length).toBe(2)
    const countInBeat = clickTimes[1] - clickTimes[0]
    expect(countInBeat).toBeCloseTo(0.5, 4)
    const musicStart = controller.musicStartAudioTime
    beginRhythmPlayingAtMusicStart(controller, {
      musicSeconds: 0,
      musicStartAudioTime: musicStart,
      musicStartSlot: controller.musicStartSlot,
    })
    // Advance past anacrusis onto the first downbeat and next beat.
    ctx.currentTime = musicStart
    jest.advanceTimersByTime(25)
    advancePlayingTicks(ctx, 30)
    const afterMusic = clickTimes.filter(function(t) { return t >= musicStart - 0.001 })
    expect(afterMusic.length).toBeGreaterThanOrEqual(2)
    expect(afterMusic[1] - afterMusic[0]).toBeCloseTo(countInBeat, 3)
    stopRhythmPlaybackController(controller)
    jest.useRealTimers()
  })

  test('9/8 count-in schedules nine pulse slots for three beats then avoids bar burst on handoff', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    const rhythm98 = rhythmFromPreset('9-8')
    const clickTimes = []
    const slotInBars = []
    startRhythmCountIn(controller, {
      rhythm: rhythm98,
      tempo: 120,
      slotCount: 9,
      duringPlayback: true,
      audioContext: ctx,
      playSlot: function(ac, audioTime, rhythm, slotInBar) {
        clickTimes.push(audioTime)
        slotInBars.push(slotInBar)
      },
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
      onMusicStart: function(startAt) {
        beginRhythmPlayingAtMusicStart(controller, {
          musicSeconds: 0,
          musicStartAudioTime: startAt,
          musicStartSlot: controller.musicStartSlot,
        })
      },
    })
    expect(clickTimes.length).toBe(9)
    expect(slotInBars).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    const pulse = clickTimes[1] - clickTimes[0]
    expect(pulse).toBeCloseTo((60 / 120) / 3, 4)
    const musicStart = controller.musicStartAudioTime
    beginRhythmPlayingAtMusicStart(controller, {
      musicSeconds: 0,
      musicStartAudioTime: musicStart,
      musicStartSlot: controller.musicStartSlot,
    })
    ctx.currentTime = musicStart
    jest.advanceTimersByTime(25)
    const hitsBeforeAdvance = slotInBars.length
    advancePlayingTicks(ctx, 1)
    expect(slotInBars.length - hitsBeforeAdvance).toBeLessThanOrEqual(1)
    stopRhythmPlaybackController(controller)
    jest.useRealTimers()
  })

  test('beginRhythmPlayingAtMusicStart schedules after MIDI anchor', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    const slots = []
    controller.phase = PHASE_PLAYING
    controller.rhythm = rhythmFromPreset('4-4')
    controller.tempo = 120
    controller.audioContext = ctx
    controller.outputBus = bus
    controller.callbacks.playSlot = function(ac, t, r, slotInBar) {
      slots.push(slotInBar)
    }
    controller.callbacks.getMusicSeconds = function() { return 0 }
    controller.callbacks.getTempoFactor = function() { return 1 }
    ctx.currentTime = 9.9
    beginRhythmPlayingAtMusicStart(controller, {
      musicSeconds: 0,
      musicStartAudioTime: 10,
    })
    advancePlayingTicks(ctx, 40)
    expect(slots.length).toBeGreaterThanOrEqual(4)
    jest.useRealTimers()
  })

  test('enterRhythmPlaying activates playing phase', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    const slots = []
    enterRhythmPlaying(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      audioContext: ctx,
      musicSeconds: 0,
      musicStartAudioTime: 0,
      playSlot: function(ac, audioTime, rhythm, slotInBar) {
        slots.push(slotInBar)
      },
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
    })
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_PLAYING)
    advancePlayingTicks(ctx, 40)
    expect(slots.length).toBeGreaterThanOrEqual(4)
    stopRhythmPlaybackController(controller)
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_IDLE)
    jest.useRealTimers()
  })

  test('setRhythmPlaybackRhythm swaps grid during playing', function() {
    jest.useFakeTimers()
    const bus = createRhythmOutputBus()
    const controller = createRhythmPlaybackController(bus)
    const ctx = mockAudioContext()
    armRhythmOutputBus(bus, ctx)
    enterRhythmPlaying(controller, {
      rhythm: rhythmFromPreset('4-4'),
      tempo: 120,
      audioContext: ctx,
      musicSeconds: 0,
      musicStartAudioTime: 0,
      playSlot: function() {},
      getMusicSeconds: function() { return 0 },
      getTempoFactor: function() { return 1 },
    })
    expect(slotsPerBar(controller.rhythm)).toBe(4)
    setRhythmPlaybackRhythm(controller, rhythmFromPreset('3-4'))
    expect(slotsPerBar(controller.rhythm)).toBe(3)
    expect(getRhythmPlaybackPhase(controller)).toBe(PHASE_PLAYING)
    stopRhythmPlaybackController(controller)
    jest.useRealTimers()
  })
})
