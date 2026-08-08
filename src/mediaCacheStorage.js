import React from 'react'
import localforage from 'localforage'
import { toast } from 'react-toastify'
import { filterUnlockedTuneIds } from './mediaCacheLock'

export const MEDIA_CACHE_SETTINGS_TAB = 'media'

export function mediaCacheSettingsPath() {
  return '/#/settings?tab=' + MEDIA_CACHE_SETTINGS_TAB
}

export const MEDIA_CACHE_WARN_THRESHOLD_KEY = 'bookstorage_media_cache_warn_threshold_mb'
export const MEDIA_CACHE_FIRST_WARN_MB = 100
export const MEDIA_CACHE_WARN_STEP_MB = 50

const MB = 1024 * 1024

const externalMediaStore = localforage.createInstance({ name: 'externalmediacache' })
const stemStore = localforage.createInstance({ name: 'stemcache' })
const midiStore = localforage.createInstance({ name: 'abcaudiocache' })

/**
 * Estimate persisted byte size of a localforage value.
 */
export function estimateStoredValueBytes(value) {
  if (value == null) return 0
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.size || 0
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength || 0
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength || 0
  }
  if (Array.isArray(value)) {
    let total = 0
    for (let i = 0; i < value.length; i++) {
      total += estimateStoredValueBytes(value[i])
    }
    return total
  }
  if (typeof value === 'string') {
    return value.length * 2
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return 8
  }
  if (typeof value === 'object') {
    let total = 0
    const keys = Object.keys(value)
    for (let i = 0; i < keys.length; i++) {
      total += estimateStoredValueBytes(value[keys[i]])
    }
    return total
  }
  return 0
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return n + ' B'
  if (n < MB) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB'
  const mb = n / MB
  if (mb < 10) return mb.toFixed(1) + ' MB'
  return Math.round(mb) + ' MB'
}

/**
 * Highest warning threshold (MB) strictly exceeded by totalBytes.
 * Thresholds: 100, 150, 200, 250, ...
 */
export function getHighestExceededThresholdMb(totalBytes) {
  const mb = (Number(totalBytes) || 0) / MB
  if (mb <= MEDIA_CACHE_FIRST_WARN_MB) return 0
  let threshold = MEDIA_CACHE_FIRST_WARN_MB
  while (threshold + MEDIA_CACHE_WARN_STEP_MB < mb) {
    threshold += MEDIA_CACHE_WARN_STEP_MB
  }
  return threshold
}

export function getLastWarnedThresholdMb() {
  try {
    const raw = localStorage.getItem(MEDIA_CACHE_WARN_THRESHOLD_KEY)
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    return 0
  }
}

export function setLastWarnedThresholdMb(mb) {
  try {
    if (!mb) {
      localStorage.removeItem(MEDIA_CACHE_WARN_THRESHOLD_KEY)
    } else {
      localStorage.setItem(MEDIA_CACHE_WARN_THRESHOLD_KEY, String(mb))
    }
  } catch (e) {
    // ignore quota errors
  }
}

export function tuneIdFromExternalMediaCacheKey(key) {
  if (!key || key.indexOf('extmedia:') !== 0) return null
  const rest = key.slice('extmedia:'.length)
  const firstColon = rest.indexOf(':')
  if (firstColon < 0) return null
  return rest.slice(0, firstColon)
}

export function tuneIdFromStemCacheKey(key) {
  if (!key || key.indexOf('stems:') !== 0) return null
  const rest = key.slice('stems:'.length)
  const firstColon = rest.indexOf(':')
  if (firstColon < 0) return null
  return rest.slice(0, firstColon)
}

/**
 * MIDI synth cache keys are `{tuneId}-{tempo}-{transpose}-{abcHash}`.
 */
export function tuneIdFromMidiCacheKey(key) {
  if (!key) return null
  const dash = String(key).indexOf('-')
  if (dash < 0) return String(key)
  return String(key).slice(0, dash)
}

export function midiCacheKeyMatchesTuneId(key, tuneId) {
  if (!key || !tuneId) return false
  const keyStr = String(key)
  const idStr = String(tuneId)
  return keyStr === idStr || keyStr.indexOf(idStr + '-') === 0
}

