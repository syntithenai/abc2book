import {
  getAwaitingJob,
  dismissFieldLookup,
} from './tuneFieldLookupQueue'
import {
  buildCurrentValueSuggestion,
  collateUniqueSuggestions,
  nonCurrentCandidates,
} from './fieldSuggestionsUtils'
import {
  isTuneFieldEmptyForKind,
  applyCandidateToTune,
} from './fieldLookupApplyUtils'
import { getPlainLyricLines } from './wLinesUtils'
import { toast } from 'react-toastify'
import { setFieldSearchResults } from './fieldSearchResultCache'

export const MEDIA_ANALYSIS_LOOKUP_ORIGIN = 'media-analysis'

const MEDIA_ANALYSIS_SUGGESTION_KINDS = [
  'lyrics',
  'chords',
  'notation',
  'tempo',
  'meter',
  'key',
]

function notationTextFromTune(tune) {
  if (!tune) return ''
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
  return String(tune.notes || '')
}

function currentValueForKind(tune, kind) {
  if (!tune) return ''
  if (kind === 'lyrics') {
    const lines = getPlainLyricLines(tune)
    return Array.isArray(lines) ? lines.join('\n') : ''
  }
  if (kind === 'notation') return notationTextFromTune(tune)
  if (kind === 'tempo') return tune.tempo != null ? String(tune.tempo) : ''
  if (kind === 'meter') return String(tune.meter || '')
  if (kind === 'key') return String(tune.key || '')
  return ''
}

/**
 * Build ABC notation from analysis melody text, optionally merging chord symbols
 * via the same mergeMelody → mergeChords order as timed import finalize.
 */
export function buildMediaAnalysisNotationAbc(formatted, tune, options) {
  if (!formatted) return ''
  const melodyText = String(formatted.melodyText || formatted.melodyNotesText || '').trim()
  if (!melodyText) return ''
  const chordsText = String(formatted.chordsText || formatted.chordGridText || '').trim()
  const abcjsParser = options && options.abcjsParser
  const meter = String((formatted && formatted.meter) || (tune && tune.meter) || '4/4').trim() || '4/4'
  const key = String((formatted && formatted.key) || (tune && tune.key) || 'C').trim() || 'C'
  const noteLength = String((tune && tune.noteLength) || '1/8').trim() || '1/8'
  const name = (tune && tune.name) || 'Tune'
  const tempo = Number((formatted && formatted.tempo) || (tune && tune.tempo) || 0)
  const tempoLine = tempo > 0 ? ('Q:1/4=' + Math.round(tempo) + '\n') : ''
  let abc = 'X:1\nT:' + name + '\nM:' + meter + '\nL:' + noteLength + '\n' + tempoLine + 'K:' + key + '\n'

  if (abcjsParser && typeof abcjsParser.mergeMelody === 'function') {
    abc = abcjsParser.mergeMelody(melodyText, abc)
  } else {
    abc = abc + melodyText + (melodyText.endsWith('\n') ? '' : '\n')
  }
  if (chordsText && abcjsParser && typeof abcjsParser.mergeChords === 'function') {
    abc = abcjsParser.mergeChords(chordsText, abc)
  }
  return abc
}

