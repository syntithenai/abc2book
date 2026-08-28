/**
 * Per-book page / tune-index on a tune (tunes may belong to multiple books).
 *
 * Shape: tune.bookPages = { eurosession: { page: 8, tuneIndex: 1 } }
 */

import { getTuneFiles } from './tuneFiles'

const CROP_PAGE_RE = /^p(\d+)_(\d+)_/i
const EUROSESSION_BOOK = 'eurosession'
const EUROSESSION_CROP_SOURCE = 'eurosession'

export function normalizeBookKey(book) {
  return String(book || '').trim().toLowerCase()
}

/**
 * Parse crop basename like p08_01_slug.jpg → { page, tuneIndex }.
 * @param {string} name
 * @returns {{ page: number, tuneIndex: number }|null}
 */
export function parsePageFromCropName(name) {
  const base = String(name || '').split(/[/\\]/).pop() || ''
  const match = base.match(CROP_PAGE_RE)
  if (!match) return null
  const page = parseInt(match[1], 10)
  const tuneIndex = parseInt(match[2], 10)
  if (!(page > 0)) return null
  return {
    page: page,
    tuneIndex: tuneIndex > 0 ? tuneIndex : 0,
  }
}

function normalizePageEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const page = parseInt(raw.page, 10)
  if (!(page > 0)) return null
  const tuneIndex = parseInt(raw.tuneIndex, 10)
  return {
    page: page,
    tuneIndex: tuneIndex > 0 ? tuneIndex : 0,
  }
}

function cropFallbackForBook(tune, bookKey) {
  if (bookKey !== EUROSESSION_BOOK) return null
  const files = getTuneFiles(tune)
  for (let i = 0; i < files.length; i++) {
    const meta = files[i]
    if (!meta) continue
    if (String(meta.source || '') !== EUROSESSION_CROP_SOURCE) continue
    const parsed = parsePageFromCropName(meta.name)
    if (parsed) return parsed
  }
  // Already-imported crops may lack source; still try pNN_MM_ filenames.
  for (let j = 0; j < files.length; j++) {
    const meta = files[j]
    if (!meta) continue
    const parsed = parsePageFromCropName(meta.name)
    if (parsed) return parsed
  }
  return null
}

/**
 * @param {object} tune
 * @param {string} book
 * @returns {{ page: number, tuneIndex: number }|null}
 */
export function getTuneBookPage(tune, book) {
  const bookKey = normalizeBookKey(book)
  if (!bookKey || !tune) return null
  const map = tune.bookPages
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const entry = normalizePageEntry(map[bookKey])
    if (entry) return entry
  }
  return cropFallbackForBook(tune, bookKey)
}

/**
 * @param {object} tune
 * @param {string} book
 * @returns {number} page or 0 when unknown
 */
export function getTunePageForBook(tune, book) {
  const entry = getTuneBookPage(tune, book)
  return entry && entry.page > 0 ? entry.page : 0
}

/**
 * @param {object} tune
 * @param {string} book
 * @returns {number}
 */
export function getTuneIndexForBook(tune, book) {
  const entry = getTuneBookPage(tune, book)
  return entry && entry.tuneIndex > 0 ? entry.tuneIndex : 0
}

/**
 * Merge one book's page entry onto the tune (does not mutate other books).
 * @param {object} tune
 * @param {string} book
 * @param {number|string} page
 * @param {number|string} [tuneIndex]
 * @returns {object} new tune object
 */
export function setTuneBookPage(tune, book, page, tuneIndex) {
  const next = Object.assign({}, tune || {})
  const bookKey = normalizeBookKey(book)
  const pageNum = parseInt(page, 10)
  if (!bookKey || !(pageNum > 0)) return next
  const indexNum = parseInt(tuneIndex, 10)
  const prev = next.bookPages && typeof next.bookPages === 'object' && !Array.isArray(next.bookPages)
    ? Object.assign({}, next.bookPages)
    : {}
  prev[bookKey] = {
    page: pageNum,
    tuneIndex: indexNum > 0 ? indexNum : 0,
  }
  next.bookPages = prev
  return next
}

function compareTuneNames(a, b) {
  const nameA = a && a.name ? String(a.name).toLowerCase().trim() : ''
  const nameB = b && b.name ? String(b.name).toLowerCase().trim() : ''
  if (nameA < nameB) return -1
  if (nameA > nameB) return 1
  return 0
}

/**
 * Sort by page, then tuneIndex, then name for the given book.
 * Tunes without a page for that book sort after numbered ones.
 * @param {object[]} tunes
 * @param {string} book
 * @returns {object[]}
 */
export function sortTunesByBookPage(tunes, book) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  const bookKey = normalizeBookKey(book)
  list.sort(function(a, b) {
    const pageA = getTunePageForBook(a, bookKey)
    const pageB = getTunePageForBook(b, bookKey)
    const hasA = pageA > 0
    const hasB = pageB > 0
    if (hasA && !hasB) return -1
    if (!hasA && hasB) return 1
    if (hasA && hasB && pageA !== pageB) return pageA - pageB
    const indexA = getTuneIndexForBook(a, bookKey)
    const indexB = getTuneIndexForBook(b, bookKey)
    if (indexA !== indexB) return indexA - indexB
    return compareTuneNames(a, b)
  })
  return list
}
