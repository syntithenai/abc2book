export const PRACTICE_RECENT_HISTORY_STORAGE_KEY = 'bookstorage_practice_recent_tunes'
export const PRACTICE_RECENT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function normalizeHistory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const next = {}
  Object.keys(raw).forEach(function(tuneId) {
    const id = tuneId != null ? String(tuneId).trim() : ''
    const ts = Number(raw[tuneId])
    if (!id || !Number.isFinite(ts) || ts <= 0) return
    next[id] = ts
  })
  return next
}

export function prunePracticeRecentHistory(history, now, cooldownMs) {
  const current = normalizeHistory(history)
  const cutoff = (now != null ? now : Date.now()) - (cooldownMs != null ? cooldownMs : PRACTICE_RECENT_COOLDOWN_MS)
  const next = {}
  Object.keys(current).forEach(function(tuneId) {
    if (current[tuneId] >= cutoff) {
      next[tuneId] = current[tuneId]
    }
  })
  return next
}

export function loadPracticeRecentHistory(options) {
  const opts = options || {}
  try {
    const raw = localStorage.getItem(PRACTICE_RECENT_HISTORY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = normalizeHistory(JSON.parse(raw))
    return prunePracticeRecentHistory(parsed, opts.now, opts.cooldownMs)
  } catch (e) {
    return {}
  }
}

export function savePracticeRecentHistory(history) {
  const next = normalizeHistory(history)
  try {
    localStorage.setItem(PRACTICE_RECENT_HISTORY_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore quota errors
  }
  return next
}

export function recordPracticedTune(tuneId, options) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  if (!id) return loadPracticeRecentHistory(options)
  const opts = options || {}
  const now = opts.now != null ? opts.now : Date.now()
  const history = loadPracticeRecentHistory({ now: now, cooldownMs: opts.cooldownMs })
  history[id] = now
  return savePracticeRecentHistory(history)
}

export function getPracticeRecentTimestamp(tuneId, options) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  if (!id) return 0
  const history = options && options.recentPracticeHistory != null
    ? normalizeHistory(options.recentPracticeHistory)
    : loadPracticeRecentHistory(options)
  const ts = history[id]
  return Number.isFinite(ts) ? ts : 0
}

export function wasPracticedRecently(tuneId, options) {
  const id = tuneId != null ? String(tuneId).trim() : ''
  if (!id) return false
  const opts = options || {}
  const now = opts.now != null ? opts.now : Date.now()
  const cooldownMs = opts.cooldownMs != null ? opts.cooldownMs : PRACTICE_RECENT_COOLDOWN_MS
  const ts = getPracticeRecentTimestamp(id, opts)
  if (!ts) return false
  return now - ts < cooldownMs
}

export function filterOutRecentlyPracticedTunes(candidates, options) {
  const list = Array.isArray(candidates) ? candidates : []
  return list.filter(function(tune) {
    return !wasPracticedRecently(tune && tune.id, options)
  })
}
