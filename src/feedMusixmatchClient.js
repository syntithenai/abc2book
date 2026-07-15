import { fetchViaMediaProxy } from './mediaProxyClient'
import { factHash } from './feedFactExtractors'
import { upsertFeedItems } from './feedItemStore'
import { primaryArtist } from './tuneBibliographicUtils'

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

function itemsFromFacts(facts, tune) {
  const now = Date.now()
  const title = String(tune && tune.name || 'Tune')
  return (facts || []).map(function(f, idx) {
    const text = String(f.objectText || f.rawSnippet || '').trim()
    if (!text || text.length < 20) return null
    // Never turn lyric-only payloads into quizzes
    if (f.predicate === 'lyrics') return null
    const c = {
      predicate: f.predicate || 'bio_snippet',
      subjectName: title,
      objectText: text,
      tuneId: tune && tune.id != null ? String(tune.id) : null,
    }
    return {
      id: makeId('mx'),
      type: 'dyk',
      tuneId: c.tuneId,
      artist: primaryArtist(tune),
      headline: 'Artist note: ' + title,
      teaser: text.slice(0, 140) + (text.length > 140 ? '…' : ''),
      body: text,
      imageUrl: '',
      source: f.source || 'musixmatch',
      sourceUrl: String(f.sourceUrl || ''),
      factHash: factHash(c) + '_mx_' + idx,
      generation: f.source || 'musixmatch',
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

/**
 * Phase 9: resolver Musixmatch/Genius meta enrichment. Soft-fail if unavailable.
 */
export async function runFeedMusixmatchEnrichment(options) {
  const opts = options || {}
  const tunes = opts.tunes || {}
  const viewIds = Array.isArray(opts.viewIds) ? opts.viewIds : []
  const onItems = typeof opts.onItems === 'function' ? opts.onItems : function() {}
  const accessToken = opts.token || null

  for (var i = 0; i < Math.min(viewIds.length, 3); i++) {
    const tune = tunes[viewIds[i]]
    if (!tune || !tune.name) continue
    try {
      const res = await fetchViaMediaProxy('/enrich-feed-sources', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          title: tune.name,
          artist: primaryArtist(tune),
        }),
        timeoutMs: 30000,
      })
      if (!res || !res.ok) continue
      const body = await res.json()
      const facts = body && Array.isArray(body.facts) ? body.facts : []
      const items = itemsFromFacts(facts, tune)
      if (items.length) {
        upsertFeedItems(items)
        onItems(items)
      }
    } catch (e) {
      // soft-fail
    }
  }
}
