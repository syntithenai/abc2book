import { lyricsPreview } from './lyricsParseUtils'
import { isUsableLyricContent } from './lyricsQualityUtils'

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
    contentType: typeof item.contentType === 'string' ? item.contentType : 'lyrics',
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

function emptyLyricsResult(manualCandidates) {
  return {
    multiple: false,
    empty: true,
    found: false,
    manualCandidates: normalizeManualCandidates(manualCandidates),
  }
}

export function isLyricsSearchSoftMissMessage(message) {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  if (text.indexOf('no lyrics found') >= 0) return true
  if (text.indexOf('no usable text') >= 0) return true
  if (text.indexOf('did not contain usable text') >= 0) return true
  if (text.indexOf('could not extract lyrics') >= 0) return true
  if (text.indexOf('lyrics search returned no') >= 0) return true
  return false
}

function normalizeSingleLyricsResult(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return null
  }

  const lines = Array.isArray(body.lines) && body.lines.length > 0
    ? body.lines.map(function(line) { return String(line) })
    : text.split('\n')

  const quality = isUsableLyricContent(lines)
  if (!quality.ok || !(quality.lines || []).some(function(line) {
    return String(line || '').trim()
  })) {
    return null
  }

  const usableLines = quality.lines
  const preview = typeof body.preview === 'string' && body.preview
    ? body.preview
    : lyricsPreview(usableLines)

  return {
    text: usableLines.join('\n'),
    lines: usableLines,
    stanzas: Array.isArray(body.stanzas) ? body.stanzas : [],
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string' ? body.title : '',
    artist: typeof body.artist === 'string' ? body.artist : '',
    preview: preview,
    titleOnly: body.titleOnly === true,
  }
}

export function normalizeLyricsSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid lyrics search response')
  }

  if (body.error) {
    if (isLyricsSearchSoftMissMessage(body.error)) {
      return emptyLyricsResult(body.manualCandidates)
    }
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
    const candidates = []
    body.candidates.forEach(function(candidate) {
      const normalized = normalizeSingleLyricsResult(candidate)
      if (normalized) candidates.push(normalized)
    })
    if (candidates.length === 0) {
      return emptyLyricsResult(body.manualCandidates)
    }
    return {
      multiple: true,
      candidates: candidates,
    }
  }

  const single = normalizeSingleLyricsResult(body)
  if (!single) {
    return emptyLyricsResult(body.manualCandidates)
  }
  return Object.assign({ multiple: false }, single)
}

export function handleLyricsSearchStreamEvent(event, onProgress) {
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
    if (isLyricsSearchSoftMissMessage(event.message)) {
      return emptyLyricsResult()
    }
    throw new Error(event.message || 'Lyrics search failed')
  }
  if (event.type === 'result') {
    return normalizeLyricsSearch(event.body)
  }
  return null
}
