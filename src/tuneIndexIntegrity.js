import { isMassDeleteBatch } from './incomingMergeUtils'

/**
 * Pure gate for index IDB writes. Stale incremental persists must not
 * overwrite a completed (or in-flight) full rebuild.
 */
export function shouldAcceptIndexPersist(options) {
  const opts = options || {}
  if (opts.reindexInProgress) return false
  const writeGen = opts.writeGeneration
  const currentGen = opts.currentGeneration
  if (writeGen == null || currentGen == null) return true
  return writeGen === currentGen
}

export function countBookedTunes(tunes) {
  if (!tunes || typeof tunes !== 'object') return 0
  const list = Array.isArray(tunes) ? tunes : Object.values(tunes)
  let count = 0
  for (let i = 0; i < list.length; i += 1) {
    const tune = list[i]
    if (tune && Array.isArray(tune.books) && tune.books.length > 0) count += 1
  }
  return count
}

/**
 * How many booked tunes are missing from bookIndex for all of their books.
 */
export function countMissingBookIndexMemberships(tunes, bookIndex) {
  if (!tunes || typeof tunes !== 'object') return 0
  const index = bookIndex || {}
  const list = Array.isArray(tunes) ? tunes : Object.values(tunes)
  let missing = 0
  for (let i = 0; i < list.length; i += 1) {
    const tune = list[i]
    if (!tune || tune.id == null) continue
    if (!Array.isArray(tune.books) || tune.books.length === 0) continue
    let found = false
    for (let b = 0; b < tune.books.length; b += 1) {
      const book = tune.books[b]
      if (!book) continue
      const bucket = index[book]
      if (Array.isArray(bucket) && bucket.indexOf(tune.id) !== -1) {
        found = true
        break
      }
    }
    if (!found) missing += 1
  }
  return missing
}

/**
 * True when the book index is empty or massively skewed vs tune.books membership.
 */
export function bookIndexNeedsRepair(tunes, bookIndex) {
  if (!tunes || typeof tunes !== 'object') return false
  const booked = countBookedTunes(tunes)
  if (booked <= 0) return false
  if (!bookIndex || Object.keys(bookIndex).length === 0) return true
  const missing = countMissingBookIndexMemberships(tunes, bookIndex)
  return isMassDeleteBatch(missing, booked)
}

/**
 * Union index keys with values scanned from tune field arrays (books/tags).
 */
export function unionIndexKeysWithTuneField(index, tunes, fieldName) {
  const final = {}
  Object.keys(index || {}).forEach(function(key) {
    if (key) final[key] = key
  })
  const list = !tunes || typeof tunes !== 'object'
    ? []
    : (Array.isArray(tunes) ? tunes : Object.values(tunes))
  list.forEach(function(tune) {
    const values = tune && tune[fieldName]
    if (!Array.isArray(values)) return
    values.forEach(function(value) {
      if (value && String(value).trim()) final[value] = value
    })
  })
  return final
}
