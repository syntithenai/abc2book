import { getSkillTempoRange, getWarmupOptionsForSkill, clampSkillLevel } from './practiceSessionSettings'

describe('practiceSessionSettings', function() {
  it('maps skill 1 and 10 to fixed tempos', function() {
    expect(getSkillTempoRange(1)).toEqual({ tempoStart: 0.5, tempoEnd: 0.5 })
    expect(getSkillTempoRange(10)).toEqual({ tempoStart: 1.0, tempoEnd: 1.0 })
  })

  it('maps skill 2 to 50% start and 80% end', function() {
    const range = getSkillTempoRange(2)
    expect(range.tempoStart).toBe(0.5)
    expect(range.tempoEnd).toBeCloseTo(0.8, 5)
  })

  it('ramps start tempo upward from skill 3', function() {
    const range = getSkillTempoRange(5)
    expect(range.tempoStart).toBeGreaterThan(0.5)
    expect(range.tempoEnd).toBeGreaterThan(range.tempoStart)
  })

  it('provides easier warmups at low skill', function() {
    const low = getWarmupOptionsForSkill(1, { key: 'D' })
    const high = getWarmupOptionsForSkill(10, { key: 'D' })
    expect(low.tempo).toBeLessThan(high.tempo)
    expect(low.noteLength).toBe('1/4')
  })

  it('clamps skill level', function() {
    expect(clampSkillLevel(0)).toBe(1)
    expect(clampSkillLevel(99)).toBe(10)
  })
})
