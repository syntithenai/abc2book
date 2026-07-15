/**
 * Tune view / play history for the Knowledge Feed.
 * Tracks opens separately from lastUpdated (edit sync).
 */

export const TUNE_VIEW_HISTORY_STORAGE_KEY = 'bookstorage_tune_view_history'
export const TUNE_VIEW_HISTORY_MAX = 100

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const lastViewed = Number(raw.lastViewed) || 0
  const viewCount = Number(raw.viewCount) || 0
  const lastPlayed = raw.lastPlayed == null || raw.lastPlayed === ''
    ? null
    : (Number(raw.lastPlayed) || null)
  if (lastViewed <= 0 && !lastPlayed) return null
  return {
    lastViewed: lastViewed > 0 ? lastViewed : (lastPlayed || 0),
    viewCount: viewCount > 0 ? viewCount : 1,
    lastPlayed: lastPlayed && lastPlayed > 0 ? lastPlayed : null,
  }
}

function readMap() {
  try {
    const raw = localStorage.getItem(TUNE_VIEW_HISTORY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const next = {}
    Object.keys(parsed).forEach(function(tuneId) {
      const id = tuneId != null ? String(tuneId).trim() : ''
      if (!id) return
      const entry = normalizeEntry(parsed[tuneId])
      if (entry) next[id] = entry
    })
    return next
  } catch (e) {
    return {}
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify(map || {}))
  } catch (e) {
    // ignore quota errors
  }
  return map || {}
}

function trimMap(map) {
  const ids = Object.keys(map || {})
  if (ids.length <= TUNE_VIEW_HISTORY_MAX) return map || {}
  ids.sort(function(a, b) {
    return (map[b].lastViewed || 0) - (map[a].lastViewed || 0)
  })
  const next = {}
  ids.slice(0, TUNE_VIEW_HISTORY_MAX).forEach(function(id) {
    next[id] = map[id]
  })
  return next
}

export function getViewHistoryMap() {
  return readMap()
}

export function getRecentViewedTuneIds(limit) {
  const max = typeof limit === 'number' && limit > 0 ? limit : 40
  const map = readMap()
  return Object.keys(map)
    .sort(function(a, b) {
      return (map[b].lastViewed || 0) - (map[a].lastViewed || 0)
    })
    .slice(0, max)
}

export function recordTuneView(tuneId, options) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  if (!id) return readMap()
  const opts = options || {}
  const now = opts.now != null ? opts.now : Date.now()
  const map = readMap()
  const prev = map[id] || { lastViewed: 0, viewCount: 0, lastPlayed: null }
  map[id] = {
    lastViewed: now,
    viewCount: (Number(prev.viewCount) || 0) + 1,
    lastPlayed: prev.lastPlayed != null ? prev.lastPlayed : null,
  }
  return writeMap(trimMap(map))
}

export function recordTunePlay(tuneId, options) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  if (!id) return readMap()
  const opts = options || {}
  const now = opts.now != null ? opts.now : Date.now()
  const map = readMap()
  const prev = map[id] || { lastViewed: 0, viewCount: 0, lastPlayed: null }
  map[id] = {
    lastViewed: prev.lastViewed > 0 ? prev.lastViewed : now,
    viewCount: prev.viewCount > 0 ? prev.viewCount : 1,
    lastPlayed: now,
  }
  return writeMap(trimMap(map))
}
