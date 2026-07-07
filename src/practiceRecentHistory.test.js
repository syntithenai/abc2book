import {
  PRACTICE_RECENT_COOLDOWN_MS,
  PRACTICE_RECENT_HISTORY_STORAGE_KEY,
  filterOutRecentlyPracticedTunes,
  loadPracticeRecentHistory,
  prunePracticeRecentHistory,
  recordPracticedTune,
  wasPracticedRecently,
} from './practiceRecentHistory'

describe('practiceRecentHistory', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  it('records and detects recently practiced tunes', function() {
    const now = 1_700_000_000_000
    recordPracticedTune('tune-a', { now: now })
    expect(wasPracticedRecently('tune-a', { now: now + 1000 })).toBe(true)
    expect(wasPracticedRecently('tune-a', { now: now + PRACTICE_RECENT_COOLDOWN_MS })).toBe(false)
    expect(wasPracticedRecently('tune-b', { now: now + 1000 })).toBe(false)
  })

  it('prunes entries older than the cooldown window', function() {
    const now = 1_700_000_000_000
    const history = {
      fresh: now - 1000,
      stale: now - PRACTICE_RECENT_COOLDOWN_MS - 1,
    }
    const pruned = prunePracticeRecentHistory(history, now)
    expect(pruned.fresh).toBe(history.fresh)
    expect(pruned.stale).toBeUndefined()
  })

  it('loads and saves history through localStorage', function() {
    const now = 1_700_000_000_000
    recordPracticedTune('t1', { now: now })
    recordPracticedTune('t2', { now: now - 1000 })
    const loaded = loadPracticeRecentHistory({ now: now })
    expect(loaded.t1).toBe(now)
    expect(loaded.t2).toBe(now - 1000)
    expect(localStorage.getItem(PRACTICE_RECENT_HISTORY_STORAGE_KEY)).toContain('"t1"')
  })

  it('filters recently practiced tunes from candidate lists', function() {
    const now = 1_700_000_000_000
    const candidates = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]
    const filtered = filterOutRecentlyPracticedTunes(candidates, {
      now: now,
      recentPracticeHistory: { a: now - 1000 },
    })
    expect(filtered.map(function(t) { return t.id })).toEqual(['b'])
  })
})
