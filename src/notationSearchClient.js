import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { handleNotationSearchStreamEvent, normalizeNotationSearch } from './notationSearchNormalize'
import { searchNotationLight } from './notationSearchLight'

export { normalizeNotationSearch, handleNotationSearchStreamEvent } from './notationSearchNormalize'

const NOTATION_ACCEPT_HEADER = 'application/x-ndjson'

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

export async function searchNotationViaResolver(options) {
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

function shouldUseResolver(options) {
  if (options && options.forceLightweight) return false
  if (options && options.forceResolver) return true
  if (options && options.resolverAvailable === false) return false
  if (options && options.resolverAvailable === true) return true
  if (!isMediaProxyConfigured()) return false
  const health = getMediaResolverHealthState()
  if (health && health.checked) return !!health.available
  return true
}

export async function searchNotation(options) {
  const opts = options || {}
  const useResolver = shouldUseResolver(opts)

  if (useResolver) {
    try {
      return await searchNotationViaResolver(opts)
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }

  return searchNotationLight(opts)
}
