/**
 * Duplicate scan bridge: optional Web Worker with book-scope filtering for large libraries.
 */
import { scanDuplicateGroupsAsync } from './tuneDuplicateScan'
import { LARGE_LIST_WARNING_THRESHOLD } from './tuneScaleConstants'

function filterTunesByBook(tunes, bookName) {
  if (!bookName || !tunes || typeof tunes !== 'object') return tunes || {}
  const filtered = {}
  Object.keys(tunes).forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune || !Array.isArray(tune.books)) return
    if (tune.books.indexOf(bookName) !== -1) filtered[tuneId] = tune
  })
  return filtered
}

function filterTunesHashByTunes(tunesHash, tunes) {
  const next = {}
  Object.keys(tunes || {}).forEach(function(tuneId) {
    if (tunesHash && tunesHash[tuneId] != null) next[tuneId] = tunesHash[tuneId]
  })
  return next
}

export function shouldDefaultBookScope(tuneCount, currentTuneBook) {
  return tuneCount > LARGE_LIST_WARNING_THRESHOLD && !!currentTuneBook
}

/**
 * Run duplicate scan, optionally scoped to one book. Uses Worker when available.
 */
export async function scanDuplicateGroupsWithScope(options) {
  const opts = options || {}
  const allTunes = opts.tunes || {}
  const scopeBook = opts.scopeBook || (opts.scopeCurrentBookOnly && opts.currentTuneBook ? opts.currentTuneBook : '')
  const scopedTunes = scopeBook ? filterTunesByBook(allTunes, scopeBook) : allTunes
  const scopedHash = filterTunesHashByTunes(opts.tunesHash, scopedTunes)

  return scanDuplicateGroupsAsync(Object.assign({}, opts, {
    tunes: scopedTunes,
    tunesHash: scopedHash,
  }))
}
