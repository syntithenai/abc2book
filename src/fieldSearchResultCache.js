/**
 * Session-scoped cache of field-lookup search results.
 * Keyed by targetKey (tune:id | candidate:id) + kind.
 * Used by field caret dropdowns to reopen one-shot picker candidates
 * without keeping jobs in long-lived "awaiting" status.
 */

const store = new Map()
const listeners = new Set()

function entryKey(targetKey, kind) {
  return String(targetKey || '') + '|' + String(kind || '')
}

export function targetKeyForFieldSearch(tuneId, candidateId) {
  if (tuneId) return 'tune:' + String(tuneId)
  if (candidateId) return 'candidate:' + String(candidateId)
  return ''
}

export function setFieldSearchResults(targetKey, kind, candidates) {
  const key = entryKey(targetKey, kind)
  if (!key || key.indexOf('|') === 0) return
  const list = Array.isArray(candidates) ? candidates.slice() : []
  if (list.length === 0) {
    if (store.has(key)) {
      store.delete(key)
      notify()
    }
    return
  }
  store.set(key, {
    targetKey: String(targetKey),
    kind: String(kind),
    candidates: list,
    updatedAt: Date.now(),
  })
  notify()
}

export function getFieldSearchResults(targetKey, kind) {
  const entry = store.get(entryKey(targetKey, kind))
  return entry && Array.isArray(entry.candidates) ? entry.candidates.slice() : []
}

export function clearFieldSearchResults(targetKey, kind) {
  const key = entryKey(targetKey, kind)
  if (!store.has(key)) return false
  store.delete(key)
  notify()
  return true
}

export function clearAllFieldSearchResultsForTarget(targetKey) {
  const prefix = String(targetKey || '') + '|'
  if (!prefix || prefix === '|') return
  let changed = false
  Array.from(store.keys()).forEach(function(key) {
    if (key.indexOf(prefix) === 0) {
      store.delete(key)
      changed = true
    }
  })
  if (changed) notify()
}

export function subscribeFieldSearchResults(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

function notify() {
  listeners.forEach(function(listener) {
    try {
      listener()
    } catch (e) {
      // ignore subscriber errors
    }
  })
}

/** Test helper */
export function __resetFieldSearchResultCacheForTests() {
  store.clear()
  listeners.clear()
}
