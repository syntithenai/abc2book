import { parseNdjsonLine } from './ndjsonParse'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { handleLyricsSearchStreamEvent, normalizeLyricsSearch } from './lyricsSearchNormalize'
import { searchLyricsLight } from './lyricsSearchLight'

export { normalizeLyricsSearch, handleLyricsSearchStreamEvent } from './lyricsSearchNormalize'

const LYRICS_ACCEPT_HEADER = 'application/x-ndjson, application/json'

async function parseLyricsSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable lyrics search response')
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Lyrics search failed')
  }

  return normalizeLyricsSearch(body)
}

async function parseStreamingLyricsSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseLyricsSearchResponse(response)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseLyricsSearchResponse(response)
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      const parsed = handleLyricsSearchStreamEvent(parseNdjsonLine(line), onProgress)
      if (parsed) result = parsed
    }
  }

  if (buffer.trim()) {
    const parsed = handleLyricsSearchStreamEvent(parseNdjsonLine(buffer), onProgress)
    if (parsed) result = parsed
  }

  if (!result) {
    throw new Error('Lyrics search stream ended without a result')
  }
  return result
}

async function parseSearchResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingLyricsSearchResponse(response, onProgress)
  }
  return parseLyricsSearchResponse(response)
}

export async function searchLyricsViaResolver(options) {
  const {
    title,
    artist,
    url,
    accessToken,
    signal,
    onProgress,
  } = options

  if (!url && !(title && String(title).trim())) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting lyrics search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/search-lyrics', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      url: url || '',
    }),
    signal: signal,
    headers: {
      Accept: LYRICS_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  return parseSearchResponse(response, onProgress)
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

export async function searchLyrics(options) {
  const opts = options || {}

  if (opts.url) {
    return searchLyricsViaResolver(opts)
  }

  const useResolver = shouldUseResolver(opts)

  if (useResolver) {
    try {
      return await searchLyricsViaResolver(opts)
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }

  return searchLyricsLight(opts)
}
