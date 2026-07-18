'use strict'

const FEED_ITEMS_KEY = 'bookstorage_feed_items'
const FEED_ITEMS_VERSION_KEY = 'bookstorage_feed_items_version'
const PRACTICE_KEY = 'bookstorage_practice_settings'
const VIEW_KEY = 'bookstorage_tune_view_history'

function sampleItems(count) {
  const items = []
  for (var i = 0; i < count; i++) {
    items.push({
      id: 'seed_' + i,
      type: i % 5 === 0 ? 'theory_lesson' : 'dyk',
      tuneId: 'tune_' + (i % 3),
      artist: 'Artist',
      headline: 'Seed card ' + i,
      teaser: 'Teaser ' + i,
      body: 'Body text for seed card ' + i + '. More detail here for expand.\n\n'
        + 'Second paragraph with background context that should remain visible when expanded. '
        + 'Third paragraph continues the story so the expand pane is clearly longer than the teaser.',
      imageUrl: '',
      source: 'local',
      sourceUrl: '',
      factHash: 'seed_hash_' + i,
      generation: 'local',
      quiz: i === 1 ? {
        id: 'seed_q1',
        title: 'Seed quiz',
        questions: [
          {
            id: 'seed_q1_a',
            prompt: '2+2?',
            choices: [
              { id: 'a', text: '4', correct: true },
              { id: 'b', text: '3' },
              { id: 'c', text: '5' },
              { id: 'd', text: '22' },
            ],
            explain: 'Basic arithmetic: two plus two is four.',
            difficulty: 0,
          },
          {
            id: 'seed_q1_b',
            prompt: 'Capital of France?',
            choices: [
              { id: 'a', text: 'Paris', correct: true },
              { id: 'b', text: 'Lyon' },
              { id: 'c', text: 'Nice' },
              { id: 'd', text: 'Lille' },
            ],
            explain: 'Paris is the capital.',
            difficulty: 0,
          },
        ],
      } : null,
      lessonId: null,
      createdAt: Date.now() - i,
      status: 'queued',
      lastShownAt: null,
      dismissedAt: null,
      expandedAt: null,
      answeredAt: null,
      reuseEligible: false,
      srsDueAt: null,
      isNew: false,
      attemptCount: 0,
    })
  }
  return items
}

async function seedFeedStorage(page, options) {
  const opts = options || {}
  await page.evaluate(function(payload) {
    localStorage.setItem(payload.FEED_ITEMS_KEY, JSON.stringify(payload.items))
    localStorage.setItem(payload.FEED_ITEMS_VERSION_KEY, String(payload.version))
    localStorage.setItem(payload.PRACTICE_KEY, JSON.stringify(payload.practice))
    localStorage.setItem(payload.VIEW_KEY, JSON.stringify(payload.views))
  }, {
    FEED_ITEMS_KEY: FEED_ITEMS_KEY,
    FEED_ITEMS_VERSION_KEY: FEED_ITEMS_VERSION_KEY,
    version: 8,
    PRACTICE_KEY: PRACTICE_KEY,
    VIEW_KEY: VIEW_KEY,
    items: opts.items || sampleItems(opts.count || 12),
    practice: opts.practice || { instrument: 'mandolin', totalMinutes: 10, includeWarmups: true, skillLevel: 5 },
    views: opts.views || { tune_0: { lastViewed: Date.now(), viewCount: 1, lastPlayed: null } },
  })
}

async function openFeed(page, base) {
  await page.goto(base.replace(/\/$/, '') + '/#/feed', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('[data-testid="feed-page"]', { timeout: 30000 })
}

module.exports = {
  FEED_ITEMS_KEY: FEED_ITEMS_KEY,
  sampleItems: sampleItems,
  seedFeedStorage: seedFeedStorage,
  openFeed: openFeed,
}
