import { applyRhythmPreset } from './drumPatternPresets'
import {
  buildFillRhythmContext,
  buildBarScheduleFromContext,
  slotRolesFromDrumPattern,
  roleToPatternChar,
  buildActiveSlotIndices,
  buildChordHitSlots,
  buildBassHitSlots,
} from './fillDrumRhythm'

describe('fillDrumRhythm', function() {
  test('rock-basic maps kick to bass and snare to chord slots', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const context = buildFillRhythmContext(rhythm)
    expect(context).not.toBeNull()
    expect(context.slotsPerBar).toBe(16)
    expect(context.pattern[0]).toBe('boom')
    expect(context.pattern[4]).toBe('chick')
    expect(context.pattern[8]).toBe('boom')
    expect(context.pattern[12]).toBe('chick')
    expect(buildBassHitSlots(buildBarScheduleFromContext(context, 2))).toEqual([0, 8])
    expect(buildChordHitSlots(buildBarScheduleFromContext(context, 2))).toEqual([4, 12])
  })

  test('folk-jig produces six slots for 6/8', function() {
    const rhythm = applyRhythmPreset('folk-jig')
    const context = buildFillRhythmContext(rhythm)
    expect(context.slotsPerBar).toBe(6)
    const schedule = buildBarScheduleFromContext(context, 2)
    expect(schedule.slotStartsSec.length).toBe(6)
    expect(schedule.slotDurationsSec.reduce(function(sum, value) {
      return sum + value
    }, 0)).toBeCloseTo(2, 3)
  })

  test('multi-hit slot merges kick and hat roles', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const role = slotRolesFromDrumPattern(rhythm.drumPattern, 0)
    expect(role.bass).toBe(true)
    expect(role.arpeggio).toBe(true)
    expect(roleToPatternChar(role)).toBe('boom')
  })

  test('buildActiveSlotIndices includes hat slots by default', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const schedule = buildBarScheduleFromContext(buildFillRhythmContext(rhythm), 2)
    const active = buildActiveSlotIndices(schedule)
    expect(active.length).toBeGreaterThan(4)
    expect(active).toContain(0)
    expect(active).toContain(2)
  })

  test('buildFillRhythmContext returns null without drum pattern', function() {
    expect(buildFillRhythmContext({ engineMode: 'click', beatsPerBar: 4 })).toBeNull()
  })
})
