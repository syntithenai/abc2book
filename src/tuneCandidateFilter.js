/**
 * Resolve candidate tune IDs from structural filters using indexes.
 */
import {
  LARGE_LIST_WARNING_THRESHOLD,
  LARGE_BOOK_INDEX_THRESHOLD,
} from './tuneScaleConstants'

function normalizeFilterList(value) {
  if (!Array.isArray(value)) return []
  return value.filter(function(item) { return !!item })
}

function intersectIds(a, b) {
  if (!a) return b ? b.slice() : []
  if (!b) return a.slice()
  const setB = {}
  b.forEach(function(id) { setB[id] = true })
  return a.filter(function(id) { return !!setB[id] })
}

function unionIds(a, b) {
  const seen = {}
  const out = []
  ;(a || []).concat(b || []).forEach(function(id) {
    if (!id || seen[id]) return
    seen[id] = true
    out.push(id)
  })
  return out
}

function idsFromIndex(index, keys) {
  if (!index || !keys || keys.length === 0) return null
  let result = null
  keys.forEach(function(key) {
    const bucket = index[key]
    if (!Array.isArray(bucket) || bucket.length === 0) return
    result = result ? intersectIds(result, bucket) : bucket.slice()
  })
  return result
}

function idsForBook(bookIndex, bookName) {
  if (!bookName || !bookIndex) return null
  const trimmed = String(bookName).trim()
  if (!trimmed) return null
  if (Array.isArray(bookIndex[trimmed])) return bookIndex[trimmed].slice()
  const lower = trimmed.toLowerCase()
  const keys = Object.keys(bookIndex)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (key.toLowerCase() === lower && Array.isArray(bookIndex[key])) {
      return bookIndex[key].slice()
    }
  }
  return []
}

/**
 * When an index-backed lookup returns no IDs but tunes exist, fall back to a full
 * scan (null) instead of []. filterSearchFn still applies structural filters.
 * Empty indexes must never blank the whole list.
 */
export function fallbackToFullScanIfEmpty(candidateIds, allTuneIds) {
  if (Array.isArray(candidateIds) && candidateIds.length > 0) return candidateIds
  if (Array.isArray(allTuneIds) && allTuneIds.length > 0) return null
  return Array.isArray(candidateIds) ? candidateIds : []
}

function idsForTags(tagIndex, tagFilters) {
  const tags = normalizeFilterList(tagFilters)
  if (tags.length === 0) return null
  return idsFromIndex(tagIndex, tags)
}

function idsForGenres(genreIndex, genreFilters) {
  const genres = normalizeFilterList(genreFilters)
  if (genres.length === 0) return null
  return idsFromIndex(genreIndex, genres)
}

function idsForArtists(artistIndex, artistFilters) {
  const artists = normalizeFilterList(artistFilters)
  if (artists.length === 0) return null
  return idsFromIndex(artistIndex, artists)
}

function idsForAlbums(albumIndex, albumFilters) {
  const albums = normalizeFilterList(albumFilters)
  if (albums.length === 0) return null
  return idsFromIndex(albumIndex, albums)
}

/**
 * Resolve candidate tune IDs from index-backed structural filters.
 * Returns null when all tune keys should be scanned (no structural narrowing).
 */
export function resolveCandidateTuneIds(filters, indexes, allTuneIds) {
  const f = filters || {}
  const idx = indexes || {}
  const bookIndex = idx.bookIndex || idx.books || {}
  const tagIndex = idx.tagIndex || idx.tags || {}
  const genreIndex = idx.genreIndex || idx.genres || {}
  const artistIndex = idx.artistIndex || idx.artists || {}
  const albumIndex = idx.albumIndex || idx.albums || {}

  const bookName = f.currentTuneBook || f.bookFilter || ''
  const tagFilters = f.tagFilter || []
  const genreFilters = f.genreFilter || []
  const artistFilters = f.artistFilter || []
  const albumFilters = f.albumFilter || []
  const starredOnly = !!f.starredFilter

  const hasStructural = !!(bookName && String(bookName).trim())
    || (Array.isArray(tagFilters) && tagFilters.length > 0)
    || (Array.isArray(genreFilters) && genreFilters.length > 0)
    || (Array.isArray(artistFilters) && artistFilters.length > 0)
    || (Array.isArray(albumFilters) && albumFilters.length > 0)

  if (!hasStructural && !starredOnly) {
    return null
  }

  let candidates = null

  if (bookName && String(bookName).trim()) {
    candidates = idsForBook(bookIndex, String(bookName).trim())
    // Missing/empty book index must not blank the list when tunes exist.
    // Fall back to a full scan; filterSearchFn still applies the book filter.
    const bookFallback = fallbackToFullScanIfEmpty(candidates, allTuneIds)
    if (bookFallback === null) return null
    candidates = bookFallback
  }

  const tagIds = idsForTags(tagIndex, tagFilters)
  if (tagIds) {
    candidates = candidates ? intersectIds(candidates, tagIds) : tagIds
  }

  const genreIds = idsForGenres(genreIndex, genreFilters)
  if (genreIds) {
    candidates = candidates ? intersectIds(candidates, genreIds) : genreIds
  }

  const artistIds = idsForArtists(artistIndex, artistFilters)
  if (artistIds) {
    candidates = candidates ? intersectIds(candidates, artistIds) : artistIds
  }

  const albumIds = idsForAlbums(albumIndex, albumFilters)
  if (albumIds) {
    candidates = candidates ? intersectIds(candidates, albumIds) : albumIds
  }

  if (!candidates) {
    candidates = Array.isArray(allTuneIds) ? allTuneIds.slice() : []
  }

  return candidates
}

/**
 * True when tunes carry book membership but the book index has no keys.
 * Used to trigger a one-shot rebuild so book filters stay index-backed.
 */
export function bookIndexNeedsRepair(tunes, bookIndex) {
  if (!tunes || typeof tunes !== 'object') return false
  if (bookIndex && Object.keys(bookIndex).length > 0) return false
  const list = Array.isArray(tunes) ? tunes : Object.values(tunes)
  for (let i = 0; i < list.length; i += 1) {
    const tune = list[i]
    if (tune && Array.isArray(tune.books) && tune.books.length > 0) return true
  }
  return false
}

export function isLargeBookIndex(bookIndex, bookName) {
  if (!bookIndex || !bookName) return false
  const bucket = bookIndex[bookName]
  return Array.isArray(bucket) && bucket.length >= LARGE_BOOK_INDEX_THRESHOLD
}

export function requiresNarrowingFilter(tuneCount) {
  return typeof tuneCount === 'number' && tuneCount > LARGE_LIST_WARNING_THRESHOLD
}

export { intersectIds, unionIds, LARGE_BOOK_INDEX_THRESHOLD }
