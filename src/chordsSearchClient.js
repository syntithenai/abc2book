import { parseNdjsonLine } from './ndjsonParse'
import { fetchViaMediaProxy, isMediaProxyConfigured, isMediaResolverInfrastructureError } from './mediaProxyClient'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import { buildChordSheetAlignmentFromLines, sheetLinesToEmbeddedLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils'
import { linesHaveChordProInlineChords, hasChordLines } from './chordSheetUtils'
import { searchChordsLight } from './chordsSearchLight'
import {
  fetchPageHtmlViaExtension,
  isUltimateGuitarPageUrl,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient'

const CHORDS_ACCEPT_HEADER = 'application/x-ndjson, application/json'

function hostFromUrl(url) {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

function isUltimateGuitarSource(source, sourceUrl) {
  const haystack = [source, sourceUrl].map(function(part) {
    return String(part || '').toLowerCase()
  }).join(' ')
  return haystack.indexOf('ultimate-guitar') >= 0
}

function lyricLinesFromCandidate(candidate) {
  if (!candidate) return []
  if (Array.isArray(candidate.lyricLines)) return candidate.lyricLines
  if (Array.isArray(candidate.sheetLines)) return candidate.sheetLines
  return []
}

/**
 * Soft preference only — never drops candidates.
 * 0 = ChordPro / other inline markers, 1 = chords-over-words, 2 = plain.
 */
export function chordsCandidateInlineRank(candidate) {
  const lines = lyricLinesFromCandidate(candidate)
  if (linesHaveChordProInlineChords(lines)) return 0
  if (hasChordLines(lines)) return 1
  return 2
}

/**
 * Soft-sort: inline ChordPro first, then chords-over-words, then plain.
 * Within a tier, Ultimate Guitar edges ahead. All candidates remain visible.
 */
export function sortChordsCandidatesPreferInline(candidates) {
  const list = Array.isArray(candidates) ? candidates.slice() : []
  return list.sort(function(a, b) {
    const rankDiff = chordsCandidateInlineRank(a) - chordsCandidateInlineRank(b)
    if (rankDiff !== 0) return rankDiff
    const aUg = isUltimateGuitarSource(a && a.source, a && a.sourceUrl) ? 0 : 1
    const bUg = isUltimateGuitarSource(b && b.source, b && b.sourceUrl) ? 0 : 1
    return aUg - bUg
  })
}

/** @deprecated Use sortChordsCandidatesPreferInline */
export function sortChordsCandidatesPreferUltimateGuitar(candidates) {
  return sortChordsCandidatesPreferInline(candidates)
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
    contentType: typeof item.contentType === 'string' ? item.contentType : 'chords',
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

function normalizeSingleChordsResult(body) {
  const sheetLines = Array.isArray(body.sheetLines)
    ? body.sheetLines.map(function(line) { return String(line) })
    : []
  if (sheetLines.length === 0) {
    throw new Error('Chords search returned no chord sheet')
  }

  const lyricLines = sheetLinesToEmbeddedLyricLines(sheetLines)
  let chordText = ''
  try {
    chordText = sheetLinesToWizardChords(sheetLines) || ''
  } catch (e) {
    chordText = ''
  }
  // ChordPro-only sheets may not yield a wizard chord grid; lyric lines still count.
  if (!String(chordText).trim()
    && !linesHaveChordProInlineChords(lyricLines)
    && !hasChordLines(sheetLines)) {
    throw new Error('Chords search returned no usable chord lines')
  }

  // Keep the sheet as returned (ChordPro, chords-over-words, or plain). Soft-rank
  // prefers inline forms later; conversion to ChordPro is left to the user.
  const lyricText = lyricLines.join('\n')
  const chordSheetAlignment = buildChordSheetAlignmentFromLines(sheetLines)

  const result = {
    sheetLines: sheetLines,
    chordText: chordText,
    lyricLines: lyricLines,
    lyricText: lyricText,
    chordSheetAlignment: chordSheetAlignment,
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string' ? body.title : '',
    artist: typeof body.artist === 'string' ? body.artist : '',
    preview: typeof body.preview === 'string' ? body.preview : lyricText.slice(0, 240),
    titleOnly: body.titleOnly === true,
  }

  if (body.capo != null && body.capo !== '') result.capo = body.capo
  if (typeof body.key === 'string' && body.key) result.key = body.key
  if (typeof body.tuning === 'string' && body.tuning) result.tuning = body.tuning
  if (body.tempo != null && body.tempo !== '') result.tempo = body.tempo

  return result
}

export function normalizeChordsSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid chords search response')
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
    // One tab-only / lyrics-only scrape must not discard the whole picker.
    const candidates = sortChordsCandidatesPreferInline(
      body.candidates.reduce(function(acc, candidate) {
        try {
          acc.push(normalizeSingleChordsResult(candidate))
        } catch (e) {
          // Skip unusable sheets (bass tab, empty chords, etc.).
        }
        return acc
      }, [])
    )
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
    const parsed = handleChordsSearchStreamEvent(parseNdjsonLine(line), onProgress)
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
    pageHtml,
  } = options

  if (!url && !(title && String(title).trim())) {
    throw new Error('Song title is required')
  }

  if (typeof onProgress === 'function') {
    onProgress('Starting chords search...', 0, 'start')
  }

  let resolvedPageHtml = pageHtml || ''
  let resolvedUrl = url || ''

  if (
    resolvedUrl
    && !resolvedPageHtml
    && isUltimateGuitarPageUrl(resolvedUrl)
    && await isYoutubeExtensionConnected()
  ) {
    try {
      if (typeof onProgress === 'function') {
        onProgress('Fetching Ultimate Guitar via TuneBook Helper...', 0.05, 'extension')
      }
      const fetched = await fetchPageHtmlViaExtension(resolvedUrl)
      if (fetched && fetched.html) {
        resolvedPageHtml = fetched.html
        if (fetched.finalUrl) resolvedUrl = fetched.finalUrl
      }
    } catch (err) {
      // Fall through to resolver direct/proxy/Playwright fetch.
      if (typeof onProgress === 'function') {
        const message = err && err.message ? String(err.message) : 'Extension fetch failed'
        onProgress('Extension fetch failed (' + message + '); trying resolver...', 0.08, 'extension')
      }
    }
  }

  const body = {
    title: title || '',
    artist: artist || '',
    url: resolvedUrl || '',
  }
  if (resolvedPageHtml) {
    body.pageHtml = resolvedPageHtml
  }

  const response = await fetchViaMediaProxy('/search-chords', accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
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
