/**
 * Duplicate scan bridge: optional Web Worker with book-scope filtering for large libraries.
 */
import { scanDuplicateGroupsAsync } from './tuneDuplicateScan'
import { LARGE_LIST_WARNING_THRESHOLD } from './tuneScaleConstants'

export function filterTunesByBook(tunes, bookName) {
  if (!bookName || !tunes || typeof tunes !== 'object') return tunes || {}
  const filtered = {}
  Object.keys(tunes).forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune || !Array.isArray(tune.books)) return
    if (tune.books.indexOf(bookName) !== -1) filtered[tuneId] = tune
  })
  return filtered
}

/**
 * Keep {ids, hashes, importhashes} shape while dropping entries for tunes not in scope.
 */
export function filterTunesHashByTunes(tunesHash, tunes) {
  const prev = tunesHash && typeof tunesHash === 'object' ? tunesHash : {}
  const tuneIds = {}
  Object.keys(tunes || {}).forEach(function(tuneId) {
    tuneIds[String(tuneId)] = true
  })

  function keepId(id) {
    return tuneIds[String(id)]
  }

  const nextIds = {}
  Object.keys(prev.ids || {}).forEach(function(tuneId) {
    if (keepId(tuneId)) nextIds[tuneId] = prev.ids[tuneId]
  })

  const nextHashes = {}
  Object.keys(prev.hashes || {}).forEach(function(hash) {
    const ids = (prev.hashes[hash] || []).filter(keepId)
    if (ids.length > 0) nextHashes[hash] = ids
  })

  const nextImportHashes = {}
  Object.keys(prev.importhashes || {}).forEach(function(hash) {
    const ids = (prev.importhashes[hash] || []).filter(keepId)
    if (ids.length > 0) nextImportHashes[hash] = ids
  })

  return {
    ids: nextIds,
    hashes: nextHashes,
    importhashes: nextImportHashes,
  }
}

/**
 * Stable import-hash lookup from the persisted index (survives partial tune hydration).
 */
export function lookupImportHashFromTunesHash(tunesHash, tuneId) {
  if (!tuneId || !tunesHash || !tunesHash.importhashes) return ''
  const id = String(tuneId)
  const buckets = tunesHash.importhashes
  const hashes = Object.keys(buckets)
  for (let i = 0; i < hashes.length; i += 1) {
    const list = buckets[hashes[i]]
    if (!Array.isArray(list)) continue
    for (let j = 0; j < list.length; j += 1) {
      if (String(list[j]) === id) return hashes[i]
    }
  }
  return ''
}

/**
 * Prefer persisted importhashes; avoid title-only hashes for unhydrated bodies.
 */
export function stableTuneImportHash(tune, getTuneImportHash, tunesHash) {
  if (!tune) return ''
  const fromIndex = lookupImportHashFromTunesHash(tunesHash, tune.id)
  if (fromIndex) return fromIndex
  const hasVoices = tune.voices && typeof tune.voices === 'object' && Object.keys(tune.voices).length > 0
  if (!hasVoices) return ''
  if (typeof getTuneImportHash !== 'function') return ''
  return getTuneImportHash(tune) || ''
}

export function shouldDefaultBookScope(tuneCount, currentTuneBook) {
  return tuneCount > LARGE_LIST_WARNING_THRESHOLD && !!currentTuneBook
}

/**
 * Run duplicate scan, optionally scoped to one book.
 */
export async function scanDuplicateGroupsWithScope(options) {
  const opts = options || {}
  const allTunes = opts.tunes || {}
  const scopeBook = opts.scopeBook || (opts.scopeCurrentBookOnly && opts.currentTuneBook ? opts.currentTuneBook : '')
  const scopedTunes = scopeBook ? filterTunesByBook(allTunes, scopeBook) : allTunes
  const scopedHash = scopeBook
    ? filterTunesHashByTunes(opts.tunesHash, scopedTunes)
    : (opts.tunesHash || {})

  const rawGetHash = opts.getTuneImportHash
  const tunesHashForLookup = scopedHash
  const getTuneImportHash = function(tune) {
    return stableTuneImportHash(tune, rawGetHash, tunesHashForLookup)
  }

  return scanDuplicateGroupsAsync(Object.assign({}, opts, {
    tunes: scopedTunes,
    tunesHash: scopedHash,
    getTuneImportHash: getTuneImportHash,
  }))
}
