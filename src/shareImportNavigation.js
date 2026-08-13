import { buildSearchFilterParams } from './searchFilterParams'
import { buildPathWithSearch } from './routeSyncUtils'

export function buildNavigateAfterImport(scope, details) {
  const d = details || {}
  return {
    scope: scope,
    tuneId: d.tuneId || null,
    bookName: d.bookName || null,
    setId: d.setId || null,
    playlistId: d.playlistId || null,
    tagName: d.tagName || null,
  }
}

/**
 * Build scope payload for curated / importlink routes from route params.
 */
export function buildImportLinkNavigateAfterImport(routeParams) {
  const params = routeParams || {}
  if (params.tuneId) {
    return buildNavigateAfterImport('tune', { tuneId: params.tuneId })
  }
  if (params.tagName) {
    return buildNavigateAfterImport('tag', {
      bookName: params.bookName || null,
      tagName: params.tagName,
    })
  }
  if (params.bookName) {
    return buildNavigateAfterImport('book', { bookName: params.bookName })
  }
  return buildNavigateAfterImport('all')
}

/**
 * Apply list filters to state and navigate to /tunes with matching query params.
 */
export function navigateToFilteredTuneList(navigate, filterState, helpers) {
  const state = filterState || {}
  const setCurrentTuneBook = helpers && helpers.setCurrentTuneBook
  const setTagFilter = helpers && helpers.setTagFilter
  const setFilter = helpers && helpers.setFilter

  const bookName = state.bookName || ''
  const tagName = state.tagName || null
  const tagFilter = tagName ? [tagName] : []

  if (setFilter) setFilter('')
  if (setTagFilter) setTagFilter(tagFilter)
  if (setCurrentTuneBook) setCurrentTuneBook(bookName)

  const urlParams = buildSearchFilterParams({
    currentTuneBook: bookName,
    tagFilter: tagFilter,
    filter: '',
  })
  navigate(buildPathWithSearch('/tunes', null, urlParams))
}

export function applyShareImportNavigation(navigateAfterImport, helpers) {
  const params = navigateAfterImport || {}
  const navigate = helpers && helpers.navigate
  const setCurrentTuneBook = helpers && helpers.setCurrentTuneBook
  const setTagFilter = helpers && helpers.setTagFilter
  const setFilter = helpers && helpers.setFilter

  if (!navigate || !params.scope) return false

  if (params.scope === 'tune' && params.tuneId) {
    navigate('/tunes/' + encodeURIComponent(params.tuneId))
    return true
  }

  if (params.scope === 'set' && params.setId) {
    navigate('/sets/' + encodeURIComponent(params.setId))
    return true
  }

  if (params.scope === 'playlist' && params.playlistId) {
    navigateToFilteredTuneList(navigate, {}, { setCurrentTuneBook, setTagFilter, setFilter })
    return true
  }

  if (params.scope === 'book' && params.bookName) {
    navigateToFilteredTuneList(navigate, {
      bookName: params.bookName,
    }, { setCurrentTuneBook, setTagFilter, setFilter })
    return true
  }

  if (params.scope === 'tag' && params.tagName) {
    navigateToFilteredTuneList(navigate, {
      bookName: params.bookName || '',
      tagName: params.tagName,
    }, { setCurrentTuneBook, setTagFilter, setFilter })
    return true
  }

  if (params.scope === 'all') {
    if (setTagFilter) setTagFilter([])
    if (setFilter) setFilter('')
    if (setCurrentTuneBook) setCurrentTuneBook('')
    navigate('/books')
    return true
  }

  return false
}

export function handleImportNavigation(navigateAfterImport, helpers, legacyAutoplay) {
  if (applyShareImportNavigation(navigateAfterImport, helpers)) {
    return true
  }

  const params = navigateAfterImport || {}
  const navigate = helpers.navigate
  const tunebook = helpers.tunebook
  const tunes = helpers.tunes
  const setCurrentTuneBook = helpers.setCurrentTuneBook
  const setTagFilter = helpers.setTagFilter
  const setFilter = helpers.setFilter

  if (legacyAutoplay && params.autoplay && tunes) {
    if (params.tuneId) {
      navigate('/tunes/' + params.tuneId + '/playMedia')
      return true
    }
    const firstTuneId = tunebook.fillMediaPlaylist(
      params.bookName,
      '',
      params.tagName && params.tagName.trim() ? [params.tagName] : [],
      tunes
    )
    navigate('/tunes' + (firstTuneId ? '/' + firstTuneId + '/playMedia' : ''))
    return true
  }

  if (params.tuneId) {
    navigate('/tunes/' + params.tuneId + (params.autoplay ? '/playMedia' : ''))
    return true
  }
  if (params.bookName || params.tagName) {
    navigateToFilteredTuneList(navigate, {
      bookName: params.bookName || '',
      tagName: params.tagName || null,
    }, { setCurrentTuneBook, setTagFilter, setFilter })
    return true
  }
  navigate('/books')
  return true
}
