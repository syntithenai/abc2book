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
    navigate('/tunes')
    return true
  }

  if (params.scope === 'book' && params.bookName) {
    if (setTagFilter) setTagFilter([])
    if (setFilter) setFilter('')
    if (setCurrentTuneBook) setCurrentTuneBook(params.bookName)
    navigate('/tunes')
    return true
  }

  if (params.scope === 'tag' && params.tagName) {
    if (setTagFilter) setTagFilter([params.tagName])
    if (setFilter) setFilter('')
    if (setCurrentTuneBook) setCurrentTuneBook('')
    navigate('/tunes')
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
    navigate('/tunes')
    return true
  }
  navigate('/books')
  return true
}
