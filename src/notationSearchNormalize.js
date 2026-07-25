import { musicXmlToAbc } from './musicXmlToAbc'
import { isArchiveNotationHost } from './notationSearchSites'

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
    accessTier: typeof item.accessTier === 'string' ? item.accessTier : '',
    contentType: typeof item.contentType === 'string' ? item.contentType : 'notation',
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

function abcPreview(abcText, maxLines) {
  const limit = maxLines || 6
  const lines = String(abcText || '').split(/\r?\n/).filter(function(line) {
    return line.trim()
  })
  return lines.slice(0, limit).join('\n')
}

function normalizePdfAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null
  const downloadUrl = typeof raw.downloadUrl === 'string' ? raw.downloadUrl.trim() : ''
  if (!downloadUrl) return null
  return {
    downloadUrl: downloadUrl,
    filename: typeof raw.filename === 'string' ? raw.filename : 'score.pdf',
    contentType: typeof raw.contentType === 'string' ? raw.contentType : 'application/pdf',
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : downloadUrl,
  }
}

/**
 * If the query is a notation archive URL or direct score file URL, return it.
 */
export function extractNotationSearchUrl(query) {
  const text = String(query || '').trim()
  if (!/^https?:\/\//i.test(text)) return ''
  try {
    const parsed = new URL(text)
    const host = (parsed.hostname || '').replace(/^www\./i, '').toLowerCase()
    const path = (parsed.pathname || '').toLowerCase()
    if (path.endsWith('.mid') || path.endsWith('.midi')) {
      return text
    }
    if (host === 'musescore.com' || host.endsWith('.musescore.com')) {
      return text
    }
    if (isArchiveNotationHost(host)) {
      return text
    }
    if (path.endsWith('.musicxml') || path.endsWith('.mxl') || path.endsWith('.xml')) {
      if (host === 'imslp.org' || host.endsWith('.imslp.org')
        || host === 'cpdl.org' || host.endsWith('.cpdl.org')
        || host === 'data.josqu.in'
        || host === 'musicxml.com' || host.endsWith('.musicxml.com')) {
        return text
      }
    }
  } catch (e) {
    return ''
  }
  return ''
}

function convertMusicXmlCandidate(body) {
  const musicXml = typeof body.musicXml === 'string' ? body.musicXml.trim() : ''
  if (!musicXml) return null
  try {
    const abc = String(musicXmlToAbc(musicXml, {
      fileName: (body.title || 'musescore') + '.musicxml',
    }) || '').trim()
    if (!abc || abc.indexOf('K:') === -1) return null
    return abc
  } catch (e) {
    return null
  }
}

function normalizeSingleNotationResult(body) {
  const pdfAttachment = normalizePdfAttachment(body && body.pdfAttachment)
  const tuneMeta = body.tuneMeta && typeof body.tuneMeta === 'object' ? body.tuneMeta : null
  const previewFromBody = typeof body.preview === 'string' && body.preview
    ? body.preview
    : ''

  if (pdfAttachment) {
    const out = {
      abc: '',
      source: typeof body.source === 'string' ? body.source : '',
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
      title: typeof body.title === 'string'
        ? body.title
        : (tuneMeta && tuneMeta.name ? String(tuneMeta.name) : ''),
      artist: typeof body.artist === 'string'
        ? body.artist
        : (tuneMeta && tuneMeta.composer ? String(tuneMeta.composer) : ''),
      preview: previewFromBody || 'Sheet PDF (no MusicXML)',
      titleOnly: body.titleOnly === true,
      tuneMeta: tuneMeta,
      pdfAttachment: pdfAttachment,
      importFormat: 'pdf',
    }
    if (typeof body.matchScore === 'number' && Number.isFinite(body.matchScore)) {
      out.matchScore = body.matchScore
    }
    return out
  }

  let abc = typeof body.abc === 'string' ? body.abc.trim() : ''
  if ((!abc || abc.indexOf('K:') === -1) && body && body.musicXml) {
    abc = convertMusicXmlCandidate(body) || ''
  }
  if ((!abc || abc.indexOf('K:') === -1) && body && body.midiBytes) {
    const out = {
      abc: '',
      source: typeof body.source === 'string' ? body.source : '',
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
      title: typeof body.title === 'string'
        ? body.title
        : (tuneMeta && tuneMeta.name ? String(tuneMeta.name) : ''),
      artist: typeof body.artist === 'string'
        ? body.artist
        : (tuneMeta && tuneMeta.composer ? String(tuneMeta.composer) : ''),
      preview: previewFromBody || 'MIDI file (wizard import)',
      titleOnly: body.titleOnly === true,
      tuneMeta: tuneMeta,
      importFormat: 'midi',
      midiBytes: body.midiBytes,
    }
    if (typeof body.matchScore === 'number' && Number.isFinite(body.matchScore)) {
      out.matchScore = body.matchScore
    }
    return out
  }
  if (!abc || abc.indexOf('K:') === -1) {
    throw new Error('Notation search returned no usable ABC')
  }

  const preview = previewFromBody || abcPreview(abc)

  const out = {
    abc: abc,
    source: typeof body.source === 'string' ? body.source : '',
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
    title: typeof body.title === 'string'
      ? body.title
      : (tuneMeta && tuneMeta.name ? String(tuneMeta.name) : ''),
    artist: typeof body.artist === 'string'
      ? body.artist
      : (tuneMeta && tuneMeta.composer ? String(tuneMeta.composer) : ''),
    preview: preview,
    titleOnly: body.titleOnly === true,
    tuneMeta: tuneMeta,
  }
  if (typeof body.matchScore === 'number' && Number.isFinite(body.matchScore)) {
    out.matchScore = body.matchScore
  }
  return out
}

export function normalizeNotationSearch(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid notation search response')
  }

  if (body.error) {
    throw new Error(body.error)
  }

  if (isEmptyManualResult(body)) {
    return {
      multiple: false,
      empty: true,
      found: false,
      musescorePaywalled: body.musescorePaywalled === true,
      manualCandidates: normalizeManualCandidates(body.manualCandidates),
    }
  }

  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = []
    body.candidates.forEach(function(candidate) {
      try {
        candidates.push(normalizeSingleNotationResult(candidate))
      } catch (e) {
        // Skip MusicXML candidates that fail conversion.
      }
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
