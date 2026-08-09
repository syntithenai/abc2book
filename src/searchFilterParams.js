/**
 * Helpers for encoding/decoding tune list search criteria in URL query params.
 *
 * Params: book, tags, genres, artists (comma separated), q (text filter), group (groupBy).
 */

export const SEARCH_FILTER_PARAM_KEYS = ['book', 'tags', 'genres', 'artists', 'q', 'group']

export function normalizeFilterList(value) {
  if (!Array.isArray(value)) {
    // tagFilter is initialized as '' in useAppData but used as an array elsewhere
    if (typeof value === 'string' && value.trim()) return [value.trim()]
    return []
  }
  return value.map(function(v) { return String(v).trim() }).filter(Boolean)
}

function normalizeText(value) {
  if (value === null || value === undefined || value === 0) return ''
  return String(value).trim()
}

function listToParam(value) {
  const list = normalizeFilterList(value)
  return list.length > 0 ? list.join(',') : null
}

function paramToList(value) {
  if (!value) return []
  return String(value).split(',').map(function(t) { return t.trim() }).filter(Boolean)
}

/**
 * Build the query param values for the given filter state.
 * Returns {book, tags, genres, artists, q, group} with null for absent params.
 */
export function buildSearchFilterParams(state) {
  const s = state || {}
  const book = normalizeText(s.currentTuneBook)
  const q = normalizeText(s.filter)
  const group = normalizeText(s.groupBy)
  return {
    book: book || null,
    tags: listToParam(s.tagFilter),
    genres: listToParam(s.genreFilter),
    artists: listToParam(s.artistFilter),
    q: q || null,
    group: group || null,
  }
}

/**
 * Parse filter state out of a URLSearchParams instance.
 * Returns {book, tags, genres, artists, q, group} using empty string / empty array defaults.
 */
export function parseSearchFilterParams(searchParams) {
  const get = function(key) {
    return searchParams && typeof searchParams.get === 'function' ? searchParams.get(key) : null
  }
  return {
    book: normalizeText(get('book')),
    tags: paramToList(get('tags')),
    genres: paramToList(get('genres')),
    artists: paramToList(get('artists')),
    q: get('q') != null ? String(get('q')) : '',
    group: normalizeText(get('group')),
  }
}

/**
 * True when the hash targets the tune search list (not a tune detail URL).
 */
export function isSearchListHash(hash) {
  const value = String(hash || '')
  return value === '#/tunes' || value.startsWith('#/tunes?')
}

/**
 * Read search filter params from the current location hash, if present.
 * Used on first load so /tunes?book=... applies before the list filter runs.
 */
export function readSearchFilterParamsFromHash(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null)
  if (!loc) return null
  const hash = loc.hash || ''
  if (!isSearchListHash(hash)) return null
  const qIndex = hash.indexOf('?')
  if (qIndex < 0) return null
  try {
    return parseSearchFilterParams(new URLSearchParams(hash.slice(qIndex + 1)))
  } catch (e) {
    return null
  }
}

export function hasAnySearchFilterParams(searchParams) {
  if (!searchParams || typeof searchParams.get !== 'function') return false
  return SEARCH_FILTER_PARAM_KEYS.some(function(key) {
    const value = searchParams.get(key)
    return value != null && String(value).trim() !== ''
  })
}

/** Compare two objects returned by buildSearchFilterParams. */
export function searchFilterParamsEqual(a, b) {
  const pa = a || {}
  const pb = b || {}
  return SEARCH_FILTER_PARAM_KEYS.every(function(key) {
    return (pa[key] || null) === (pb[key] || null)
  })
}

/** True when the only difference between the two param sets is the text filter (q). */
export function onlyTextFilterDiffers(a, b) {
  const pa = a || {}
  const pb = b || {}
  if ((pa.q || null) === (pb.q || null)) return false
  return SEARCH_FILTER_PARAM_KEYS.every(function(key) {
    if (key === 'q') return true
    return (pa[key] || null) === (pb[key] || null)
  })
}
