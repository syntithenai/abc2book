import {
  TUNE_VIEW_HISTORY_STORAGE_KEY,
  TUNE_VIEW_HISTORY_MAX,
  recordTuneView,
  recordTunePlay,
  getRecentViewedTuneIds,
  getViewHistoryMap,
} from './tuneViewHistoryStore'

describe('tuneViewHistoryStore', function() {
  beforeEach(function() {
    localStorage.removeItem(TUNE_VIEW_HISTORY_STORAGE_KEY)
  })

  it('records views and returns newest first', function() {
    recordTuneView('a', { now: 1000 })
    recordTuneView('b', { now: 2000 })
    recordTuneView('a', { now: 3000 })
    expect(getRecentViewedTuneIds(10)).toEqual(['a', 'b'])
    const map = getViewHistoryMap()
    expect(map.a.viewCount).toBe(2)
    expect(map.a.lastViewed).toBe(3000)
  })

  it('records play timestamps', function() {
    recordTuneView('x', { now: 1000 })
    recordTunePlay('x', { now: 1500 })
    expect(getViewHistoryMap().x.lastPlayed).toBe(1500)
    expect(getViewHistoryMap().x.lastViewed).toBe(1000)
  })

  it('trims to max ids keeping newest', function() {
    for (var i = 0; i < TUNE_VIEW_HISTORY_MAX + 5; i++) {
      recordTuneView('t' + i, { now: i + 1 })
    }
    const ids = getRecentViewedTuneIds(1000)
    expect(ids.length).toBe(TUNE_VIEW_HISTORY_MAX)
    expect(ids[0]).toBe('t' + (TUNE_VIEW_HISTORY_MAX + 4))
    expect(ids.indexOf('t0')).toBe(-1)
  })
})
