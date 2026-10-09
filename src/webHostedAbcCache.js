/**
 * In-memory cache of rendered notation WAVs as blob: URLs for mobile web hosted
 * playback (the Android app writes these to the Capacitor cache directory).
 * Bounded by bytes; the two most recently used entries are never evicted so the
 * playing tune and the pre-rendered next tune stay valid.
 */

const DEFAULT_MAX_BYTES = 96 * 1024 * 1024
const PROTECTED_RECENT = 2

function createUrlApi() {
  if (typeof URL === 'undefined') return null
  return {
    create: function(blob) { return URL.createObjectURL(blob) },
    revoke: function(url) {
      try { URL.revokeObjectURL(url) } catch (e) { /* ignore */ }
    },
  }
}

export function createWebHostedAbcCache(options) {
  const opts = options || {}
  const maxBytes = opts.maxBytes > 0 ? opts.maxBytes : DEFAULT_MAX_BYTES
  const urlApi = opts.urlApi || createUrlApi()
  // Map iteration order is insertion order; re-insert on use for LRU.
  const entries = new Map()
  let totalBytes = 0

  function touch(key, entry) {
    entries.delete(key)
    entries.set(key, entry)
  }

  function remove(key) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    totalBytes -= entry.size
    if (urlApi) urlApi.revoke(entry.url)
  }

  function evict() {
    while (totalBytes > maxBytes && entries.size > PROTECTED_RECENT) {
      const oldestKey = entries.keys().next().value
      remove(oldestKey)
    }
  }

  function getEntry(key, minDurationSec) {
    const entry = entries.get(key)
    if (!entry) return null
    const floor = minDurationSec > 0 ? Math.max(1, minDurationSec * 0.85) : 0
    if (floor > 0 && entry.durationSec > 0 && entry.durationSec < floor) {
      remove(key)
      return null
    }
    touch(key, entry)
    return entry
  }

  return {
    get: function(key, minDurationSec) {
      const entry = getEntry(key, minDurationSec)
      return entry ? entry.url : null
    },
    getEntry: getEntry,
    put: function(key, blob, durationSec, meta) {
      if (!urlApi || !blob) return null
      remove(key)
      const url = urlApi.create(blob)
      const entry = {
        url: url,
        size: blob.size || 0,
        durationSec: durationSec > 0 ? durationSec : 0,
        meta: meta || null,
      }
      entries.set(key, entry)
      totalBytes += entry.size
      evict()
      return url
    },
    has: function(key) {
      return entries.has(key)
    },
    clear: function() {
      Array.from(entries.keys()).forEach(remove)
    },
    size: function() {
      return entries.size
    },
    bytes: function() {
      return totalBytes
    },
  }
}

const sharedCache = createWebHostedAbcCache()

export function getWebAbcCacheEntry(key, minDurationSec) {
  return sharedCache.getEntry(key, minDurationSec)
}

export function putWebAbcCacheBlob(key, blob, durationSec, meta) {
  return sharedCache.put(key, blob, durationSec, meta)
}

export function hasWebAbcCacheEntry(key) {
  return sharedCache.has(key)
}