/**
 * Resolve a MIDI cache key to a tune id, preferring the longest known tune id prefix.
 */
export function resolveTuneIdFromMidiCacheKey(key, knownTuneIds) {
  if (!key) return null
  const keyStr = String(key)
  let bestMatch = null
  ;(knownTuneIds || []).forEach(function(id) {
    if (!id) return
    const idStr = String(id)
    if (midiCacheKeyMatchesTuneId(keyStr, idStr)) {
      if (!bestMatch || idStr.length > bestMatch.length) {
        bestMatch = idStr
      }
    }
  })
  if (bestMatch) return bestMatch
  return tuneIdFromMidiCacheKey(key)
}

export function formatCacheDate(cachedAt) {
  const ts = Number(cachedAt) || 0
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch (e) {
    return '—'
  }
}

function tuneIdSetFromList(tuneIds) {
  const idSet = {}
  ;(tuneIds || []).forEach(function(id) {
    if (id) idSet[String(id)] = true
  })
  return idSet
}

/**
 * Keys to remove when clearing half the cache (oldest cached first).
 */
export function selectHalfOldestCacheKeys(entries) {
  const list = (entries || []).slice()
  list.sort(function(a, b) {
    return (a.cachedAt || 0) - (b.cachedAt || 0)
  })
  const removeCount = Math.floor(list.length / 2)
  return list.slice(0, removeCount).map(function(entry) {
    return entry.key
  })
}

export function filterCacheKeysForTuneIds(keys, tuneIds, tuneIdFromKey) {
  const idSet = tuneIdSetFromList(tuneIds)
  if (Object.keys(idSet).length === 0) return []
  return (keys || []).filter(function(key) {
    const tuneId = tuneIdFromKey(key)
    return !!(tuneId && idSet[tuneId])
  })
}

async function collectStoreStats(store, options) {
  const opts = options || {}
  const lockedTuneIds = opts.lockedTuneIds || {}
  let bytes = 0
  let entries = 0
  let lockedBytes = 0
  let lockedEntries = 0
  const tuneIds = {}
  await store.iterate(function(value, key) {
    entries += 1
    const entryBytes = estimateStoredValueBytes(value)
    bytes += entryBytes
    const tuneId = opts.tuneIdFromKey ? opts.tuneIdFromKey(key) : key
    if (tuneId) tuneIds[tuneId] = true
    if (tuneId && lockedTuneIds[tuneId]) {
      lockedEntries += 1
      lockedBytes += entryBytes
    }
  })
  return {
    id: opts.id,
    label: opts.label,
    bytes: bytes,
    entries: entries,
    lockedBytes: lockedBytes,
    lockedEntries: lockedEntries,
    tuneCount: Object.keys(tuneIds).length,
    tuneIds: Object.keys(tuneIds),
  }
}

export async function getExternalMediaCacheStats(options) {
  const opts = options || {}
  return collectStoreStats(externalMediaStore, {
    id: 'audio',
    label: 'File Cache',
    tuneIdFromKey: tuneIdFromExternalMediaCacheKey,
    lockedTuneIds: opts.lockedTuneIds,
  })
}

export async function getStemCacheStats() {
  return collectStoreStats(stemStore, {
    id: 'stems',
    label: 'Stem cache',
    tuneIdFromKey: tuneIdFromStemCacheKey,
  })
}

export async function getMidiCacheStats() {
  return collectStoreStats(midiStore, {
    id: 'midi',
    label: 'MIDI cache',
    tuneIdFromKey: tuneIdFromMidiCacheKey,
  })
}

async function collectTuneCacheSummaries(store, options) {
  const opts = options || {}
  const byTune = {}
  await store.iterate(function(value, key) {
    const tuneId = opts.tuneIdFromKey ? opts.tuneIdFromKey(key) : key
    if (!tuneId) return
    const bytes = estimateStoredValueBytes(value)
    const cachedAt = opts.getCachedAt ? opts.getCachedAt(value, key) : 0
    if (!byTune[tuneId]) {
      byTune[tuneId] = {
        tuneId: tuneId,
        bytes: 0,
        cachedAt: 0,
        entries: 0,
      }
    }
    byTune[tuneId].bytes += bytes
    byTune[tuneId].entries += 1
    if (cachedAt > byTune[tuneId].cachedAt) {
      byTune[tuneId].cachedAt = cachedAt
    }
  })
  return Object.values(byTune)
}

