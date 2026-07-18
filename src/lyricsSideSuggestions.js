import { offerSideFieldSuggestion } from './tuneFieldLookupQueue'

function lyricLinesFromResult(result) {
  if (!result || typeof result !== 'object') return []
  if (Array.isArray(result.lyricLines) && result.lyricLines.length) {
    return result.lyricLines.slice()
  }
  if (Array.isArray(result.lines) && result.lines.length) {
    return result.lines.slice()
  }
  const text = String(result.lyricText || result.text || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return []
  return text.split('\n')
}

/**
 * Route lyrics found during another search (usually chords) into Suggestions,
 * or auto-apply when the lyrics field is empty.
 * Without a tune/candidate id, auto-applies only when lyrics are empty.
 */
export function maybeOfferLyricsFromSearchResult(options) {
  const opts = options || {}
  const lines = lyricLinesFromResult(opts.result)
  if (!lines.some(function(line) { return String(line || '').trim() })) {
    return null
  }

  const text = lines.join('\n')
  const currentLyrics = String(opts.currentLyrics || '').trim()
  const candidate = {
    lines: lines,
    text: text,
    source: (opts.result && opts.result.source) || 'chord-search',
    sourceUrl: (opts.result && opts.result.sourceUrl) || '',
    title: (opts.result && opts.result.title) || opts.title || 'Lyrics',
    preview: text,
  }

  function applyToForm() {
    if (typeof opts.onLyricsAccept === 'function') {
      opts.onLyricsAccept({
        lines: lines,
        text: text,
        source: candidate.source,
        sourceUrl: candidate.sourceUrl,
      })
    }
  }

  if (!opts.tuneId && !opts.candidateId) {
    if (!currentLyrics) applyToForm()
    return null
  }

  return offerSideFieldSuggestion({
    tuneId: opts.tuneId || null,
    candidateId: opts.candidateId || null,
    kind: 'lyrics',
    candidate: candidate,
    currentValue: opts.currentLyrics || '',
    title: opts.title || '',
    artist: opts.artist || '',
    label: 'Lyrics suggestion',
    onApplied: function() { applyToForm() },
  })
}
