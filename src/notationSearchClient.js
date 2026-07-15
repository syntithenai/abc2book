import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import {
  extractNotationSearchUrl,
  handleNotationSearchStreamEvent,
  normalizeNotationSearch,
} from './notationSearchNormalize'
import { searchNotationLight } from './notationSearchLight'

export {
  normalizeNotationSearch,
  handleNotationSearchStreamEvent,
  extractNotationSearchUrl,
} from './notationSearchNormalize'

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
    url,
    accessToken,
    signal,
    onProgress,
  } = options

  const pageUrl = url || extractNotationSearchUrl(title)
  if (!(pageUrl || (title && String(title).trim()))) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress(
      pageUrl
        ? (/(\.mid|\.midi)(\?|$)/i.test(pageUrl)
          ? 'Fetching MIDI file...'
          : 'Fetching MuseScore score...')
        : 'Starting notation search...',
      0,
      'start'
    )
  }

  const payload = pageUrl
    ? { url: pageUrl }
    : {
      title: title || '',
      artist: artist || '',
      songType: songType || 'instrumental',
    }

  const response = await fetchViaMediaProxy('/search-notation', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
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
  const pageUrl = opts.url || extractNotationSearchUrl(opts.title)
  const useResolver = shouldUseResolver(opts)

  // MuseScore / MIDI URL import requires the media resolver.
  if (pageUrl) {
    if (!useResolver) {
      throw new Error(
        'URL notation import needs the media resolver. '
        + 'Or export MusicXML/.mxl (or a MIDI file) and use Score file import.'
      )
    }
    try {
      return await searchNotationViaResolver(Object.assign({}, opts, { url: pageUrl }))
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
      throw new Error(
        'Could not reach the media resolver to import that URL. '
        + 'Export MusicXML/.mxl or MIDI and use Score file import, or retry when the resolver is available.'
      )
    }
  }

  if (useResolver) {
    try {
      return await searchNotationViaResolver(opts)
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }

  return searchNotationLight(opts)
}
