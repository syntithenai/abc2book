import {
  FEED_ITEMS_STORAGE_KEY,
  FEED_ITEMS_VERSION_KEY,
  FEED_ITEMS_SCHEMA_VERSION,
  FEED_DISMISS_COOLDOWN_MS,
  upsertFeedItems,
  loadFeedItems,
  clearFeedItems,
  ensureFeedItemsSchema,
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
    localStorage.setItem(FEED_ITEMS_VERSION_KEY, String(FEED_ITEMS_SCHEMA_VERSION))
  })

  it('ensureFeedItemsSchema clears the pool when version is behind', function() {
    saveFeedItems([baseItem({ id: 'stale' })])
    localStorage.setItem(FEED_ITEMS_VERSION_KEY, '0')
    expect(ensureFeedItemsSchema()).toBe(true)
    expect(loadFeedItems()).toEqual([])
    expect(Number(localStorage.getItem(FEED_ITEMS_VERSION_KEY))).toBe(FEED_ITEMS_SCHEMA_VERSION)
  })

  it('clearFeedItems empties storage', function() {
    saveFeedItems([baseItem({ id: 'x' })])
    clearFeedItems()
    expect(loadFeedItems()).toEqual([])
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

  it('scrubs MusicBrainz release-note album cards from storage', function() {
    saveFeedItems([
      baseItem({ id: 'ok', factHash: 'ok' }),
      baseItem({
        id: 'mb1',
        type: 'album',
        factHash: 'mb1',
        generation: 'musicbrainz',
        source: 'musicbrainz',
        headline: 'Release note: Wild Rover',
        body: 'Wild Rover appears related to “Some Album” (first release 1963).',
      }),
    ])
    const items = loadFeedItems()
    expect(items.length).toBe(1)
    expect(items[0].id).toBe('ok')
    expect(getEligibleForStream().some(function(i) { return i.id === 'mb1' })).toBe(false)
  })

  it('rejects low-value album cards on upsert', function() {
    upsertFeedItems([
      baseItem({
        id: 'mb2',
        type: 'album',
        factHash: 'mb2',
        headline: 'Release note: X',
        generation: 'musicbrainz',
        source: 'musicbrainz',
      }),
    ])
    expect(loadFeedItems().length).toBe(0)
  })
})
