function normalizeSingleNotationResult(body) {
  const abc = typeof body.abc === 'string' ? body.abc.trim() : ''
  if (!abc || abc.indexOf('K:') === -1) {
    throw new Error('Notation search returned no usable ABC')
  }

  const tuneMeta = body.tuneMeta && typeof body.tuneMeta === 'object' ? body.tuneMeta : null

  return {
    abc: abc,
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string'
      ? body.title
      : (tuneMeta && tuneMeta.name ? String(tuneMeta.name) : ''),
    artist: typeof body.artist === 'string'
      ? body.artist
      : (tuneMeta && tuneMeta.composer ? String(tuneMeta.composer) : ''),
    preview: typeof body.preview === 'string' ? body.preview : '',
    titleOnly: body.titleOnly === true,
    tuneMeta: tuneMeta,
  }
}

export function normalizeNotationSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid notation search response')
  }

  if (body.error) {
    throw new Error(body.error)
  }

  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleNotationResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Notation search returned no candidates')
    }
    return {
      multiple: true,
      candidates: candidates,
    }
  }

  return Object.assign({ multiple: false }, normalizeSingleNotationResult(body))
}

export function handleNotationSearchStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(
        event.message || '',
        event.progress,
        event.stage || ''
      )
    }
    return null
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Notation search failed')
  }
  if (event.type === 'result') {
    return normalizeNotationSearch(event.body)
  }
  return null
}
