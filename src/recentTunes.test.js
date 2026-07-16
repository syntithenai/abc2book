import { getStarredTunes } from './recentTunes'

describe('getStarredTunes', () => {
  it('returns empty array for missing tunes', () => {
    expect(getStarredTunes(null)).toEqual([])
    expect(getStarredTunes(undefined)).toEqual([])
  })

  it('filters starred tunes and sorts by name', () => {
    const tunes = {
      b: { id: 'b', name: 'Zebra', starred: true },
      a: { id: 'a', name: 'Alpha', starred: true },
      c: { id: 'c', name: 'Middle', starred: false },
      d: { id: 'd', name: 'Ghost' },
    }
    expect(getStarredTunes(tunes).map(function(t) { return t.id })).toEqual(['a', 'b'])
  })

  it('respects limit', () => {
    const tunes = {
      a: { id: 'a', name: 'A', starred: true },
      b: { id: 'b', name: 'B', starred: true },
      c: { id: 'c', name: 'C', starred: true },
    }
    expect(getStarredTunes(tunes, 2).map(function(t) { return t.id })).toEqual(['a', 'b'])
  })
})
