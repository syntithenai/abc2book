import { candidateDisplayValue } from './fieldLookupApplyUtils'
import { isTuneFieldEmptyForKind } from './fieldLookupApplyUtils'

/**
 * Normalize a candidate fingerprint for dedupe across suggestion lists.
 */
export function suggestionFingerprint(kind, candidate) {
  if (!candidate) return ''
  if (candidate.id === 'current' || candidate.isCurrent) return 'current'
  const text = candidateDisplayValue(kind, candidate)
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Merge unique candidates; Current baseline first when present.
 */
export function collateUniqueSuggestions(kind, candidates) {
  const list = Array.isArray(candidates) ? candidates : []
  const seen = {}
  const out = []
  list.forEach(function(candidate) {
    if (!candidate) return
    const key = suggestionFingerprint(kind, candidate)
    if (!key || seen[key]) return
    seen[key] = true
    out.push(candidate)
  })
  return out
}

export function buildCurrentValueSuggestion(kind, value) {
  if (value == null) return null
  if (typeof value === 'string' && !String(value).trim()) return null
  if (Array.isArray(value) && value.length === 0) return null
  return {
    id: 'current',
    isCurrent: true,
    source: 'current',
    text: typeof value === 'string' ? value : undefined,
    value: value,
    label: 'Current',
  }
}

/**
 * Count tunes that have at least one awaiting field-lookup with candidates.
 */
export function countTunesWithFieldSuggestions(jobs) {
  const tuneIds = {}
  ;(jobs || []).forEach(function(job) {
    if (!job || job.status !== 'awaiting' || !job.tuneId) return
    const candidates = Array.isArray(job.candidates) ? job.candidates : []
    if (!candidates.length) return
    tuneIds[String(job.tuneId)] = true
  })
  return Object.keys(tuneIds).length
}

export function awaitingJobsForTune(jobs, tuneId) {
  const id = String(tuneId || '')
  return (jobs || []).filter(function(job) {
    if (!job || job.status !== 'awaiting') return false
    if (String(job.tuneId || '') !== id) return false
    return Array.isArray(job.candidates) && job.candidates.length > 0
  })
}

export { isTuneFieldEmptyForKind }
