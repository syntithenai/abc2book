import {
  createRhythmTimeline,
  audioTimeForGlobalSlot,
  globalSlotAtOrAfterAudioTime,
  countInSlotRange,
  countInBeatClickSlots,
  computeCountInSchedule,
  computeDownbeatAudioTime,
  computeMusicStartAudioTime,
  reanchorTimelineAtSlot,
  scheduleTimelineSlots,
  createTimelineScheduleState,
} from './rhythmTimeline'
import { rhythmFromPreset } from './metronomeRhythmPresets'
import { createRhythmConfig, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'

function expectSteadySpacing(timeline, startSlot, count, expectedDelta) {
  for (let i = startSlot + 1; i < startSlot + count; i++) {
    const delta = audioTimeForGlobalSlot(timeline, i) - audioTimeForGlobalSlot(timeline, i - 1)
    expect(delta).toBeCloseTo(expectedDelta, 6)
  }
}

describe('rhythmTimeline', function() {
  const rhythm44 = rhythmFromPreset('4-4')
  const rhythm34 = rhythmFromPreset('3-4')
  const rhythm68 = rhythmFromPreset('6-8')
  const rhythm78 = rhythmFromPreset('7-8')

  test('4/4 quarter slots are evenly spaced at 120 BPM', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 120,
      downbeatAudioTime: 100,
    })
    expect(audioTimeForGlobalSlot(timeline, 0)).toBeCloseTo(100)
    expect(audioTimeForGlobalSlot(timeline, 1)).toBeCloseTo(100.5)
    expect(audioTimeForGlobalSlot(timeline, 4)).toBeCloseTo(102)
    expectSteadySpacing(timeline, 0, 200, 0.5)
  })

  test('3/4 spacing at 100 BPM', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm34,
      tempo: 100,
      downbeatAudioTime: 0,
    })
    expectSteadySpacing(timeline, 0, 60, 0.6)
  })

  test('6/8 eighth spacing at 120 BPM', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm68,
      tempo: 120,
      downbeatAudioTime: 50,
    })
    const eighth = 60 / 120 / 3
    expectSteadySpacing(timeline, 0, 36, eighth)
    expect(timeline.barDur).toBeCloseTo(eighth * 6)
  })

  test('7/8 compound spacing', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm78,
      tempo: 120,
      downbeatAudioTime: 0,
    })
    expect(timeline.totalSlots).toBe(7)
    expect(timeline.barDur).toBeGreaterThan(0)
    expect(audioTimeForGlobalSlot(timeline, 7)).toBeCloseTo(timeline.barDur)
  })

  test('swing lengthens first pulse of each beat', function() {
    const rhythm = createRhythmConfig(4, rhythm44.accents, [2, 2, 2, 2], {
      engineMode: ENGINE_MODE_DRUMS,
      drumPattern: { resolution: 8, swing: 0.3, tracks: [] },
    })
    const straight = createRhythmTimeline({ rhythm: rhythm, tempo: 120, swing: 0, downbeatAudioTime: 0 })
    const swung = createRhythmTimeline({ rhythm: rhythm, tempo: 120, swing: 0.3, downbeatAudioTime: 0 })
    const straightFirst = audioTimeForGlobalSlot(straight, 1) - audioTimeForGlobalSlot(straight, 0)
    const swungFirst = audioTimeForGlobalSlot(swung, 1) - audioTimeForGlobalSlot(swung, 0)
    expect(swungFirst).toBeGreaterThan(straightFirst)
  })

  test('count-in beat clicks land on beat boundaries with subdivisions', function() {
    const rhythm = createRhythmConfig(4, rhythm44.accents, [2, 2, 2, 2])
    const timeline = createRhythmTimeline({
      rhythm: rhythm,
      tempo: 120,
      downbeatAudioTime: 10,
    })
    const slots = countInBeatClickSlots(timeline, 4, 0)
    expect(slots).toEqual([-8, -6, -4, -2])
    const schedule = computeCountInSchedule(timeline, {
      beatCount: 4,
      pickupBeats: 0,
      firstClickAudioTime: 6,
    })
    expect(schedule.clicks.length).toBe(4)
    expect(schedule.clicks[1].audioTime - schedule.clicks[0].audioTime).toBeCloseTo(0.5, 4)
  })

  test('negative global slots for count-in', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 120,
      downbeatAudioTime: 10,
    })
    expect(audioTimeForGlobalSlot(timeline, -1)).toBeCloseTo(9.5)
    expect(audioTimeForGlobalSlot(timeline, -4)).toBeCloseTo(8)
    const range = countInSlotRange(timeline, {
      slotCount: 4,
      pickupBeats: 0,
    })
    expect(range.slots).toEqual([-4, -3, -2, -1])
    expect(range.gapSlot).toBe(-1)
    expect(range.musicStartSlot).toBe(0)
    const schedule = computeCountInSchedule(timeline, {
      slotCount: 4,
      pickupBeats: 0,
      firstClickAudioTime: 8,
    })
    expect(schedule.clicks.length).toBe(4)
    expect(schedule.musicStartAudioTime).toBeCloseTo(10)
    expect(schedule.clicks[0].audioTime).toBeCloseTo(8)
  })

  test('3/4 one-beat pickup count-in uses two clicks then anacrusis', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm34,
      tempo: 100,
      downbeatAudioTime: 100,
    })
    const beat = 0.6
    const musicStart = computeMusicStartAudioTime({
      downbeatAudioTime: 100,
      pickupBeats: 1,
      tempo: 100,
    })
    expect(musicStart).toBeCloseTo(100 - beat)
    const firstClick = 100 - 3 * beat
    const schedule = computeCountInSchedule(timeline, {
      slotCount: 2,
      pickupBeats: 1,
      firstClickAudioTime: firstClick,
    })
    expect(schedule.clicks.length).toBe(2)
    expect(schedule.musicStartSlot).toBe(-1)
    expect(schedule.musicStartAudioTime).toBeCloseTo(firstClick + 2 * beat)
    expect(schedule.downbeatAudioTime).toBeCloseTo(100)
    expect(schedule.clicks[0].slotInBar).toBe(0)
    expect(schedule.clicks[1].slotInBar).toBe(1)
  })

  test('12/8 one-eighth pickup maps to pulse slot -1 (not 0)', function() {
    const rhythm128 = rhythmFromPreset('12-8')
    const timeline = createRhythmTimeline({
      rhythm: rhythm128,
      tempo: 100,
      downbeatAudioTime: 100,
    })
    const beat = 0.6
    const pickupBeats = 1 / 3
    const schedule = computeCountInSchedule(timeline, {
      slotCount: 3,
      pickupBeats: pickupBeats,
      pickupDelaySec: (2 / 3) * beat,
      firstClickAudioTime: 100 - 4 * beat,
    })
    expect(schedule.musicStartSlot).toBe(-1)
    expect(schedule.musicStartAudioTime).toBeCloseTo(100 - pickupBeats * beat)
    expect(schedule.downbeatAudioTime).toBeCloseTo(100)
    // Re-anchor as the controller does: pulse -1 at music start keeps true downbeat.
    reanchorTimelineAtSlot(timeline, schedule.musicStartSlot, schedule.musicStartAudioTime)
    expect(audioTimeForGlobalSlot(timeline, -1)).toBeCloseTo(schedule.musicStartAudioTime)
    expect(audioTimeForGlobalSlot(timeline, 0)).toBeCloseTo(100)
    expect(audioTimeForGlobalSlot(timeline, 3)).toBeCloseTo(100 + beat)
  })

  test('pickup downbeat conversion round-trips', function() {
    const musicStart = 42.5
    const downbeat = computeDownbeatAudioTime({
      musicStartAudioTime: musicStart,
      pickupBeats: 1,
      tempo: 117,
    })
    expect(computeMusicStartAudioTime({
      downbeatAudioTime: downbeat,
      pickupBeats: 1,
      tempo: 117,
    })).toBeCloseTo(musicStart)
  })

  test('globalSlotAtOrAfterAudioTime inverts audioTimeForGlobalSlot', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 117,
      downbeatAudioTime: 44,
    })
    for (let k = -8; k <= 12; k++) {
      const t = audioTimeForGlobalSlot(timeline, k)
      expect(globalSlotAtOrAfterAudioTime(timeline, t)).toBe(k)
    }
  })

  test('reanchorTimelineAtSlot preserves slot phase', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 120,
      downbeatAudioTime: 0,
    })
    reanchorTimelineAtSlot(timeline, 5, 200)
    expect(audioTimeForGlobalSlot(timeline, 5)).toBeCloseTo(200)
    expect(audioTimeForGlobalSlot(timeline, 6)).toBeCloseTo(200.5)
  })

  test('scheduleTimelineSlots does not duplicate slots', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 120,
      downbeatAudioTime: 0,
    })
    const state = createTimelineScheduleState()
    const hits = []
    scheduleTimelineSlots(timeline, state, {
      audioContextTime: 0,
      lookaheadSec: 1.0,
      playSlot: function(audioTime, slotInBar, globalSlot) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar, globalSlot: globalSlot })
      },
    })
    scheduleTimelineSlots(timeline, state, {
      audioContextTime: 0.25,
      lookaheadSec: 1.0,
      playSlot: function(audioTime, slotInBar, globalSlot) {
        hits.push({ audioTime: audioTime, slotInBar: slotInBar, globalSlot: globalSlot })
      },
    })
    const globalSlots = hits.map(function(h) { return h.globalSlot })
    const unique = globalSlots.filter(function(v, i, a) { return a.indexOf(v) === i })
    expect(globalSlots.length).toBe(unique.length)
    expect(hits[0].audioTime).toBeCloseTo(0)
    expect(hits[1].audioTime - hits[0].audioTime).toBeCloseTo(0.5)
  })

  test('scheduleTimelineSlots plays slightly late slots instead of skipping', function() {
    const timeline = createRhythmTimeline({
      rhythm: rhythm44,
      tempo: 120,
      downbeatAudioTime: 0,
    })
    const state = createTimelineScheduleState()
    const hits = []
    scheduleTimelineSlots(timeline, state, {
      audioContextTime: 0.1,
      lookaheadSec: 0.5,
      playSlot: function(audioTime, slotInBar, globalSlot) {
        hits.push({ audioTime: audioTime, globalSlot: globalSlot })
      },
    })
    expect(hits.some(function(h) { return h.globalSlot === 0 })).toBe(true)
  })
})
