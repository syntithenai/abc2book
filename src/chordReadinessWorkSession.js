/**
 * Persists pending tune IDs between chord-readiness tag/apply batches so later
 * batches do not rescan the entire book. Supports multiple session keys (tag vs apply).
 */

const sessions = new Map()

export function buildWorkSessionKey(options, mode) {
  const opts = options || {}
  return [
    mode || '',
    opts.book || '',
    opts.dryRun ? 'dry' : 'live',
    opts.includeMelody ? 'melody' : '',
    opts.alwaysTag ? 'alwaystag' : '',
    Array.isArray(opts.fixes) ? opts.fixes.join(',') : '',
  ].join('|')
}

function ensureSession(key) {
  if (!sessions.has(key)) {
    sessions.set(key, [])
  }
  return sessions.get(key)
}

export function getWorkSession(key) {
  return {
    key: key,
    pendingIds: ensureSession(key),
  }
}

export function peekWorkSessionPendingCount(key) {
  if (!sessions.has(key)) return null
  return sessions.get(key).length
}

export function loadWorkSession(saved) {
  sessions.clear()
  if (!saved || typeof saved !== 'object') return
  if (saved.sessions && typeof saved.sessions === 'object') {
    Object.keys(saved.sessions).forEach(function(key) {
      const ids = saved.sessions[key]
      if (Array.isArray(ids)) sessions.set(key, ids.slice())
    })
    return
  }
  if (saved.key && Array.isArray(saved.pendingIds)) {
    sessions.set(saved.key, saved.pendingIds.slice())
  }
}

export function exportWorkSession() {
  const out = Object.create(null)
  sessions.forEach(function(ids, key) {
    out[key] = ids.slice()
  })
  return { sessions: out }
}

export function clearWorkSession() {
  sessions.clear()
}

export function setWorkSessionPendingIds(key, pendingIds) {
  sessions.set(key, Array.isArray(pendingIds) ? pendingIds.slice() : [])
}

export function pruneWorkSessionIds(key, tuneIds) {
  if (!sessions.has(key)) return
  const remove = new Set(Array.isArray(tuneIds) ? tuneIds : [])
  if (!remove.size) return
  const next = sessions.get(key).filter(function(id) { return !remove.has(id) })
  sessions.set(key, next)
}

export function consumeWorkSessionBatch(key, batchSize, consume) {
  const pendingIds = ensureSession(key)
  const totalBefore = pendingIds.length
  const limit = batchSize > 0 ? Math.min(batchSize, totalBefore) : totalBefore
  const batchIds = pendingIds.slice(0, limit)
  if (consume) {
    sessions.set(key, pendingIds.slice(batchIds.length))
  }
  return {
    batchIds: batchIds,
    remaining: consume ? sessions.get(key).length : Math.max(0, totalBefore - batchIds.length),
    totalPending: totalBefore,
  }
}

export function __resetWorkSessionForTests() {
  clearWorkSession()
}
