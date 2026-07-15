import {
  FEED_ITEMS_STORAGE_KEY,
  FEED_DISMISS_COOLDOWN_MS,
  upsertFeedItems,
  loadFeedItems,
  markShown,
  markDismissed,
  markExpanded,
  markAnswered,
  prepareNavRefreshEligibility,
  getEligibleForStream,
  saveFeedItems,
} from './feedItemStore'

function baseItem(overrides) {
  return Object.assign({
    id: 'item-1',
    type: 'dyk',
    tuneId: 't1',
    artist: '',
    headline: 'H',
    teaser: 'T',
    body: 'B',
    imageUrl: '',
    source: 'local',
    sourceUrl: '',
    factHash: 'hash-1',
    generation: 'local',
    quiz: null,
    lessonId: null,
    createdAt: 1000,
    status: 'queued',
    lastShownAt: null,
    dismissedAt: null,
    expandedAt: null,
    answeredAt: null,
    reuseEligible: false,
    srsDueAt: null,
    isNew: false,
    attemptCount: 0,
  }, overrides || {})
}

describe('feedItemStore', function() {
  beforeEach(function() {
    localStorage.removeItem(FEED_ITEMS_STORAGE_KEY)
  })

  it('upserts by factHash and dedupes', function() {
    upsertFeedItems([baseItem({ id: 'a', factHash: 'f1', generation: 'local' })])
    upsertFeedItems([baseItem({ id: 'b', factHash: 'f1', generation: 'ai', headline: 'AI' })])
    const items = loadFeedItems()
    expect(items.length).toBe(1)
    expect(items[0].generation).toBe('ai')
    expect(items[0].headline).toBe('AI')
  })

  it('marks expanded items not reuseEligible after nav refresh', function() {
    saveFeedItems([baseItem({ id: 'x', status: 'shown', lastShownAt: 1000 })])
    markExpanded('x', { now: 2000 })
    prepareNavRefreshEligibility({ now: 3000 })
    const item = loadFeedItems().find(function(i) { return i.id === 'x' })
    expect(item.reuseEligible).toBe(false)
  })

  it('marks shown-only items reuseEligible after nav refresh', function() {
    saveFeedItems([baseItem({ id: 'y', status: 'shown', lastShownAt: 1000 })])
    prepareNavRefreshEligibility({ now: 2000 })
    const item = loadFeedItems().find(function(i) { return i.id === 'y' })
    expect(item.reuseEligible).toBe(true)
    const eligible = getEligibleForStream({ now: 2000 })
    expect(eligible.some(function(i) { return i.id === 'y' })).toBe(true)
  })

  it('excludes recent dismissals from stream', function() {
    saveFeedItems([baseItem({ id: 'd', status: 'dismissed', dismissedAt: 5000, reuseEligible: false })])
    const eligible = getEligibleForStream({ now: 5000 + FEED_DISMISS_COOLDOWN_MS - 1000 })
    expect(eligible.some(function(i) { return i.id === 'd' })).toBe(false)
  })

  it('sets SRS after wrong answer', function() {
    saveFeedItems([baseItem({ id: 'q', type: 'quiz' })])
    markShown('q', { now: 1000 })
    markAnswered('q', { correct: false, now: 2000 })
    const item = loadFeedItems().find(function(i) { return i.id === 'q' })
    expect(item.srsDueAt).toBe(2000 + 1 * 24 * 60 * 60 * 1000)
    expect(item.attemptCount).toBe(1)
  })
})
