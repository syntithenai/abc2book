import { candidateDisplayValue } from './fieldLookupApplyUtils'
import {
  buildPickerOriginalValueItem,
  displayFromOriginalValue,
  originalValueFromJob,
  searchableSuggestions,
} from './fieldSuggestionsUtils'
import { lyricLinesToText } from './wLinesUtils'

export function pickerTitleForKind(kind) {
  if (kind === 'composer') return 'Choose composer'
  if (kind === 'artists') return 'Choose artists to add'
  if (kind === 'aliases') return 'Choose aliases to add'
  if (kind === 'genre') return 'Choose genre'
  if (kind === 'notation') return 'Choose notation'
  if (kind === 'lyrics') return 'Choose lyrics'
  if (kind === 'chords') return 'Choose chords'
  if (kind === 'links') return 'Choose link'
  if (kind === 'tempo') return 'Choose tempo'
  if (kind === 'meter') return 'Choose time signature'
  if (kind === 'key') return 'Choose key'
  return 'Choose suggestion'
}

export function currentFieldDisplay(tune, kind) {
  if (!tune) return ''
  if (kind === 'composer') return String(tune.composer || '').trim()
  if (kind === 'genre') return String(tune.genre || '').trim()
  if (kind === 'artists') {
    return Array.isArray(tune.artists) ? tune.artists.filter(Boolean).join(', ') : ''
  }
  if (kind === 'aliases') {
    return Array.isArray(tune.aliases) ? tune.aliases.filter(Boolean).join(', ') : ''
  }
  if (kind === 'lyrics') {
    return lyricLinesToText(tune)
  }
  if (kind === 'notation' || kind === 'chords') {
    const voices = tune.voices
    if (voices && typeof voices === 'object') {
      const keys = Object.keys(voices)
      for (let i = 0; i < keys.length; i += 1) {
        const notes = voices[keys[i]] && voices[keys[i]].notes
        if (Array.isArray(notes) && notes.some(function(line) { return String(line || '').trim() })) {
          return notes.join('\n')
        }
      }
    }
    if (Array.isArray(tune.notes)) return tune.notes.join('\n')
    return String(tune.notes || '')
  }
  if (kind === 'links') {
    const first = Array.isArray(tune.links) ? tune.links[0] : null
    return first ? candidateDisplayValue('links', first) : ''
  }
  if (kind === 'tempo') return tune.tempo != null ? String(tune.tempo) : ''
  if (kind === 'meter') return String(tune.meter || '').trim()
  if (kind === 'key') return String(tune.key || '').trim()
  return ''
}

export function mapCandidatesToPickerItems(kind, candidates, titleHint) {
  return candidates.map(function(candidate) {
    if (kind === 'composer' || kind === 'artists') {
      const role = candidate.role === 'writer'
        ? 'Writer'
        : (candidate.role === 'performer' ? 'Performer' : '')
      return {
        title: candidate.artist || '',
        artist: role,
        preview: candidate.preview || candidate.artist || '',
        source: candidate.source || '',
        matchType: role || candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'aliases') {
      return {
        title: candidate.alias || '',
        artist: '',
        preview: candidate.preview || candidate.alias || '',
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'genre') {
      return {
        title: candidate.genre || '',
        artist: candidate.reason || '',
        preview: candidate.genre || '',
        source: candidate.source || '',
        matchType: candidate.matchType || candidate.reason || candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'notation') {
      return {
        title: candidate.title || titleHint || 'Notation',
        artist: candidate.artist || '',
        preview: candidate.preview || candidate.abc || '',
        abc: candidate.abc || candidate.preview || '',
        source: candidate.source || '',
        sourceUrl: candidate.sourceUrl || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'lyrics') {
      return {
        title: candidate.title || titleHint || 'Lyrics',
        artist: candidate.artist || '',
        preview: candidateDisplayValue('lyrics', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'chords') {
      return {
        title: candidate.title || titleHint || 'Chords',
        artist: candidate.artist || '',
        preview: candidateDisplayValue('chords', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    if (kind === 'links') {
      return {
        title: candidate.title || candidate.link || 'Link',
        artist: '',
        preview: candidateDisplayValue('links', candidate),
        source: candidate.source || '',
        matchType: candidate.source || '',
        raw: candidate,
      }
    }
    return {
      title: candidate.title || 'Suggestion',
      artist: candidate.artist || '',
      preview: candidate.preview || '',
      source: candidate.source || '',
      matchType: candidate.source || '',
      raw: candidate,
    }
  })
}

/**
 * Build SearchResultPickerModal state from an awaiting field-lookup job.
 */
export function buildPickerStateFromJob(job, tunes, tunebook) {
  if (!job) return null
  const kind = job.kind
  const tune = tunes && job.tuneId ? tunes[job.tuneId] : null
  const titleHint = (tune && tune.name) || job.title || ''
  const originalValue = originalValueFromJob(job)
  const originalDisplay = originalValue != null && originalValue !== undefined
    ? displayFromOriginalValue(originalValue)
    : currentFieldDisplay(tune, kind)
  const candidates = searchableSuggestions(job)
  const currentItem = buildPickerOriginalValueItem({
    value: originalValue != null ? originalValue : originalDisplay,
    display: originalDisplay,
    abc: (kind === 'notation' || kind === 'chords')
      ? (typeof originalValue === 'string' ? originalValue : originalDisplay)
      : '',
  })
  const items = [currentItem].concat(mapCandidatesToPickerItems(kind, candidates, titleHint))
  return {
    job: job,
    kind: kind,
    titleHint: titleHint,
    multiSelect: kind === 'artists' || kind === 'aliases',
    layout: kind === 'notation' ? 'notation' : undefined,
    previewMetadata: tune ? {
      meter: tune.meter,
      noteLength: tune.noteLength,
      key: tune.key,
    } : (tunebook && tunebook.abcTools ? {} : undefined),
    items: items,
    candidates: candidates,
    tune: tune,
  }
}
