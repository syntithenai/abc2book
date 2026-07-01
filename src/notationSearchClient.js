import { fetchViaMediaProxy } from './mediaProxyClient'

const NOTATION_ACCEPT_HEADER = 'application/x-ndjson'

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

async function parseNotationSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable notation search response')
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Notation search failed')
  }

  return normalizeNotationSearch(body)
}

async function parseStreamingNotationSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseNotationSearchResponse(response)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseNotationSearchResponse(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    lines.forEach(function(line) {
      if (!line.trim()) return
      const parsed = handleNotationSearchStreamEvent(JSON.parse(line), onProgress)
      if (parsed) result = parsed
    })
  }

  if (buffer.trim()) {
    const parsed = handleNotationSearchStreamEvent(JSON.parse(buffer), onProgress)
    if (parsed) result = parsed
  }

  if (!result) {
    throw new Error('Notation search stream ended without a result')
  }
  return result
}

export async function searchNotation(options) {
  const {
    title,
    artist,
    songType,
    accessToken,
    signal,
    onProgress,
  } = options

  if (!(title && String(title).trim())) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting notation search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/search-notation', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      songType: songType || 'instrumental',
    }),
    signal: signal,
    headers: {
      Accept: NOTATION_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  return parseStreamingNotationSearchResponse(response, onProgress)
}
