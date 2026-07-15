import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { discoverRecordingArtists, discoverWorkWritersWithProminence } from './recordingArtistsClient'
import { parseTitleComposerHints } from './composerDiscoveryUtils'

const COMPOSER_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function normalizeComposerRole(role) {
  const value = typeof role === 'string' ? role.trim().toLowerCase() : ''
  return value === 'writer' ? 'writer' : (value === 'performer' ? 'performer' : '')
}

function normalizeSingleComposerResult(body) {
  const artist = typeof body.artist === 'string' ? body.artist.trim() : ''
  if (!artist) {
    throw new Error('Artist search returned no artist')
  }
  const role = normalizeComposerRole(body.role)
  return {
    artist: artist,
    role: role,
    source: typeof body.source === 'string' ? body.source : '',
    preview: typeof body.preview === 'string' ? body.preview : artist,
  }
}

function attachComposerMeta(body, result) {
  const suggestedTitle = body && typeof body.suggestedTitle === 'string'
    ? body.suggestedTitle.trim()
    : ''
  if (suggestedTitle) {
    result.suggestedTitle = suggestedTitle
  }
  return result
}

export function normalizeComposerSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid artist search response')
  }
  if (body.error) {
    throw new Error(body.error)
  }
  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleComposerResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Artist search returned no candidates')
    }
    return attachComposerMeta(body, {
      multiple: true,
      candidates: candidates,
    })
  }
  return attachComposerMeta(body, Object.assign({ multiple: false }, normalizeSingleComposerResult(body)))
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
    throw new Error(event.message || 'Artist search failed')
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
    throw new Error('Resolver returned an unreadable artist search response')
  }
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Artist search failed')
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
  throw new Error('Artist search stream ended without a result')
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
    onProgress('Starting artist search...', 0, 'start')
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
  const workResult = await discoverWorkWritersWithProminence({
    title: hints.title,
    signal: options.signal,
    maxWriters: 6,
  })
  const writers = (workResult && workResult.writers) || []
  const suggestedTitle = workResult && workResult.suggestedTitle
    ? String(workResult.suggestedTitle).trim()
    : ''
  const performers = await discoverRecordingArtists({
    title: hints.title,
    artist: hints.artistHint,
    signal: options.signal,
    maxArtists: 8,
  })
  const seen = {}
  const candidates = []
  function add(name, role, source, preview) {
    const artist = String(name || '').trim()
    if (!artist) return
    const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (!key || seen[key]) {
      if (seen[key] && seen[key].role !== 'writer' && role === 'writer') {
        seen[key].role = 'writer'
        seen[key].source = source
        seen[key].preview = preview
      }
      return
    }
    const entry = {
      artist: artist,
      role: role,
      source: source,
      preview: preview,
    }
    seen[key] = entry
    candidates.push(entry)
  }
  writers.forEach(function(name) {
    add(name, 'writer', 'Writer · MusicBrainz', 'Writer of this song')
  })
  if (hints.artistHint) {
    add(hints.artistHint, 'performer', 'Performer · title hint', 'Performer of this song')
  }
  performers.forEach(function(name) {
    add(name, 'performer', 'Performer · MusicBrainz', 'Performer of this song')
  })
  // Keep writers first after any role upgrades.
  candidates.sort(function(a, b) {
    if (a.role === b.role) return 0
    return a.role === 'writer' ? -1 : 1
  })
  if (!candidates.length) {
    throw new Error('No artist found')
  }
  if (candidates.length === 1) {
    return attachComposerMeta(
      { suggestedTitle: suggestedTitle },
      Object.assign({ multiple: false }, candidates[0])
    )
  }
  return attachComposerMeta(
    { suggestedTitle: suggestedTitle },
    {
      multiple: true,
      candidates: candidates,
    }
  )
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
