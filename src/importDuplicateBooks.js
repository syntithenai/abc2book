import { importTitlesMatchForDeduping, tuneImportTitle } from './importTitleMatch'

/**
 * Helpers for content-hash import dedupe: resolve existing tune ids and merge
 * incoming book membership onto matched locals (size-stable re-import).
 */

/**
 * Normalise importhashes[hash] to an id list (hash maps to string id or string[]).
 */
export function importHashIds(importhashes, hash) {
  if (!importhashes || hash == null || hash === '') return []
  const entry = importhashes[hash]
  if (!entry) return []
  if (Array.isArray(entry)) {
    return entry.filter(function(id) { return id != null && id !== '' })
  }
  return [entry]
}

function normalizeBookName(book) {
  return String(book || '').trim().toLowerCase()
}

/**
 * Merge books and tags from an incoming import tune (and optional forceBook)
 * onto an existing local tune. Mutates existingTune when changed.
 *
 * @returns {{ changed: boolean, added: string[], addedTags: string[] }}
 */
export function mergeIncomingBooksOntoTune(existingTune, incomingTune, forceBook, uniquifyArray) {
  if (!existingTune) return { changed: false, added: [], addedTags: [] }
  const uniquify = typeof uniquifyArray === 'function'
    ? uniquifyArray
    : function(arr) {
      const seen = {}
      const out = []
      ;(Array.isArray(arr) ? arr : []).forEach(function(item) {
        const key = normalizeBookName(item)
        if (!key || seen[key]) return
        seen[key] = true
        out.push(String(item).trim())
      })
      return out
    }

  const beforeBooks = Array.isArray(existingTune.books) ? existingTune.books.slice() : []
  const beforeBookKeys = {}
  beforeBooks.forEach(function(b) { beforeBookKeys[normalizeBookName(b)] = true })

  const incomingBooks = []
  if (incomingTune && Array.isArray(incomingTune.books)) {
    incomingTune.books.forEach(function(b) { incomingBooks.push(b) })
  }
  if (forceBook) incomingBooks.push(forceBook)

  const nextBooks = uniquify(beforeBooks.concat(incomingBooks))
  const added = nextBooks.filter(function(b) { return !beforeBookKeys[normalizeBookName(b)] })

  const beforeTags = Array.isArray(existingTune.tags) ? existingTune.tags.slice() : []
  const beforeTagKeys = {}
  beforeTags.forEach(function(t) { beforeTagKeys[normalizeBookName(t)] = true })
  const incomingTags = incomingTune && Array.isArray(incomingTune.tags) ? incomingTune.tags : []
  const nextTags = uniquify(beforeTags.concat(incomingTags))
  const addedTags = nextTags.filter(function(t) { return !beforeTagKeys[normalizeBookName(t)] })

  let changed = false
  if (added.length > 0 || nextBooks.length !== beforeBooks.length) {
    existingTune.books = nextBooks
    changed = true
  }
  if (addedTags.length > 0 || nextTags.length !== beforeTags.length) {
    existingTune.tags = nextTags
    changed = true
  }
  if (!changed) {
    return { changed: false, added: [], addedTags: [] }
  }
  return { changed: true, added: added, addedTags: addedTags }
}

/**
 * Apply book merges for all content-hash duplicate imports.
 * Mutates tunes map in place.
 *
 * @returns {{ mergedTuneIds: string[], addedBookCount: number }}
 */
export function applyDuplicateBookMerges(options) {
  const opts = options || {}
  const tunes = opts.tunes || {}
  const duplicates = opts.duplicates
  const importhashes = opts.importhashes || {}
  const getTuneImportHash = opts.getTuneImportHash
  const forceBook = opts.forceBook
  const uniquifyArray = opts.uniquifyArray
  const now = opts.now != null ? opts.now : Date.now()

  const dupList = Array.isArray(duplicates)
    ? duplicates
    : (duplicates && typeof duplicates === 'object' ? Object.values(duplicates) : [])

  if (!dupList.length || typeof getTuneImportHash !== 'function') {
    return { mergedTuneIds: [], addedBookCount: 0 }
  }

  const mergedTuneIds = []
  let addedBookCount = 0
  const seenMerged = {}

  dupList.forEach(function(incoming) {
    if (!incoming) return
    const hash = getTuneImportHash(incoming)
    const ids = importHashIds(importhashes, hash)
    ids.forEach(function(id) {
      const existing = tunes[id]
      if (!existing) return
      if (!importTitlesMatchForDeduping(tuneImportTitle(incoming), tuneImportTitle(existing))) {
        return
      }
      const result = mergeIncomingBooksOntoTune(existing, incoming, forceBook, uniquifyArray)
      if (result.changed) {
        existing.lastUpdated = now
        addedBookCount += result.added.length + (result.addedTags ? result.addedTags.length : 0)
        if (!seenMerged[id]) {
          seenMerged[id] = true
          mergedTuneIds.push(id)
        }
      }
    })
  })

  return { mergedTuneIds: mergedTuneIds, addedBookCount: addedBookCount }
}
