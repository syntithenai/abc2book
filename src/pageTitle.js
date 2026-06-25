export const DEFAULT_APP_TITLE = 'Tune Book'

export function getActiveBookFilter(currentTuneBook) {
  if (currentTuneBook === null || currentTuneBook === undefined || currentTuneBook === 0) {
    return null
  }
  const book = String(currentTuneBook).trim()
  return book.length > 0 ? book : null
}

export function getFirstTagFilter(tagFilter) {
  if (!Array.isArray(tagFilter) || tagFilter.length === 0) {
    return null
  }
  const tag = String(tagFilter[0]).trim()
  return tag.length > 0 ? tag : null
}

export function buildSearchPageTitle(currentTuneBook, tagFilter) {
  const base = 'Tunebook Search'
  const book = getActiveBookFilter(currentTuneBook)
  if (book) {
    return `${base} – ${book}`
  }
  const tag = getFirstTagFilter(tagFilter)
  if (tag) {
    return `${base} – ${tag}`
  }
  return base
}

export function buildSingleTuneTitle(tuneName) {
  if (tuneName && String(tuneName).trim()) {
    return String(tuneName).trim()
  }
  return DEFAULT_APP_TITLE
}

export function setDocumentTitle(title) {
  if (typeof document !== 'undefined' && title) {
    document.title = title
  }
}