export async function getAudioCacheTuneSummaries() {
  return collectTuneCacheSummaries(externalMediaStore, {
    tuneIdFromKey: tuneIdFromExternalMediaCacheKey,
    getCachedAt: function(value) {
      return value && value.cachedAt ? value.cachedAt : 0
    },
  })
}

export async function getStemCacheTuneSummaries() {
  return collectTuneCacheSummaries(stemStore, {
    tuneIdFromKey: tuneIdFromStemCacheKey,
    getCachedAt: function(value) {
      return value && value.cachedAt ? value.cachedAt : 0
    },
  })
}

export async function getMidiCacheTuneSummaries(tunes) {
  const knownTuneIds = tunes ? Object.keys(tunes) : []
  return collectTuneCacheSummaries(midiStore, {
    tuneIdFromKey: function(key) {
      return resolveTuneIdFromMidiCacheKey(key, knownTuneIds)
    },
    getCachedAt: function() {
      return 0
    },
  })
}

/**
 * Aggregate stats for audio, MIDI, and stem caches.
 */
export async function getAllMediaCacheStats(options) {
  const opts = options || {}
  const lockedTuneIds = opts.lockedTuneIds || {}
  const [audio, midi, stems] = await Promise.all([
    getExternalMediaCacheStats({ lockedTuneIds: lockedTuneIds }),
    getMidiCacheStats(),
    getStemCacheStats(),
  ])
  const caches = [audio, midi, stems]
  let totalBytes = 0
  let totalEntries = 0
  for (let i = 0; i < caches.length; i++) {
    totalBytes += caches[i].bytes || 0
    totalEntries += caches[i].entries || 0
  }
  return {
    caches: caches,
    audio: audio,
    midi: midi,
    stems: stems,
    totalBytes: totalBytes,
    totalEntries: totalEntries,
  }
}

/**
 * Show a warning toast when total cache storage crosses 100 MB, then every +50 MB.
 * Dedupes by the highest threshold already warned for.
 */
export function maybeWarnMediaCacheStorage(stats) {
  const totalBytes = stats && stats.totalBytes != null
    ? stats.totalBytes
    : 0
  const exceededMb = getHighestExceededThresholdMb(totalBytes)
  const lastWarned = getLastWarnedThresholdMb()

  if (exceededMb > lastWarned) {
    setLastWarnedThresholdMb(exceededMb)
    const message = 'Media caches are using over ' + exceededMb + ' MB. Review or free space in Settings.'
    toast.warning(function(renderProps) {
      return (
        <div
          className="media-cache-storage-toast"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
        >
          <span>{message}</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={function() {
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
              window.location.assign(mediaCacheSettingsPath())
            }}
          >
            Open Settings
          </button>
        </div>
      )
    }, { autoClose: 10000, toastId: 'media-cache-storage-warning' })
    return { warned: true, thresholdMb: exceededMb, totalBytes: totalBytes }
  }

  if (exceededMb < lastWarned) {
    setLastWarnedThresholdMb(exceededMb)
  }
  return { warned: false, thresholdMb: exceededMb, totalBytes: totalBytes }
}

export async function checkMediaCacheStorageWarning() {
  const stats = await getAllMediaCacheStats()
  return {
    stats: stats,
    warning: maybeWarnMediaCacheStorage(stats),
  }
}

let checkTimer = null

/**
 * Debounced storage check after cache writes or clears.
 */
export function scheduleMediaCacheStorageCheck(delayMs) {
  const delay = delayMs == null ? 800 : delayMs
  if (checkTimer) {
    clearTimeout(checkTimer)
  }
  checkTimer = setTimeout(function() {
    checkTimer = null
    checkMediaCacheStorageWarning().catch(function() {
      // ignore storage inspection errors
    })
  }, delay)
}

