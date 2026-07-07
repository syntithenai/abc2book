import { parseTempoBpm, tempoRangeLabel, tempoRangeSortKey } from './tempoRange'

describe('tempoRange', function() {
  it('parses plain and ABC-style tempo values', function() {
    expect(parseTempoBpm(120)).toBe(120)
    expect(parseTempoBpm('120')).toBe(120)
    expect(parseTempoBpm('1/4=96')).toBe(96)
    expect(parseTempoBpm('')).toBe(0)
    expect(parseTempoBpm(null)).toBe(0)
  })

  it('maps bpm values to readable range labels', function() {
    expect(tempoRangeLabel(50)).toBe('Under 60 (Very slow)')
    expect(tempoRangeLabel(72)).toBe('60–79 (Slow)')
    expect(tempoRangeLabel(100)).toBe('100–119 (Medium)')
    expect(tempoRangeLabel(180)).toBe('160+ (Very fast)')
    expect(tempoRangeLabel(0)).toBe('')
  })

  it('sorts range labels by starting bpm', function() {
    expect(tempoRangeSortKey('60–79 (Slow)')).toBe(60)
    expect(tempoRangeSortKey('160+ (Very fast)')).toBe(160)
    expect(tempoRangeSortKey('Under 60 (Very slow)')).toBe(0)
    expect(tempoRangeSortKey('')).toBe(-1)
  })
})
