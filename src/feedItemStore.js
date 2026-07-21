/**
 * Persisted Knowledge Feed item pool + lifecycle.
 */

export const FEED_ITEMS_STORAGE_KEY = 'bookstorage_feed_items'
export const FEED_ITEMS_VERSION_KEY = 'bookstorage_feed_items_version'
/** Bump to wipe the persisted pool once (dev/debug resets, schema changes). */
export const FEED_ITEMS_SCHEMA_VERSION = 14
export const FEED_ITEMS_MAX = 200
export const FEED_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
export const FEED_ENGAGED_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
export const FEED_SRS_STEPS_MS = [
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
]
export const FEED_SRS_CORRECT_MS = 14 * 24 * 60 * 60 * 1000

const GENERATION_RANK = {
  local: 1,
  content: 2,
  wiki: 3,
  wikipedia: 3,
  wikidata: 3,
  musicbrainz: 4,
  musixmatch: 4,
  genius: 4,
  ai: 5,
}

/** Dull cards (MB “Release note” albums, old boilerplate “Artist note”) — never show or keep. */
export function isLowValueFeedItem(item) {
  if (!item || typeof item !== 'object') return true
  if (item.type === 'album') return true
  if (item.generation === 'musicbrainz' || item.source === 'musicbrainz') return true
  const headline = String(item.headline || '')
  if (/^Release note:/i.test(headline)) return true
  if (/^Artist note:/i.test(headline)) return true
  // Invented “new song / just released” AI blurbs for historical repertoire.
  if ((item.generation === 'ai' || item.source === 'ai')
      && /\b(releases?\s+(a\s+)?new(\s+song|\s+single)?|new\s+song\b|just\s+(released|dropped)|out\s+now\b)/i.test(headline)) {
    return true
  }
  const body = String(item.body || item.teaser || '')
  if (/MusicBrainz first-release|appears related to\s+[“"]/i.test(body)) return true
  // Thin AI “Notes on …” name lists with no context
  if ((item.generation === 'ai' || item.source === 'ai' || item.type === 'news')
      && (item.type === 'news' || item.type === 'dyk')) {
    if (/^Notes on\b/i.test(headline) && body.length < 200) return true
    const lines = body.split(/[\n/;|]+/).map(function(ln) { return ln.trim() }).filter(Boolean)
    if (lines.length >= 2) {
      const nameLine = /^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,4}$/
      var nameLike = 0
      lines.forEach(function(ln) { if (nameLine.test(ln)) nameLike++ })
      if (nameLike >= Math.max(2, Math.floor(0.6 * lines.length))
          && !/\b(wrote|written|recorded|popular|known|composed|version|origin)\b/i.test(body)) {
        return true
      }
    }
  }
  // Legacy thin quiz cards: pre-bundle single-prompt shape or fewer than 3 questions.
  if (item.type === 'quiz' || item.type === 'theory_quiz') {
    const questions = item.quiz && Array.isArray(item.quiz.questions) ? item.quiz.questions : null
    if (!questions || questions.length < 3) return true
  }
  return false
}

export function scrubLowValueFeedItems(items) {
  const list = Array.isArray(items) ? items : readArray()
  const kept = list.filter(function(item) { return !isLowValueFeedItem(item) })
  if (kept.length !== list.length) {
    return saveFeedItems(kept)
  }
  return kept
}

function readArray() {
  try {
    const raw = localStorage.getItem(FEED_ITEMS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function writeArray(items) {
  try {
    localStorage.setItem(FEED_ITEMS_STORAGE_KEY, JSON.stringify(items || []))
  } catch (e) {
    // ignore quota
  }
  return items || []
}

function isEngaged(item) {
  return !!(item && (item.expandedAt || item.answeredAt || item.dismissedAt))
}

export function clearFeedItems() {
  return writeArray([])
}

/**
 * One-shot wipe when FEED_ITEMS_SCHEMA_VERSION increases so stale cards
 * from earlier feed iterations do not keep resurfacing.
 */
export function ensureFeedItemsSchema() {
  try {
    const current = Number(localStorage.getItem(FEED_ITEMS_VERSION_KEY) || 0)
    if (current >= FEED_ITEMS_SCHEMA_VERSION) return false
    clearFeedItems()
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('bookstorage_feed_ai_ran')
      }
    } catch (e) {
      // ignore
    }
    localStorage.setItem(FEED_ITEMS_VERSION_KEY, String(FEED_ITEMS_SCHEMA_VERSION))
    return true
  } catch (e) {
    return false
  }
}

export function loadFeedItems() {
  ensureFeedItemsSchema()
  return scrubLowValueFeedItems(readArray())
}

export function saveFeedItems(items) {
  return writeArray(Array.isArray(items) ? items : [])
}

export function pruneFeedItems(items, now) {
  const list = Array.isArray(items) ? items.slice() : []
  if (list.length <= FEED_ITEMS_MAX) return list
  const current = now != null ? now : Date.now()
  list.sort(function(a, b) {
    const aKeep = (a && a.srsDueAt && a.srsDueAt <= current) || (a && a.isNew) ? 1 : 0
    const bKeep = (b && b.srsDueAt && b.srsDueAt <= current) || (b && b.isNew) ? 1 : 0
    if (aKeep !== bKeep) return bKeep - aKeep
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
  return list.slice(0, FEED_ITEMS_MAX)
}

export function upsertFeedItems(newItems) {
  const incoming = Array.isArray(newItems) ? newItems : []
  if (!incoming.length) return loadFeedItems()
  const current = loadFeedItems()
  const byKey = {}
  current.forEach(function(item) {
    if (!item) return
    const key = item.factHash || item.id
    if (key) byKey[key] = item
  })
  incoming.forEach(function(item) {
    if (!item || typeof item !== 'object') return
    if (isLowValueFeedItem(item)) return
    const key = item.factHash || item.id
    if (!key) return
    const prev = byKey[key]
    if (!prev) {
      byKey[key] = item
      return
    }
    if (isLowValueFeedItem(prev)) {
      byKey[key] = item
      return
    }
    const prevRank = GENERATION_RANK[prev.generation] || 0
    const nextRank = GENERATION_RANK[item.generation] || 0
    if (nextRank >= prevRank) {
      byKey[key] = Object.assign({}, prev, item, {
        status: prev.status === 'dismissed' ? prev.status : (item.status || prev.status),
        dismissedAt: prev.dismissedAt,
        expandedAt: prev.expandedAt || item.expandedAt || null,
        answeredAt: prev.answeredAt || item.answeredAt || null,
        attemptCount: prev.attemptCount || item.attemptCount || 0,
      })
    }
  })
  const merged = Object.keys(byKey).map(function(k) { return byKey[k] })
    .filter(function(item) { return !isLowValueFeedItem(item) })
  return saveFeedItems(pruneFeedItems(merged))
}

function updateItem(id, mutator) {
  const items = loadFeedItems()
  let found = false
  const next = items.map(function(item) {
    if (!item || item.id !== id) return item
    found = true
    return mutator(Object.assign({}, item))
  })
  if (!found) return items
  return saveFeedItems(next)
}

export function markShown(id, options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  return updateItem(id, function(item) {
    item.status = item.status === 'queued' ? 'shown' : item.status
    item.lastShownAt = now
    return item
  })
}

export function markDismissed(id, options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  return updateItem(id, function(item) {
    item.status = 'dismissed'
    item.dismissedAt = now
    item.reuseEligible = false
    item.isNew = false
    return item
  })
}

export function markExpanded(id, options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  return updateItem(id, function(item) {
    item.status = 'expanded'
    item.expandedAt = now
    item.reuseEligible = false
    item.isNew = false
    return item
  })
}

export function markAnswered(id, options) {
  const opts = options || {}
  const now = opts.now != null ? opts.now : Date.now()
  const correct = opts.correct === true
  return updateItem(id, function(item) {
    item.status = 'answered'
    item.answeredAt = now
    item.reuseEligible = false
    item.isNew = false
    const attempts = (Number(item.attemptCount) || 0) + (correct ? 0 : 1)
    item.attemptCount = correct ? (Number(item.attemptCount) || 0) : attempts
    if (correct) {
      item.srsDueAt = now + FEED_SRS_CORRECT_MS
    } else {
      const step = Math.min(item.attemptCount - 1, FEED_SRS_STEPS_MS.length - 1)
      item.srsDueAt = now + FEED_SRS_STEPS_MS[Math.max(0, step)]
    }
    return item
  })
}

/** Nav-refresh only: shown but never engaged → reusable. */
export function prepareNavRefreshEligibility(options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  const items = loadFeedItems()
  const next = items.map(function(item) {
    if (!item) return item
    const copy = Object.assign({}, item)
    if (isEngaged(copy)) {
      copy.reuseEligible = false
      return copy
    }
    if (copy.status === 'shown' || copy.lastShownAt) {
      copy.reuseEligible = true
    }
    return copy
  })
  return saveFeedItems(next)
}

export function getEligibleForStream(options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  const items = loadFeedItems()
  const queued = []
  const reusable = []
  const due = []
  items.forEach(function(item) {
    if (!item || !item.id) return
    if (item.dismissedAt && (now - item.dismissedAt) < FEED_DISMISS_COOLDOWN_MS) return
    if (isEngaged(item)) {
      if (item.srsDueAt && item.srsDueAt <= now) {
        due.push(item)
        return
      }
      const engagedAt = item.answeredAt || item.expandedAt || item.dismissedAt || 0
      if (engagedAt && (now - engagedAt) >= FEED_ENGAGED_COOLDOWN_MS && !item.dismissedAt) {
        due.push(item)
      }
      return
    }
    if (item.status === 'queued' && !item.lastShownAt) {
      queued.push(item)
      return
    }
    if (item.reuseEligible) {
      reusable.push(item)
      return
    }
    if (item.srsDueAt && item.srsDueAt <= now) {
      due.push(item)
    }
  })
  function byCreated(a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0)
  }
  return queued.sort(byCreated).concat(reusable.sort(byCreated)).concat(due.sort(byCreated))
}
