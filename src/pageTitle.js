import { useEffect } from 'react'

export const DEFAULT_APP_TITLE = 'Tune Book'
export const SEARCH_PAGE_TITLE_BASE = 'Tunebook Search'
export const PRACTICE_PAGE_TITLE_BASE = 'Practice'

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

export function getFirstGenreFilter(genreFilter) {
  if (!Array.isArray(genreFilter) || genreFilter.length === 0) {
    return null
  }
  const genre = String(genreFilter[0]).trim()
  return genre.length > 0 ? genre : null
}

export function getFirstArtistFilter(artistFilter) {
  if (!Array.isArray(artistFilter) || artistFilter.length === 0) {
    return null
  }
  const artist = String(artistFilter[0]).trim()
  return artist.length > 0 ? artist : null
}

export function buildSearchPageTitle(currentTuneBook, tagFilter, genreFilter, artistFilter, baseTitle) {
  const base = (baseTitle && String(baseTitle).trim()) ? String(baseTitle).trim() : SEARCH_PAGE_TITLE_BASE
  const book = getActiveBookFilter(currentTuneBook)
  if (book) {
    return `${base} – ${book}`
  }
  const tag = getFirstTagFilter(tagFilter)
  if (tag) {
    return `${base} – ${tag}`
  }
  const genre = getFirstGenreFilter(genreFilter)
  if (genre) {
    return `${base} – ${genre}`
  }
  const artist = getFirstArtistFilter(artistFilter)
  if (artist) {
    return `${base} – ${artist}`
  }
  return base
}

export function buildSingleTuneTitle(tuneName) {
  if (tuneName && String(tuneName).trim()) {
    return String(tuneName).trim()
  }
  return DEFAULT_APP_TITLE
}

/**
 * Document title for Sets / Gig routes.
 * @param {{ gigPickerMode?: boolean, gigMode?: boolean, setName?: string, tuneName?: string }} options
 */
export function buildSetsPageTitle(options) {
  const opts = options || {}
  const setName = opts.setName && String(opts.setName).trim() ? String(opts.setName).trim() : ''
  const tuneName = opts.tuneName && String(opts.tuneName).trim() ? String(opts.tuneName).trim() : ''

  if (opts.gigPickerMode) {
    return 'Gig'
  }
  if (opts.gigMode) {
    if (setName && tuneName) {
      return 'Gig – ' + setName + ' – ' + tuneName
    }
    if (setName) {
      return 'Gig – ' + setName
    }
    return 'Gig'
  }
  if (setName) {
    return setName
  }
  return 'Performance sets'
}

export function setDocumentTitle(title) {
  if (typeof document !== 'undefined' && title) {
    document.title = title
  }
}

/**
 * Set document.title while mounted; restore DEFAULT_APP_TITLE on unmount or when title clears.
 */
export function useDocumentTitle(title) {
  useEffect(function() {
    const next = title && String(title).trim() ? String(title).trim() : DEFAULT_APP_TITLE
    setDocumentTitle(next)
    return function() {
      setDocumentTitle(DEFAULT_APP_TITLE)
    }
  }, [title])
}
