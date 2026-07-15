import { FEED_PROGRESS_STORAGE_KEY, getFeedProgress, incrementLearned } from './feedProgressStore'

describe('feedProgressStore', function() {
  beforeEach(function() {
    localStorage.removeItem(FEED_PROGRESS_STORAGE_KEY)
  })

  it('increments learned count same day', function() {
    const a = incrementLearned({ now: Date.parse('2026-07-15T12:00:00') })
    expect(a.learnedCount).toBe(1)
    expect(a.streak).toBeGreaterThanOrEqual(1)
    const b = incrementLearned({ now: Date.parse('2026-07-15T18:00:00') })
    expect(b.learnedCount).toBe(2)
  })

  it('resets daily count on new day', function() {
    incrementLearned({ now: Date.parse('2026-07-14T12:00:00') })
    const next = getFeedProgress({ now: Date.parse('2026-07-15T12:00:00') })
    expect(next.learnedCount).toBe(0)
  })
})
