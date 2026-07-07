import { lyricsPreview } from './lyricsParseUtils'

function normalizeSingleLyricsResult(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    throw new Error('Lyrics search returned no text')
  }

  const lines = Array.isArray(body.lines) && body.lines.length > 0
    ? body.lines.map(function(line) { return String(line) })
    : text.split('\n')

  const preview = typeof body.preview === 'string' && body.preview
    ? body.preview
    : lyricsPreview(lines)

  return {
    text: text,
    lines: lines,
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
    throw new Error(body.error)
  }

  if (body.multiple === true && Array.isArray(body.candidates)) {
    const candidates = body.candidates.map(function(candidate) {
      return normalizeSingleLyricsResult(candidate)
    })
    if (candidates.length === 0) {
      throw new Error('Lyrics search returned no candidates')
    }
    return {
      multiple: true,
      candidates: candidates,
    }
  }

  return Object.assign({ multiple: false }, normalizeSingleLyricsResult(body))
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
    throw new Error(event.message || 'Lyrics search failed')
  }
  if (event.type === 'result') {
    return normalizeLyricsSearch(event.body)
  }
  return null
}
