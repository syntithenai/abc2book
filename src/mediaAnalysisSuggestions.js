import {
  seedAwaitingLookup,
  applyFieldLookupChoice,
  getAwaitingJob,
  dismissFieldLookup,
} from './tuneFieldLookupQueue'
import {
  buildCurrentValueSuggestion,
  collateUniqueSuggestions,
} from './fieldSuggestionsUtils'
import {
  isTuneFieldEmptyForKind,
  applyCandidateToTune,
  toastFieldSearchFinished,
} from './fieldLookupApplyUtils'
import { getPlainLyricLines } from './wLinesUtils'

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

/**
 * Persist media-analysis results as field suggestions for the tune.
 * Empty fields also receive the first applied value; Current is saved when non-empty.
 */
export function persistMediaAnalysisFieldSuggestions(tuneId, formatted, tune, options) {
  if (!tuneId || !formatted) return []
  const abcTools = options && options.abcTools
  const title = (tune && tune.name) || 'Tune'
  const kinds = ['lyrics', 'chords', 'notation']
  const seeded = []
  let appliedAny = false

  kinds.forEach(function(kind) {
    const analysisCandidate = buildAnalysisCandidate(kind, formatted)
    if (!analysisCandidate) return

    const targetKey = 'tune:' + String(tuneId)
    const existing = getAwaitingJob(targetKey, kind)
    if (existing) dismissFieldLookup(existing.id)

    let candidates = [analysisCandidate]
    const empty = isTuneFieldEmptyForKind(tune, kind)
    if (!empty) {
      const current = buildCurrentValueSuggestion(kind, currentValueForKind(tune, kind))
      if (current) candidates = [current].concat(candidates)
    }
    candidates = collateUniqueSuggestions(kind, candidates)

    const id = seedAwaitingLookup({
      tuneId: tuneId,
      kind: kind,
      title: title,
      artist: (tune && tune.composer) || '',
      candidates: candidates,
    })
    if (!id) return
    seeded.push({ id: id, kind: kind })

    if (empty && tune) {
      const applied = applyCandidateToTune(tune, kind, analysisCandidate, abcTools)
      if (applied) {
        appliedAny = true
        if (options && typeof options.saveTune === 'function') {
          try {
            options.saveTune(tune, false, { historyLabel: 'Apply media analysis' })
          } catch (e) {
            // suggestions remain even if save fails
          }
        }
      }
      applyFieldLookupChoice(id, analysisCandidate)
    }
  })

  if (seeded.length) {
    toastFieldSearchFinished(seeded.length === 1 ? seeded[0].kind : 'field', {
      count: seeded.length,
      applied: appliedAny,
    })
  }

  return seeded
}
