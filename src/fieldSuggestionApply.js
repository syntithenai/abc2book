import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import {
  applyFieldLookupChoice,
  shouldDeferFieldLookupSave,
} from './tuneFieldLookupQueue'
import {
  applyCandidateToTune,
  historyLabelForKind,
} from './fieldLookupApplyUtils'
import {
  buildCurrentValueSuggestion,
  originalValueFromJob,
} from './fieldSuggestionsUtils'
import { setPlainLyricLines } from './wLinesUtils'

function notationAbcFromNotes(notesText, tune) {
  const notes = String(notesText || '').trim()
  const meta = tune || {}
  const lines = [
    'X:1',
    'T:' + (meta.name || 'Tune'),
    'M:' + (meta.meter || '4/4'),
    'L:' + (meta.noteLength || '1/8'),
    'K:' + (meta.key || 'C'),
  ]
  if (notes) lines.push(notes)
  return lines.join('\n')
}

/**
 * Restore the job's frozen Original Value onto the live tune (when it differs).
 */
export function restoreFieldLookupOriginalToTune(job, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const tunes = opts.tunes
  const abcjsParser = opts.abcjsParser
  const forceRefresh = opts.forceRefresh
  if (!job || !job.tuneId || !tunebook) return false
  const tune = tunes && tunes[job.tuneId]
  if (!tune) return false
  const abcTools = tunebook.abcTools
  const original = originalValueFromJob(job)
  const current = buildCurrentValueSuggestion(job.kind, original)
  if (!current) return false

  if (job.kind === 'chords') {
    const committed = commitChordSearchResultToTune({
      result: {
        chordText: String(original || ''),
        chordProSource: String(original || ''),
      },
      tune: tune,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
    })
    if (!committed.ok && String(original || '').trim()) return false
    if (committed.ok || !String(original || '').trim()) {
      tunebook.saveTune(tune, false, { historyLabel: 'Restore original chords' })
      if (typeof forceRefresh === 'function') forceRefresh()
    }
    applyFieldLookupChoice(job.id, current)
    return true
  }

  if (job.kind === 'notation') {
    const abc = notationAbcFromNotes(original, tune)
    const imported = abcTools && typeof abcTools.abc2json === 'function'
      ? abcTools.abc2json(abc)
      : null
    if (!imported && String(original || '').trim()) return false
    if (imported) {
      imported.id = tune.id
      tunebook.saveTune(imported, false, { historyLabel: 'Restore original notation' })
      if (typeof forceRefresh === 'function') forceRefresh()
    }
    applyFieldLookupChoice(job.id, current)
    return true
  }

  if (job.kind === 'lyrics') {
    const lines = Array.isArray(original)
      ? original
      : String(original || '').split(/\r?\n/)
    setPlainLyricLines(tune, lines)
    tunebook.saveTune(tune, false, { historyLabel: 'Restore original lyrics' })
    if (typeof forceRefresh === 'function') forceRefresh()
    applyFieldLookupChoice(job.id, current)
    return true
  }

  if (shouldDeferFieldLookupSave(job)) {
    applyCandidateToTune(tune, job.kind, current, abcTools)
    tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
    if (typeof forceRefresh === 'function') forceRefresh()
    applyFieldLookupChoice(job.id, current)
    return true
  }

  const applied = applyCandidateToTune(tune, job.kind, current, abcTools)
  if (!applied && String(original || '').trim()) return false
  if (applied) {
    tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
    if (typeof forceRefresh === 'function') forceRefresh()
  }
  applyFieldLookupChoice(job.id, current)
  return true
}

export function applyFieldSuggestionCandidate(job, candidate, options) {
  const opts = options || {}
  if (!job || !candidate) return false
  if (job.kind === 'chords') {
    const tune = opts.tunes && job.tuneId ? opts.tunes[job.tuneId] : null
    if (!tune || !opts.tunebook) return false
    const committed = commitChordSearchResultToTune({
      result: candidate,
      tune: tune,
      tunebook: opts.tunebook,
      abcjsParser: opts.abcjsParser,
    })
    if (!committed.ok) return false
    opts.tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind('chords') })
    if (typeof opts.forceRefresh === 'function') opts.forceRefresh()
    applyFieldLookupChoice(job.id, candidate)
    return true
  }
  if (shouldDeferFieldLookupSave(job)) {
    const tune = opts.tunes && job.tuneId ? opts.tunes[job.tuneId] : null
    if (tune && opts.tunebook) {
      const applied = applyCandidateToTune(tune, job.kind, candidate, opts.tunebook.abcTools)
      if (applied) {
        opts.tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
        if (typeof opts.forceRefresh === 'function') opts.forceRefresh()
      }
    }
    applyFieldLookupChoice(job.id, candidate)
    return true
  }
  return !!applyFieldLookupChoice(job.id, candidate)
}