function buildAnalysisCandidate(kind, formatted, tune, options) {
  if (!formatted) return null
  if (kind === 'lyrics') {
    const text = String(formatted.lyricsText || '').trim()
    if (!text) return null
    return {
      text: text,
      lines: text.split(/\r?\n/),
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  if (kind === 'chords') {
    const chordText = String(formatted.chordsText || formatted.chordGridText || '').trim()
    if (!chordText) return null
    return {
      chordText: chordText,
      preview: chordText,
      abc: chordText,
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  if (kind === 'notation') {
    const abc = buildMediaAnalysisNotationAbc(formatted, tune, options)
    if (!abc) return null
    return {
      abc: abc,
      preview: abc,
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  if (kind === 'tempo') {
    const tempo = Number(formatted.tempo)
    if (!(tempo > 0)) return null
    const rounded = Math.round(tempo)
    return {
      tempo: rounded,
      preview: String(rounded),
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  if (kind === 'meter') {
    const meter = String(formatted.meter || '').trim()
    if (!meter) return null
    return {
      meter: meter,
      preview: meter,
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  if (kind === 'key') {
    const key = String(formatted.key || '').trim()
    if (!key) return null
    return {
      key: key,
      preview: key,
      source: 'media-analysis',
      title: 'Media analysis',
    }
  }
  return null
}

function toastMediaAnalysisSuggestions(count, applied) {
  let message
  if (count <= 0) {
    message = 'No media analysis suggestions'
  } else if (applied) {
    message = 'Applied media analysis · ' + count + ' suggestion' + (count === 1 ? '' : 's')
  } else {
    message = count + ' media analysis suggestion' + (count === 1 ? '' : 's')
  }
  toast.info(message, {
    hideProgressBar: true,
    autoClose: 2000,
  })
}

function cacheAnalysisCandidate(tuneId, kind, analysisCandidate, tune) {
  const currentValue = currentValueForKind(tune, kind)
  let candidates = [analysisCandidate]
  const current = buildCurrentValueSuggestion(kind, currentValue)
  if (current) candidates = [current].concat(candidates)
  candidates = collateUniqueSuggestions(kind, candidates)
  const searchable = nonCurrentCandidates(candidates, {
    kind: kind,
    originalValue: currentValue,
  })
  if (!searchable.length) return false
  setFieldSearchResults('tune:' + String(tuneId), kind, searchable)
  return true
}

/**
 * Persist media-analysis results: empty fields auto-apply; non-empty (and
 * empty chords that cannot silent-apply) go to the local search-result cache
 * for caret / one-shot picker — no global awaiting inbox.
 */
export function persistMediaAnalysisFieldSuggestions(tuneId, formatted, tune, options) {
  if (!tuneId || !formatted) return []
  const abcTools = options && options.abcTools
  const cached = []
  let appliedAny = false
  let appliedOnlyCount = 0

  MEDIA_ANALYSIS_SUGGESTION_KINDS.forEach(function(kind) {
    const analysisCandidate = buildAnalysisCandidate(kind, formatted, tune, options)
    if (!analysisCandidate) return

    const targetKey = 'tune:' + String(tuneId)
    const existing = getAwaitingJob(targetKey, kind)
    if (existing) dismissFieldLookup(existing.id)

    const empty = isTuneFieldEmptyForKind(tune, kind)
    if (empty) {
      if (tune) {
        const applied = applyCandidateToTune(tune, kind, analysisCandidate, abcTools)
        if (applied) {
          appliedAny = true
          appliedOnlyCount += 1
          cacheAnalysisCandidate(tuneId, kind, analysisCandidate, tune)
          if (options && typeof options.saveTune === 'function') {
            try {
              options.saveTune(tune, false, { historyLabel: 'Apply media analysis' })
            } catch (e) {
              // ignore save failure; value may still be in memory
            }
          }
          return
        }
      }
      if (kind === 'chords' || kind === 'lyrics' || kind === 'notation') {
        if (cacheAnalysisCandidate(tuneId, kind, analysisCandidate, tune)) {
          cached.push({ kind: kind })
        }
      }
      return
    }

    if (cacheAnalysisCandidate(tuneId, kind, analysisCandidate, tune)) {
      cached.push({ kind: kind })
    }
  })

  const toastCount = cached.length + appliedOnlyCount
  if (toastCount) {
    toastMediaAnalysisSuggestions(toastCount, appliedAny)
  }

  return cached
}

export function isMediaAnalysisLookupJob(job) {
  return !!(job && job.origin === MEDIA_ANALYSIS_LOOKUP_ORIGIN)
}

export function mediaAnalysisJobHasMelodySourceNotes(job) {
  return !!(job && Array.isArray(job.melodySourceNotes) && job.melodySourceNotes.length > 0)
}
