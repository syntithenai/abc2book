import {
  seedAwaitingLookup,
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

export const MEDIA_ANALYSIS_LOOKUP_ORIGIN = 'media-analysis'

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
  return ''
}

function buildAnalysisCandidate(kind, formatted) {
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
    const abc = String(formatted.melodyText || formatted.melodyNotesText || '').trim()
    if (!abc) return null
    return {
      abc: abc,
      preview: abc,
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

/**
 * Persist media-analysis results as field suggestions for the tune.
 * Empty fields receive the applied value without attaching a suggestion.
 * Non-empty fields keep Current + analysis when they differ; same-value is skipped.
 * Tagged with origin media-analysis so they are not listed as Active Searches.
 */
export function persistMediaAnalysisFieldSuggestions(tuneId, formatted, tune, options) {
  if (!tuneId || !formatted) return []
  const abcTools = options && options.abcTools
  const title = (tune && tune.name) || 'Tune'
  const kinds = ['lyrics', 'chords', 'notation']
  const seeded = []
  let appliedAny = false
  let appliedOnlyCount = 0

  kinds.forEach(function(kind) {
    const analysisCandidate = buildAnalysisCandidate(kind, formatted)
    if (!analysisCandidate) return

    const targetKey = 'tune:' + String(tuneId)
    const existing = getAwaitingJob(targetKey, kind)
    if (existing) dismissFieldLookup(existing.id)

    const empty = isTuneFieldEmptyForKind(tune, kind)
    if (empty) {
      // Single analysis result on an empty field: apply only, no suggestion chrome.
      if (tune) {
        const applied = applyCandidateToTune(tune, kind, analysisCandidate, abcTools)
        if (applied) {
          appliedAny = true
          appliedOnlyCount += 1
          if (options && typeof options.saveTune === 'function') {
            try {
              options.saveTune(tune, false, { historyLabel: 'Apply media analysis' })
            } catch (e) {
              // ignore save failure; value may still be in memory
            }
          }
        }
      }
      return
    }

    const currentValue = currentValueForKind(tune, kind)
    let candidates = [analysisCandidate]
    const current = buildCurrentValueSuggestion(kind, currentValue)
    if (current) candidates = [current].concat(candidates)
    candidates = collateUniqueSuggestions(kind, candidates)
    const searchable = nonCurrentCandidates(candidates, {
      kind: kind,
      originalValue: currentValue,
    })
    if (!searchable.length) return

    const id = seedAwaitingLookup({
      tuneId: tuneId,
      kind: kind,
      label: 'Media analysis · ' + kind,
      title: title,
      artist: (tune && tune.composer) || '',
      candidates: candidates,
      origin: MEDIA_ANALYSIS_LOOKUP_ORIGIN,
    })
    if (!id) return
    seeded.push({ id: id, kind: kind })
  })

  const toastCount = seeded.length + appliedOnlyCount
  if (toastCount) {
    toastMediaAnalysisSuggestions(toastCount, appliedAny)
  }

  return seeded
}

export function isMediaAnalysisLookupJob(job) {
  return !!(job && job.origin === MEDIA_ANALYSIS_LOOKUP_ORIGIN)
}