function resolveClearTuneIds(tuneIds, options) {
  const opts = options || {}
  if (!opts.respectLock || !opts.lockedTuneIds) {
    return (tuneIds || []).slice()
  }
  return filterUnlockedTuneIds(tuneIds, opts.lockedTuneIds)
}

/**
 * Remove half of audio cache entries, preferring most recently cached records.
 */
export async function cleanupHalfExternalMediaCache(options) {
  const lockedTuneIds = options && options.lockedTuneIds ? options.lockedTuneIds : null
  const entries = []
  await externalMediaStore.iterate(function(value, key) {
    const tuneId = tuneIdFromExternalMediaCacheKey(key)
    if (tuneId && lockedTuneIds && lockedTuneIds[tuneId]) return
    entries.push({
      key: key,
      cachedAt: value && value.cachedAt ? value.cachedAt : 0,
    })
  })
  const keysToRemove = selectHalfOldestCacheKeys(entries)
  for (let i = 0; i < keysToRemove.length; i++) {
    await externalMediaStore.removeItem(keysToRemove[i])
  }
  scheduleMediaCacheStorageCheck(0)
  return {
    removed: keysToRemove.length,
    remaining: entries.length - keysToRemove.length,
    totalBefore: entries.length,
  }
}

export async function cleanupHalfAudioCache(options) {
  return cleanupHalfExternalMediaCache(options)
}

export async function clearExternalMediaCacheForTuneIds(tuneIds, options) {
  const ids = resolveClearTuneIds(tuneIds, options)
  const allKeys = []
  await externalMediaStore.iterate(function(_value, key) {
    allKeys.push(key)
  })
  const keysToRemove = filterCacheKeysForTuneIds(
    allKeys,
    ids,
    tuneIdFromExternalMediaCacheKey
  )
  for (let i = 0; i < keysToRemove.length; i++) {
    await externalMediaStore.removeItem(keysToRemove[i])
  }
  scheduleMediaCacheStorageCheck(0)
  return { removed: keysToRemove.length }
}

export async function clearStemCacheForTuneIds(tuneIds, options) {
  const ids = resolveClearTuneIds(tuneIds, options)
  const allKeys = []
  await stemStore.iterate(function(_value, key) {
    allKeys.push(key)
  })
  const keysToRemove = filterCacheKeysForTuneIds(
    allKeys,
    ids,
    tuneIdFromStemCacheKey
  )
  for (let i = 0; i < keysToRemove.length; i++) {
    await stemStore.removeItem(keysToRemove[i])
  }
  // Drop in-memory stem buffers for removed keys when the stem module is loaded.
  try {
    const stemModule = await import('./audioStemCache')
    if (stemModule && typeof stemModule.forgetStemCacheKeys === 'function') {
      stemModule.forgetStemCacheKeys(keysToRemove)
    }
  } catch (e) {
    // ignore
  }
  scheduleMediaCacheStorageCheck(0)
  return { removed: keysToRemove.length }
}

export async function clearAudioAndStemCacheForTuneIds(tuneIds, options) {
  const [audio, stems] = await Promise.all([
    clearExternalMediaCacheForTuneIds(tuneIds, options),
    clearStemCacheForTuneIds(tuneIds, options),
  ])
  return { audio: audio, stems: stems }
}

export async function clearAudioCacheForTuneIds(tuneIds, options) {
  return clearExternalMediaCacheForTuneIds(tuneIds, options)
}

export async function clearStemCacheForTunes(tuneIds, options) {
  return clearStemCacheForTuneIds(tuneIds, options)
}

export async function clearMidiCacheForTuneIds(tuneIds) {
  const idList = Object.keys(tuneIdSetFromList(tuneIds))
  const keysToRemove = []
  await midiStore.iterate(function(_value, key) {
    for (let i = 0; i < idList.length; i++) {
      if (midiCacheKeyMatchesTuneId(key, idList[i])) {
        keysToRemove.push(key)
        break
      }
    }
  })
  for (let i = 0; i < keysToRemove.length; i++) {
    await midiStore.removeItem(keysToRemove[i])
  }
  scheduleMediaCacheStorageCheck(0)
  return { removed: keysToRemove.length }
}
