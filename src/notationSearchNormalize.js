function hostFromUrl(url) {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

function normalizeManualCandidate(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const url = typeof item.url === 'string' ? item.url : ''
  const host = typeof item.host === 'string' && item.host
    ? item.host
    : hostFromUrl(url)
  return {
    url: url,
    title: typeof item.title === 'string' ? item.title : '',
    source: typeof item.source === 'string' && item.source ? item.source : host,
    host: host,
    reason: typeof item.reason === 'string' ? item.reason : '',
    contentType: typeof item.contentType === 'string' ? item.contentType : 'notation',
  }
}

function normalizeManualCandidates(list) {
  if (!Array.isArray(list)) return []
  return list.map(normalizeManualCandidate).filter(function(item) {
    return !!item.url
  })
}

function isEmptyManualResult(body) {
  if (!body || typeof body !== 'object') return false
  if (body.empty === true) return true
  return body.found === false && Array.isArray(body.manualCandidates)
}

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

  if (isEmptyManualResult(body)) {
    return {
      multiple: false,
      empty: true,
      found: false,
      manualCandidates: normalizeManualCandidates(body.manualCandidates),
    }
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
