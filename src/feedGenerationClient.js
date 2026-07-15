import { fetchViaMediaProxy } from './mediaProxyClient'
import { extractFactsFromTune } from './feedFactExtractors'
import { upsertFeedItems } from './feedItemStore'
import { primaryArtist } from './tuneBibliographicUtils'

const AI_SESSION_KEY = 'bookstorage_feed_ai_ran'

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

function factsPayload(facts) {
  return (facts || []).slice(0, 12).map(function(f) {
    return {
      predicate: f.predicate,
      subjectName: f.subjectName,
      objectText: f.objectText,
      objectYear: f.objectYear,
      source: f.source,
      sourceUrl: f.sourceUrl,
      rawSnippet: f.rawSnippet,
    }
  })
}

function normalizeArticleItems(body, tune) {
  const list = body && Array.isArray(body.items) ? body.items : []
  const now = Date.now()
  return list.map(function(raw, idx) {
    const headline = String(raw.headline || '').trim()
    const teaser = String(raw.teaser || raw.body || '').trim()
    const articleBody = String(raw.body || teaser).trim()
    if (!headline || !articleBody) return null
    return {
      id: makeId('ai'),
      type: 'news',
      tuneId: tune && tune.id != null ? String(tune.id) : null,
      artist: primaryArtist(tune),
      headline: headline,
      teaser: teaser.slice(0, 160),
      body: articleBody,
      imageUrl: String(raw.imageUrl || ''),
      source: 'ai',
      sourceUrl: String(raw.sourceUrl || ''),
      factHash: 'ai_news_' + (tune && tune.id) + '_' + idx + '_' + headline.slice(0, 24),
      generation: 'ai',
      quiz: null,
      lessonId: null,
      createdAt: now,
      status: 'queued',
      lastShownAt: null,
      dismissedAt: null,
      expandedAt: null,
      answeredAt: null,
      reuseEligible: false,
      srsDueAt: null,
      isNew: true,
      attemptCount: 0,
    }
  }).filter(Boolean)
}

function normalizeQuizItems(body, tune) {
  const list = body && Array.isArray(body.items) ? body.items : []
  const now = Date.now()
  return list.map(function(raw, idx) {
    const prompt = String(raw.prompt || '').trim()
    const choices = Array.isArray(raw.choices) ? raw.choices : []
    if (!prompt || choices.length < 2) return null
    return {
      id: makeId('aiq'),
      type: 'quiz',
      tuneId: tune && tune.id != null ? String(tune.id) : null,
      artist: primaryArtist(tune),
      headline: 'Quiz: ' + String(tune && tune.name || 'your tune'),
      teaser: prompt,
      body: '',
      imageUrl: '',
      source: 'ai',
      sourceUrl: String(raw.sourceUrl || ''),
      factHash: 'ai_quiz_' + (tune && tune.id) + '_' + idx,
      generation: 'ai',
      quiz: {
        id: 'aiq_' + idx,
        type: 'mcq',
        prompt: prompt,
        choices: choices,
        explain: String(raw.explain || 'Based on available source facts.'),
        difficulty: Number(raw.difficulty) || 2,
      },
      lessonId: null,
      createdAt: now,
      status: 'queued',
      lastShownAt: null,
      dismissedAt: null,
      expandedAt: null,
      answeredAt: null,
      reuseEligible: false,
      srsDueAt: null,
      isNew: true,
      attemptCount: 0,
    }
  }).filter(Boolean)
}

/**
 * Background AI generation. Never blocks; soft-fails if resolver/llm unavailable.
 */
export async function runFeedAiGeneration(options) {
  const opts = options || {}
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(AI_SESSION_KEY) === '1') {
      return
    }
  } catch (e) {
    // ignore
  }

  const tunes = opts.tunes || {}
  const viewIds = Array.isArray(opts.viewIds) ? opts.viewIds : []
  const onItems = typeof opts.onItems === 'function' ? opts.onItems : function() {}
  const accessToken = opts.token || null

  for (var i = 0; i < Math.min(viewIds.length, 3); i++) {
    const tune = tunes[viewIds[i]]
    if (!tune || !tune.name) continue
    const facts = extractFactsFromTune(tune)
    const payload = {
      title: tune.name,
      artist: primaryArtist(tune),
      backgroundInfo: tune.backgroundInfo || '',
      facts: factsPayload(facts),
    }
    try {
      const articleRes = await fetchViaMediaProxy('/generate-feed-articles', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 45000,
      })
      if (articleRes && articleRes.ok) {
        const body = await articleRes.json()
        const items = normalizeArticleItems(body, tune)
        if (items.length) {
          upsertFeedItems(items)
          onItems(items)
        }
      }
    } catch (e) {
      // soft-fail
    }
    try {
      const quizRes = await fetchViaMediaProxy('/generate-feed-quizzes', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 45000,
      })
      if (quizRes && quizRes.ok) {
        const body = await quizRes.json()
        const items = normalizeQuizItems(body, tune)
        if (items.length) {
          upsertFeedItems(items)
          onItems(items)
        }
      }
    } catch (e) {
      // soft-fail
    }
  }

  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AI_SESSION_KEY, '1')
  } catch (e) {
    // ignore
  }
}
