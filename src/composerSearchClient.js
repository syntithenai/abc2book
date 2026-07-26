import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import {
  BIBLIO_CONFIDENCE_HIGH,
  BIBLIO_CONFIDENCE_LOW,
  BIBLIO_CONFIDENCE_MEDIUM,
  downgradeConfidence,
  isAmbiguousTitle,
  pickProminentWriter,
  scoreRecordingTitleMatch,
} from './bibliographicSearchUtils'
import { resolveArtistMbid } from './artistDiscographyClient'
import {
  discoverRecordingArtists,
  discoverWorkWritersWithProminence,
  isGenericArtist,
  normalizeArtistKey,
  searchRecordingsScoped,
} from './recordingArtistsClient'
import { parseTitleComposerHints, prioritizeTraditionalComposerCandidates } from './composerDiscoveryUtils'

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
    confidence: typeof body.confidence === 'string' ? body.confidence : '',
    matchType: typeof body.matchType === 'string' ? body.matchType : '',
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
    const candidates = prioritizeTraditionalComposerCandidates(
      body.candidates.map(function(candidate) {
        return normalizeSingleComposerResult(candidate)
      })
    )
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
  const ambiguousTitle = isAmbiguousTitle(hints.title)
  const workResult = await discoverWorkWritersWithProminence({
    title: hints.title,
    signal: options.signal,
    maxWriters: 6,
  })
  const writers = (workResult && workResult.writers) || []
  const prominentWriter = pickProminentWriter(writers)
  const suggestedTitle = workResult && workResult.suggestedTitle
    ? String(workResult.suggestedTitle).trim()
    : ''

  const seen = {}
  const candidates = []
  function add(name, role, source, preview, confidence, matchType) {
    const artist = String(name || '').trim()
    if (!artist || isGenericArtist(artist)) return
    const key = artist.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (!key) return
    const normalizedRole = role === 'writer' || role === 'performer' ? role : ''
    const entry = {
      artist: artist,
      role: normalizedRole,
      source: source,
      preview: preview,
      confidence: confidence || BIBLIO_CONFIDENCE_MEDIUM,
      matchType: matchType || '',
    }
    if (seen[key]) {
      const existing = seen[key]
      if (existing.role !== 'writer' && normalizedRole === 'writer') {
        existing.role = 'writer'
        existing.source = source
        existing.preview = preview
        existing.confidence = confidence || existing.confidence
        existing.matchType = matchType || existing.matchType
      }
      return
    }
    seen[key] = entry
    candidates.push(entry)
  }

  function composerMatchesWriter(writerName) {
    const hint = hints.artistHint || options.artist || ''
    if (!hint || isGenericArtist(hint)) return false
    return normalizeArtistKey(hint) === normalizeArtistKey(writerName)
  }

  writers.forEach(function(writer) {
    const name = typeof writer === 'string' ? writer : writer.artist
    if (!name) return
    let confidence = BIBLIO_CONFIDENCE_MEDIUM
    if (prominentWriter && normalizeArtistKey(prominentWriter.artist) === normalizeArtistKey(name)) {
      confidence = BIBLIO_CONFIDENCE_HIGH
    }
    if (composerMatchesWriter(name)) {
      confidence = BIBLIO_CONFIDENCE_HIGH
    }
    confidence = downgradeConfidence(confidence, ambiguousTitle && !composerMatchesWriter(name))
    add(
      name,
      'writer',
      'Writer · MusicBrainz',
      'Writer of this song',
      confidence,
      'Work · writer'
    )
  })

  let hasStrongPerformer = false
  const hint = hints.artistHint || ''
  if (hint && !isGenericArtist(hint)) {
    const resolved = await resolveArtistMbid(hint, options.signal)
    if (resolved && resolved.id) {
      const scoped = await searchRecordingsScoped(hints.title, resolved.id, {
        signal: options.signal,
        limit: 15,
      })
      scoped.forEach(function(recording) {
        const titleScore = scoreRecordingTitleMatch(recording, hints.title)
        if (titleScore < 70) return
        hasStrongPerformer = hasStrongPerformer || titleScore === 100
        let confidence = titleScore === 100 ? BIBLIO_CONFIDENCE_HIGH : BIBLIO_CONFIDENCE_MEDIUM
        confidence = downgradeConfidence(confidence, ambiguousTitle)
        add(
          hint,
          'performer',
          'Performer · scoped search',
          'Performer of this song',
          confidence,
          'Artist match'
        )
      })
    }
    if (!hasStrongPerformer) {
      let confidence = BIBLIO_CONFIDENCE_MEDIUM
      confidence = downgradeConfidence(confidence, ambiguousTitle)
      add(
        hint,
        'performer',
        'Performer · title hint',
        'Performer of this song',
        confidence,
        'Title hint'
      )
    }
  }

  if (!hasStrongPerformer) {
    const performers = await discoverRecordingArtists({
      title: hints.title,
      artist: hints.artistHint,
      signal: options.signal,
      maxArtists: 20,
    })
    performers.forEach(function(name) {
      if (hint && normalizeArtistKey(name) === normalizeArtistKey(hint)) return
      let confidence = BIBLIO_CONFIDENCE_LOW
      confidence = downgradeConfidence(confidence, ambiguousTitle)
      add(
        name,
        'performer',
        'Performer · MusicBrainz',
        'Performer of this song',
        confidence,
        ambiguousTitle ? 'Possible homonym' : 'Title match'
      )
    })
  }

  candidates.sort(function(a, b) {
    if (a.role === b.role) return 0
    return a.role === 'writer' ? -1 : 1
  })
  const orderedCandidates = prioritizeTraditionalComposerCandidates(candidates)
  if (!orderedCandidates.length) {
    throw new Error('No artist found')
  }
  if (orderedCandidates.length === 1) {
    return attachComposerMeta(
      { suggestedTitle: suggestedTitle },
      Object.assign({ multiple: false }, orderedCandidates[0])
    )
  }
  return attachComposerMeta(
    { suggestedTitle: suggestedTitle },
    {
      multiple: true,
      candidates: orderedCandidates,
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
