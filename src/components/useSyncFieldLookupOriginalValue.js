import { useEffect } from 'react'
import { candidateDisplayValue } from '../fieldLookupApplyUtils'
import {
  displayFromOriginalValue,
  nonCurrentCandidates,
  originalValueFromJob,
} from '../fieldSuggestionsUtils'
import { updateFieldLookupOriginalValue } from '../tuneFieldLookupQueue'

function valuesEqual(a, b) {
  return displayFromOriginalValue(a) === displayFromOriginalValue(b)
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(function(item) {
    return String(item).trim()
  }).filter(Boolean)
  const text = displayFromOriginalValue(value)
  if (!text) return []
  return text.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

/**
 * True when live looks like original plus one or more awaiting search hits
 * (multi-select artists/aliases apply without rewriting Original Value).
 */
function isSuggestionAugmentedList(kind, original, live, awaitingJob) {
  const origList = asList(original)
  const liveList = asList(live)
  const origKeys = {}
  origList.forEach(function(item) {
    origKeys[normalizeKey(item)] = true
  })
  const extras = liveList.filter(function(item) {
    return !origKeys[normalizeKey(item)]
  })
  if (extras.length === 0) return false
  const candidateKeys = {}
  nonCurrentCandidates(awaitingJob && awaitingJob.candidates).forEach(function(candidate) {
    const key = normalizeKey(candidateDisplayValue(kind, candidate))
    if (key) candidateKeys[key] = true
  })
  return extras.every(function(item) {
    return !!candidateKeys[normalizeKey(item)]
  })
}

/**
 * Keep Original Value frozen from suggestion creation, but refresh it when the
 * user manually edits the field (not when a search suggestion is applied).
 */
export function useSyncFieldLookupOriginalValue(tuneId, kind, liveValue, awaitingJob) {
  useEffect(function() {
    if (!tuneId || !kind || !awaitingJob) return
    const applied = awaitingJob.appliedCandidate
    if (applied && !applied.isCurrent && applied.id !== 'current') {
      const appliedDisplay = candidateDisplayValue(kind, applied)
      if (valuesEqual(liveValue, appliedDisplay)) return
    }
    const original = originalValueFromJob(awaitingJob)
    if (valuesEqual(liveValue, original)) return
    if (isSuggestionAugmentedList(kind, original, liveValue, awaitingJob)) return
    updateFieldLookupOriginalValue(tuneId, kind, liveValue)
  }, [tuneId, kind, liveValue, awaitingJob])
}
