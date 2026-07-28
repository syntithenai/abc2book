import {
  entryGapDurationSec,
  schedulePlayingSlots,
  createPlayingScheduleState,
  musicSecondsForGlobalSlot,
  computeMusicLockedLookaheadSec,
  ensureScheduleEpoch,
} from './rhythmGrid'
import { rhythmFromPreset } from './metronomeRhythmPresets'

describe('rhythmGrid', function() {
  const rhythm44 = rhythmFromPreset('4-4')

  test('entryGapDurationSec is one quarter slot at 120 BPM', function() {
    expect(entryGapDurationSec(rhythm44, 120, 0, 0)).toBeCloseTo(0.5)
  })

  test('schedulePlayingSlots places quarter slots at 0, 0.5, 1.0, 1.5 music seconds', function() {
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 100,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    expect(hits.map(function(h) { return h.slotInBar })).toEqual([0, 1, 2, 3])
    expect(hits[0].audioTime).toBeCloseTo(100)
    expect(hits[1].audioTime).toBeCloseTo(100.5)
    expect(hits[2].audioTime).toBeCloseTo(101)
    expect(hits[3].audioTime).toBeCloseTo(101.5)
  })

  test('musicSecondsForGlobalSlot maps quarter grid at 120 BPM', function() {
    expect(musicSecondsForGlobalSlot(0, rhythm44, 120, 0)).toBeCloseTo(0)
    expect(musicSecondsForGlobalSlot(1, rhythm44, 120, 0)).toBeCloseTo(0.5)
    expect(musicSecondsForGlobalSlot(2, rhythm44, 120, 0)).toBeCloseTo(1.0)
    expect(musicSecondsForGlobalSlot(3, rhythm44, 120, 0)).toBeCloseTo(1.5)
  })

  test('lookahead covers one 4/4 bar at 120 BPM', function() {
    expect(computeMusicLockedLookaheadSec(rhythm44, 120, 0)).toBeCloseTo(2.0)
  })

  test('schedulePlayingSlots from mid-bar skips past slots and does not replay them', function() {
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 0.75,
      audioContextTime: 200,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    expect(hits.map(function(h) { return h.slotInBar }).slice(0, 2)).toEqual([2, 3])
    expect(hits[0].audioTime).toBeCloseTo(200.25)
    expect(hits[1].audioTime).toBeCloseTo(200.75)
  })

  test('missed slots are marked scheduled without firing on later ticks', function() {
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 1.25,
      audioContextTime: 300,
      lookaheadSec: 0.3,
      playSlot: function(audioTime, slotInBar) {
        hits.push(slotInBar)
      },
    })
    expect(hits).toEqual([3])
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 1.3,
      audioContextTime: 300.05,
      lookaheadSec: 0.3,
      playSlot: function(audioTime, slotInBar) {
        hits.push(slotInBar)
      },
    })
    expect(hits).toEqual([3])
  })

  test('schedule epoch keeps steady audio spacing across beat ticks', function() {
    const state = createPlayingScheduleState()
    const hits = []
    function playSlot(audioTime, slotInBar) {
      hits.push({ audioTime: audioTime, slotInBar: slotInBar })
    }
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 10,
      playSlot: playSlot,
    })
    schedulePlayingSlots(state, {
      rhythm: rhythm44,
      tempo: 120,
      musicSeconds: 0.5,
      audioContextTime: 10.5,
      playSlot: playSlot,
    })
    const slot1Hits = hits.filter(function(h) { return h.slotInBar === 1 })
    const slot2Hits = hits.filter(function(h) { return h.slotInBar === 2 })
    expect(slot1Hits.length).toBe(1)
    expect(slot2Hits.length).toBe(1)
    expect(slot1Hits[0].audioTime).toBeCloseTo(10.5)
    expect(slot2Hits[0].audioTime).toBeCloseTo(11.0)
  })

  test('ensureScheduleEpoch keeps initial anchor when drift is small', function() {
    const state = createPlayingScheduleState()
    ensureScheduleEpoch(state, 0, 10, 120)
    ensureScheduleEpoch(state, 2, 12.02, 120)
    expect(state.epochMusicSeconds).toBe(0)
    expect(state.epochAudioTime).toBe(10)
  })

  test('ensureScheduleEpoch reanchors when drift exceeds threshold or tempo changes', function() {
    const state = createPlayingScheduleState()
    ensureScheduleEpoch(state, 0, 10, 120)
    ensureScheduleEpoch(state, 2, 12.5, 120)
    expect(state.epochMusicSeconds).toBe(2)
    expect(state.epochAudioTime).toBe(12.5)
    ensureScheduleEpoch(state, 3, 13.5, 100)
    expect(state.epochMusicSeconds).toBe(3)
    expect(state.epochAudioTime).toBe(13.5)
    expect(state.tempo).toBe(100)
  })

  test('schedulePlayingSlots with one-beat pickup accents the true downbeat', function() {
    const rhythm34 = rhythmFromPreset('3-4')
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm34,
      tempo: 120,
      musicSeconds: 0,
      musicStartSlot: -1,
      audioContextTime: 50,
      playSlot: function(audioTime, slotInBar, globalSlot) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar, globalSlot: globalSlot })
      },
    })
    expect(hits[0].globalSlot).toBe(-1)
    expect(hits[0].slotInBar).toBe(2)
    expect(hits[0].audioTime).toBeCloseTo(50)
    expect(hits[1].globalSlot).toBe(0)
    expect(hits[1].slotInBar).toBe(0)
    expect(hits[1].audioTime).toBeCloseTo(50.5)
  })

  test('schedulePlayingSlots maps score beats through tempoFactor onto audio time', function() {
    const rhythm34 = rhythmFromPreset('3-4')
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm34,
      tempo: 120,
      tempoFactor: 1.5,
      musicSeconds: 0,
      audioContextTime: 20,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    // Score beat = 0.5s; wall gap = 0.5 / 1.5.
    expect(hits[0].slotInBar).toBe(0)
    expect(hits[0].audioTime).toBeCloseTo(20)
    expect(hits[1].slotInBar).toBe(1)
    expect(hits[1].audioTime).toBeCloseTo(20 + 0.5 / 1.5)
    expect(hits[2].slotInBar).toBe(2)
    expect(hits[2].audioTime).toBeCloseTo(20 + 1.0 / 1.5)
  })

  test('live playhead sample keeps click tempo locked across ticks', function() {
    const rhythm34 = rhythmFromPreset('3-4')
    const state = createPlayingScheduleState()
    const hits = []
    schedulePlayingSlots(state, {
      rhythm: rhythm34,
      tempo: 120,
      musicSeconds: 0,
      audioContextTime: 10,
      lookaheadSec: 0.6,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    schedulePlayingSlots(state, {
      rhythm: rhythm34,
      tempo: 120,
      // Playhead advanced in lockstep with audio (no sticky-epoch lag).
      musicSeconds: 0.5,
      audioContextTime: 10.5,
      lookaheadSec: 0.6,
      playSlot: function(audioTime, slotInBar) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar })
      },
    })
    const beat2 = hits.filter(function(h) { return h.slotInBar === 2 })
    expect(beat2.length).toBe(1)
    expect(beat2[0].audioTime).toBeCloseTo(11.0)
  })

  test('ensureScheduleEpoch accounts for tempoFactor in drift', function() {
    const state = createPlayingScheduleState()
    ensureScheduleEpoch(state, 0, 10, 120, 1.5)
    // 0.9 score seconds => 0.6 wall seconds at 1.5x
    ensureScheduleEpoch(state, 0.9, 10.6, 120, 1.5)
    expect(state.epochMusicSeconds).toBe(0)
    expect(state.epochAudioTime).toBe(10)
    ensureScheduleEpoch(state, 0.9, 11.0, 120, 1.5)
    expect(state.epochMusicSeconds).toBe(0.9)
    expect(state.epochAudioTime).toBe(11.0)
  })
})
