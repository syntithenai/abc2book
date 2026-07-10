import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { buildChordSheetAlignmentFromLines, sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils'
import { searchChordsLight } from './chordsSearchLight'

const CHORDS_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function normalizeSingleChordsResult(body) {
  const sheetLines = Array.isArray(body.sheetLines)
    ? body.sheetLines.map(function(line) { return String(line) })
    : []
  if (sheetLines.length === 0) {
    throw new Error('Chords search returned no chord sheet')
  }

  const chordText = sheetLinesToWizardChords(sheetLines)
  if (!chordText.trim()) {
    throw new Error('Chords search returned no usable chord lines')
  }

  const lyricLines = sheetLinesToLyricLines(sheetLines)
  const chordSheetAlignment = buildChordSheetAlignmentFromLines(sheetLines)

  return {
    sheetLines: sheetLines,
    chordText: chordText,
    lyricLines: lyricLines,
    lyricText: lyricLines.join('\n'),
    chordSheetAlignment: chordSheetAlignment,
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string' ? body.title : '',
    artist: typeof body.artist === 'string' ? body.artist : '',
    preview: typeof body.preview === 'string' ? body.preview : '',
    titleOnly: body.titleOnly === true,
  }
}

export function normalizeChordsSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid chords search response')
  }

  if (body.error) {
    throw new Error(body.error)
  }

  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleChordsResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Chords search returned no candidates')
    }
    return {
      multiple: true,
      candidates: candidates,
    }
  }

  return Object.assign({ multiple: false }, normalizeSingleChordsResult(body))
}

export function handleChordsSearchStreamEvent(event, onProgress) {
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
    throw new Error(event.message || 'Chords search failed')
  }
  if (event.type === 'result') {
    return normalizeChordsSearch(event.body)
  }
  return null
}

async function parseChordsSearchResponse(response) {
  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable chords search response')
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Chords search failed')
  }

  return normalizeChordsSearch(body)
}

async function parseStreamingChordsSearchResponse(response, onProgress) {
  if (!response.ok) {
    return parseChordsSearchResponse(response)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    return parseChordsSearchResponse(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  function processLine(line) {
    if (!line.trim()) return
    const parsed = handleChordsSearchStreamEvent(JSON.parse(line), onProgress)
    if (parsed) result = parsed
  }

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (let i = 0; i < lines.length; i++) {
      processLine(lines[i])
    }
  }

  if (buffer.trim()) {
    processLine(buffer)
  }

  if (!result) {
    throw new Error('Chords search stream ended without a result')
  }
  return result
}

async function parseSearchResponse(response, onProgress) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.indexOf('application/x-ndjson') >= 0) {
    return parseStreamingChordsSearchResponse(response, onProgress)
  }
  return parseChordsSearchResponse(response)
}

export async function searchChordsViaResolver(options) {
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
    onProgress('Starting chords search...', 0, 'start')
  }

  const response = await fetchViaMediaProxy('/search-chords', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: title || '',
      artist: artist || '',
      url: url || '',
    }),
    signal: signal,
    headers: {
      Accept: CHORDS_ACCEPT_HEADER,
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

export async function searchChords(options) {
  const opts = options || {}

  if (opts.url) {
    return searchChordsViaResolver(opts)
  }

  const useResolver = shouldUseResolver(opts)

  if (useResolver) {
    try {
      return await searchChordsViaResolver(opts)
    } catch (err) {
      if (!isMediaResolverInfrastructureError(err)) throw err
    }
  }

  return searchChordsLight(opts)
}
