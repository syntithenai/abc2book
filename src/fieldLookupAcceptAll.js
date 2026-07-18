import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import {
  applyFieldLookupChoice,
  getState,
  shouldDeferFieldLookupSave,
} from './tuneFieldLookupQueue'
import {
  awaitingJobsForTune,
  searchableSuggestions,
} from './fieldSuggestionsUtils'
import {
  applyCandidateToTune,
  historyLabelForKind,
} from './fieldLookupApplyUtils'
import { restoreFieldLookupOriginalToTune } from './fieldSuggestionApply'

function applyChordSuggestion(job, candidate, options) {
  const tunebook = options && options.tunebook
  const abcjsParser = options && options.abcjsParser
  const tunes = options && options.tunes
  const forceRefresh = options && options.forceRefresh
  if (!job || !candidate || !tunebook || !job.tuneId) return false
  const tune = tunes && tunes[job.tuneId]
  if (!tune) return false
  const committed = commitChordSearchResultToTune({
    result: candidate,
    tune: tune,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
  })
  if (!committed || !committed.ok) return false
  try {
    tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind('chords') })
    if (typeof forceRefresh === 'function') forceRefresh()
  } catch (e) {
    return false
  }
  applyFieldLookupChoice(job.id, candidate)
  return true
}

function applyFirstSuggestion(job, options) {
  const candidates = searchableSuggestions(job)
  if (!candidates.length) return false
  const first = candidates[0]
  if (job.kind === 'chords') {
    return applyChordSuggestion(job, first, options)
  }
  if (shouldDeferFieldLookupSave(job)) {
    const tunebook = options && options.tunebook
    const tunes = options && options.tunes
    const tune = tunes && job.tuneId ? tunes[job.tuneId] : null
    if (tune && tunebook) {
      const abcTools = tunebook.abcTools
      if (applyCandidateToTune(tune, job.kind, first, abcTools)) {
        tunebook.saveTune(tune, false, { historyLabel: historyLabelForKind(job.kind) })
        if (typeof options.forceRefresh === 'function') options.forceRefresh()
      }
    }
    applyFieldLookupChoice(job.id, first)
    return true
  }
  return !!applyFieldLookupChoice(job.id, first)
}

/**
 * Apply the first searchable suggestion for every awaiting field on one tune.
 */
export function acceptAllFieldSuggestionsForTune(tuneId, options) {
  if (!tuneId) return 0
  const jobs = awaitingJobsForTune((getState().jobs || []), tuneId)
  let count = 0
  jobs.forEach(function(job) {
    if (applyFirstSuggestion(job, options)) count += 1
  })
  return count
}

/**
 * Apply the first searchable suggestion for every awaiting field on every tune.
 */
export function acceptAllFieldSuggestionsAllTunes(options) {
  const jobs = (getState().jobs || []).filter(function(job) {
    return job && job.status === 'awaiting' && searchableSuggestions(job).length > 0
  })
  let count = 0
  jobs.forEach(function(job) {
    if (applyFirstSuggestion(job, options)) count += 1
  })
  return count
}

export function countAcceptableFieldSuggestions(tuneId) {
  if (tuneId) {
    return awaitingJobsForTune((getState().jobs || []), tuneId).length
  }
  const tuneIds = {}
  ;(getState().jobs || []).forEach(function(job) {
    if (!job || job.status !== 'awaiting' || !job.tuneId) return
    if (!searchableSuggestions(job).length) return
    tuneIds[String(job.tuneId)] = true
  })
  return Object.keys(tuneIds).length
}
