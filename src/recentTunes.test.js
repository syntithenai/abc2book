import { getRecentArtists, getStarredTunes } from './recentTunes'
import { TUNE_VIEW_HISTORY_STORAGE_KEY } from './tuneViewHistoryStore'

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

describe('getRecentArtists', () => {
  beforeEach(function() {
    localStorage.removeItem(TUNE_VIEW_HISTORY_STORAGE_KEY)
  })

  it('returns empty array for missing tunes', () => {
    expect(getRecentArtists(null)).toEqual([])
    expect(getRecentArtists(undefined)).toEqual([])
  })

  it('orders artists by view history then lastUpdated', () => {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      t2: { lastViewed: 200, viewCount: 1 },
      t1: { lastViewed: 100, viewCount: 1 },
    }))
    const tunes = {
      t1: { id: 't1', artists: ['Older View'], lastUpdated: 50 },
      t2: { id: 't2', artists: ['Newer View'], lastUpdated: 10 },
      t3: { id: 't3', artists: ['Only Updated'], lastUpdated: 300 },
    }
    expect(getRecentArtists(tunes)).toEqual(['Newer View', 'Older View', 'Only Updated'])
  })

  it('respects limit', () => {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      a: { lastViewed: 3, viewCount: 1 },
      b: { lastViewed: 2, viewCount: 1 },
      c: { lastViewed: 1, viewCount: 1 },
    }))
    const tunes = {
      a: { id: 'a', artists: ['A'] },
      b: { id: 'b', artists: ['B'] },
      c: { id: 'c', artists: ['C'] },
    }
    expect(getRecentArtists(tunes, 2)).toEqual(['A', 'B'])
  })
})
