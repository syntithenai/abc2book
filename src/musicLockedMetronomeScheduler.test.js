import {
  createMusicLockedMetronomeState,
  resetMusicLockedMetronome,
  scheduleMusicLockedSlots,
  musicSecondsForGlobalSlot,
  globalSlotAtMusicSeconds,
  slotDurationSec,
  getRhythmSwing,
  barDurationSec,
} from './musicLockedMetronomeScheduler'
import { rhythmFromPreset } from './metronomeRhythmPresets'
import { createRhythmConfig, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'
import { buildDrumPattern } from './drumPatternPresets'

function rhythm44() {
  return rhythmFromPreset('4-4')
}

describe('musicLockedMetronomeScheduler', function() {
  test('schedules slot 0 at music start', function() {
    const state = createMusicLockedMetronomeState()
    const hits = []
    scheduleMusicLockedSlots(state, {
      rhythm: rhythm44(),
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 10,
      lookaheadSec: 0.5,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].slotInBar).toBe(0)
    expect(hits[0].audioTime).toBeCloseTo(10)
  })

  test('does not duplicate slots when beatCallback fires repeatedly', function() {
    const state = createMusicLockedMetronomeState()
    const hits = []
    const opts = {
      rhythm: rhythm44(),
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 10,
      lookaheadSec: 0.5,
      playSlot: function(audioTime, slotInBar) {
        hits.push(slotInBar)
      },
    }
    scheduleMusicLockedSlots(state, opts)
    const firstCount = hits.length
    opts.musicSeconds = 0.01
    opts.audioContextTime = 10.01
    scheduleMusicLockedSlots(state, opts)
    expect(hits.length).toBe(firstCount)
  })

  test('schedules correct slot after seek to bar 2 beat 3', function() {
    const rhythm = rhythm44()
    const tempo = 120
    const state = createMusicLockedMetronomeState()
    const musicSeconds = 1.0
    const hits = []
    scheduleMusicLockedSlots(state, {
      rhythm: rhythm,
      tempo: tempo,
      musicSeconds: musicSeconds,
      audioContextTime: 5,
      lookaheadSec: 0.02,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ slotInBar: slotInBar, audioTime: audioTime })
      },
    })
    expect(hits.length).toBe(1)
    expect(hits[0].slotInBar).toBe(2)
  })

  test('musicSecondsForGlobalSlot matches 4/4 grid at 120 bpm', function() {
    const rhythm = rhythm44()
    expect(musicSecondsForGlobalSlot(0, rhythm, 120, 0)).toBeCloseTo(0)
    expect(musicSecondsForGlobalSlot(1, rhythm, 120, 0)).toBeCloseTo(0.5)
    expect(musicSecondsForGlobalSlot(4, rhythm, 120, 0)).toBeCloseTo(2.0)
  })

  test('6/8 bar has six slots per bar', function() {
    const rhythm = rhythmFromPreset('6-8')
    const barDur = barDurationSec(rhythm, 120, 0)
    expect(musicSecondsForGlobalSlot(6, rhythm, 120, 0)).toBeCloseTo(barDur)
  })

  test('swing lengthens first pulse of a two-pulse beat', function() {
    const rhythm = createRhythmConfig(2, null, [2, 2], {
      engineMode: ENGINE_MODE_DRUMS,
      drumPattern: buildDrumPattern(4, {}, 0.5),
    })
    const secPerBeat = 0.5
    const straight0 = slotDurationSec(rhythm, 0, secPerBeat, 0)
    const swung0 = slotDurationSec(rhythm, 0, secPerBeat, 0.5)
    expect(swung0).toBeGreaterThan(straight0)
  })

  test('reset clears scheduled keys', function() {
    const state = createMusicLockedMetronomeState()
    scheduleMusicLockedSlots(state, {
      rhythm: rhythm44(),
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 1,
      lookaheadSec: 0.5,
      playSlot: function() {},
    })
    expect(state.scheduledKeys.size).toBeGreaterThan(0)
    resetMusicLockedMetronome(state)
    expect(state.scheduledKeys.size).toBe(0)
  })

  test('globalSlotAtMusicSeconds inverts musicSecondsForGlobalSlot', function() {
    const rhythm = rhythm44()
    const gs = globalSlotAtMusicSeconds(1.25, rhythm, 120, 0)
    expect(musicSecondsForGlobalSlot(gs, rhythm, 120, 0)).toBeCloseTo(1.25, 2)
  })
})
