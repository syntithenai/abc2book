/**
 * Helpers for encoding/decoding tune list search criteria in URL query params.
 *
 * Params: book, tags, genres, artists, albums (comma separated), q (text filter), group (groupBy).
 */

import { buildPathWithSearch } from './routeSyncUtils'

export const SEARCH_FILTER_PARAM_KEYS = ['book', 'tags', 'genres', 'artists', 'albums', 'q', 'group']

/** localStorage key for the last tune-list search used by Header / Back to list. */
export const LAST_SEARCH_FILTERS_STORAGE_KEY = 'bookstorage_last_search_filters'

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
 * Returns {book, tags, genres, artists, albums, q, group} with null for absent params.
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
    albums: listToParam(s.albumFilter),
    q: q || null,
    group: group || null,
  }
}

/**
 * Parse filter state out of a URLSearchParams instance.
 * Returns {book, tags, genres, artists, albums, q, group} using empty string / empty array defaults.
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
    albums: paramToList(get('albums')),
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

function filterStateFromParams(params) {
  const p = params || {}
  return {
    currentTuneBook: p.book || '',
    tagFilter: normalizeFilterList(p.tags ? String(p.tags).split(',') : []),
    genreFilter: normalizeFilterList(p.genres ? String(p.genres).split(',') : []),
    artistFilter: normalizeFilterList(p.artists ? String(p.artists).split(',') : []),
    albumFilter: normalizeFilterList(p.albums ? String(p.albums).split(',') : []),
    filter: p.q || '',
    groupBy: p.group || '',
  }
}

/** True when buildSearchFilterParams would emit at least one non-empty param. */
export function filterStateHasAnyFilters(state) {
  const params = buildSearchFilterParams(state)
  return SEARCH_FILTER_PARAM_KEYS.some(function(key) {
    return params[key] != null && String(params[key]).trim() !== ''
  })
}

/**
 * Build a /tunes path with the given filter state encoded as query params.
 */
export function buildTunesListPath(filterState) {
  return buildPathWithSearch('/tunes', null, buildSearchFilterParams(filterState))
}

/**
 * Persist the last list search so Header / Back to list / next-prev can restore it.
 * Empty filter state is ignored so a cleared React state cannot wipe the snapshot.
 * Use clearLastSearchFilters when the user explicitly clears all filters.
 */
export function saveLastSearchFilters(state) {
  if (typeof localStorage === 'undefined') return
  if (!filterStateHasAnyFilters(state)) return
  try {
    const params = buildSearchFilterParams(state)
    localStorage.setItem(LAST_SEARCH_FILTERS_STORAGE_KEY, JSON.stringify(params))
  } catch (e) {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Drop the restorable last-search snapshot so Header / Back to list go to bare /tunes.
 */
export function clearLastSearchFilters() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
  } catch (e) {
    // Ignore private-mode failures.
  }
}

/**
 * Load the last saved list search as a filter-state object, or null.
 */
export function loadLastSearchFilters() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_SEARCH_FILTERS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const state = filterStateFromParams(parsed)
    if (!filterStateHasAnyFilters(state)) return null
    return state
  } catch (e) {
    return null
  }
}

/**
 * Active list search: live React filter state if any, else the last snapshot.
 * Used by Header Tunes link and by next/prev search-list browsing.
 */
export function resolveSearchFilterState(currentState) {
  if (filterStateHasAnyFilters(currentState)) {
    return {
      currentTuneBook: currentState.currentTuneBook || '',
      filter: currentState.filter || '',
      tagFilter: normalizeFilterList(currentState.tagFilter),
      genreFilter: normalizeFilterList(currentState.genreFilter),
      artistFilter: normalizeFilterList(currentState.artistFilter),
      albumFilter: normalizeFilterList(currentState.albumFilter),
      groupBy: currentState.groupBy || '',
    }
  }
  const last = loadLastSearchFilters()
  if (last) return last
  return {
    currentTuneBook: '',
    filter: '',
    tagFilter: [],
    genreFilter: [],
    artistFilter: [],
    albumFilter: [],
    groupBy: '',
  }
}

/**
 * Path for returning to the tune list: current filters if any, else last snapshot,
 * else bare /tunes.
 */
export function resolveTunesListPath(currentState) {
  const resolved = resolveSearchFilterState(currentState)
  if (filterStateHasAnyFilters(resolved)) {
    return buildTunesListPath(resolved)
  }
  return '/tunes'
}
