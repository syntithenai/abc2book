import { getRecentArtists, getRecentTunes, getRecentlyUpdatedTunes, getStarredTunes } from './recentTunes'
import { TUNE_VIEW_HISTORY_STORAGE_KEY } from './tuneViewHistoryStore'

describe('getRecentTunes', () => {
  beforeEach(function() {
    localStorage.removeItem(TUNE_VIEW_HISTORY_STORAGE_KEY)
  })

  it('returns empty array for missing tunes', () => {
    expect(getRecentTunes(null)).toEqual([])
    expect(getRecentTunes(undefined)).toEqual([])
  })

  it('orders by view history and ignores lastUpdated-only imports', () => {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      visited: { lastViewed: 100, viewCount: 1 },
    }))
    const tunes = {
      visited: { id: 'visited', name: 'Visited', lastUpdated: 10 },
      importedA: { id: 'importedA', name: 'Imported A', lastUpdated: 9000 },
      importedB: { id: 'importedB', name: 'Imported B', lastUpdated: 8000 },
    }
    expect(getRecentTunes(tunes).map(function(t) { return t.id })).toEqual(['visited'])
  })

  it('respects limit', () => {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      a: { lastViewed: 3, viewCount: 1 },
      b: { lastViewed: 2, viewCount: 1 },
      c: { lastViewed: 1, viewCount: 1 },
    }))
    const tunes = {
      a: { id: 'a', name: 'A' },
      b: { id: 'b', name: 'B' },
      c: { id: 'c', name: 'C' },
    }
    expect(getRecentTunes(tunes, 2).map(function(t) { return t.id })).toEqual(['a', 'b'])
  })

  it('can return up to the expanded books-page limit', () => {
    const history = {}
    const tunes = {}
    for (var i = 0; i < 100; i++) {
      var id = 't' + i
      history[id] = { lastViewed: i + 1, viewCount: 1 }
      tunes[id] = { id: id, name: id }
    }
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify(history))
    expect(getRecentTunes(tunes, 100)).toHaveLength(100)
    expect(getRecentTunes(tunes, 100)[0].id).toBe('t99')
    expect(getRecentTunes(tunes, 100)[99].id).toBe('t0')
  })
})

describe('getRecentlyUpdatedTunes', () => {
  it('orders by lastUpdated', () => {
    const tunes = {
      older: { id: 'older', lastUpdated: 100 },
      newer: { id: 'newer', lastUpdated: 300 },
      mid: { id: 'mid', lastUpdated: 200 },
    }
    expect(getRecentlyUpdatedTunes(tunes).map(function(t) { return t.id })).toEqual(['newer', 'mid', 'older'])
  })
})

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
