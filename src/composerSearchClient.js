import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { discoverRecordingArtists } from './recordingArtistsClient'
import { parseTitleComposerHints } from './composerDiscoveryUtils'

const COMPOSER_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function normalizeSingleComposerResult(body) {
  const artist = typeof body.artist === 'string' ? body.artist.trim() : ''
  if (!artist) {
    throw new Error('Composer search returned no artist')
  }
  return {
    artist: artist,
    source: typeof body.source === 'string' ? body.source : '',
    preview: typeof body.preview === 'string' ? body.preview : artist,
  }
}

export function normalizeComposerSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid composer search response')
  }
  if (body.error) {
    throw new Error(body.error)
  }
  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleComposerResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Composer search returned no candidates')
    }
    return {
      multiple: true,
      candidates: candidates,
    }
  }
  return Object.assign({ multiple: false }, normalizeSingleComposerResult(body))
}

export function handleComposerSearchStreamEvent(event, onProgress) {
  if (!event || typeof event !== 'object') return null
  if (event.type === 'progress') {
    if (typeof onProgress === 'function') {
      onProgress(event.message || '', event.progress, event.stage || '')
    }
    return null
  }
  if (event.type === 'error') {
    throw new Error(event.message || 'Composer search failed')
  }
  if (event.type === 'result') {
    return normalizeComposerSearch(event.body)
  }
  return null
}

async function parseComposerSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable composer search response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Composer search failed')
  }
  return normalizeComposerSearch(body)
}

async function parseStreamingComposerSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseComposerSearchResponse(response)
  }
  const reader = response.body && response.body.getReader
    ? response.body.getReader()
    : null
  if (!reader) {
    return parseComposerSearchResponse(response)
  }
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (!line) continue
      const event = JSON.parse(line)
      const result = handleComposerSearchStreamEvent(event, onProgress)
      if (result) return result
    }
  }
  throw new Error('Composer search stream ended without a result')
}

export async function discoverComposersViaResolver(options) {
  const {
    title,
    artist,
    titleHint,
    accessToken,
    signal,
    onProgress,
  } = options

  const hints = parseTitleComposerHints(title, artist, titleHint)
  if (!hints.title) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting composer search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/discover-composer', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: hints.title,
      artist: hints.artistHint || artist || '',
      titleHint: hints.titleHint || '',
    }),
    signal: signal,
    headers: {
      Accept: COMPOSER_ACCEPT_HEADER,
      'Content-Type': 'application/json',
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingComposerSearchResponse(response, onProgress)
  }
  return parseComposerSearchResponse(response)
}

async function discoverComposersLight(options) {
  const hints = parseTitleComposerHints(options.title, options.artist, options.titleHint)
  if (!hints.title) {
    throw new Error('Song title is required')
  }
  const artists = await discoverRecordingArtists({
    title: hints.title,
    artist: hints.artistHint,
    signal: options.signal,
    maxArtists: 8,
  })
  if (!artists.length) {
    throw new Error('No composer or recording artist found')
  }
  if (artists.length === 1) {
    return {
      multiple: false,
      artist: artists[0],
      source: 'MusicBrainz',
      preview: artists[0],
    }
  }
  return {
    multiple: true,
    candidates: artists.map(function(name) {
      return {
        artist: name,
        source: 'MusicBrainz',
        preview: name,
      }
    }),
  }
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

export async function discoverComposers(options) {
  const opts = options || {}
  const useResolver = shouldUseResolver(opts)
  if (useResolver) {
    try {
      return await discoverComposersViaResolver(opts)
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }
  return discoverComposersLight(opts)
}
