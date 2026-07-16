import { candidateDisplayValue } from './fieldLookupApplyUtils'
import { isTuneFieldEmptyForKind } from './fieldLookupApplyUtils'

export function normalizeSuggestionKey(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Fingerprint for an Original / current field value (arrays use membership separately).
 */
export function originalValueFingerprint(value) {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return normalizeSuggestionKey(value.filter(Boolean).join(', '))
  }
  return normalizeSuggestionKey(displayFromOriginalValue(value))
}

/**
 * Normalize a candidate fingerprint for dedupe across suggestion lists.
 * Original / current rows fingerprint by their value so they block same-value hits.
 */
export function suggestionFingerprint(kind, candidate) {
  if (!candidate) return ''
  if (candidate.id === 'current' || candidate.isCurrent) {
    const raw = candidate.value !== undefined ? candidate.value : candidate.text
    const fromValue = originalValueFingerprint(raw)
    if (fromValue) return fromValue
  }
  return normalizeSuggestionKey(candidateDisplayValue(kind, candidate))
}

/**
 * True when a search candidate duplicates the Original Value
 * (exact match for scalars; membership for artist/alias arrays).
 */
export function candidateMatchesOriginal(kind, candidate, originalValue) {
  if (!candidate || originalValue == null) return false
  const candKey = suggestionFingerprint(kind, candidate)
  if (!candKey) return false
  if (Array.isArray(originalValue)) {
    if (originalValue.length === 0) return false
    const keys = {}
    originalValue.forEach(function(item) {
      const key = normalizeSuggestionKey(item)
      if (key) keys[key] = true
    })
    return !!keys[candKey]
  }
  const origKey = originalValueFingerprint(originalValue)
  if (!origKey) return false
  return candKey === origKey
}

/**
 * Merge unique candidates; Original baseline first when present blocks same-value hits.
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
    source: 'original',
    text: typeof value === 'string' ? value : undefined,
    value: value,
    label: 'Original',
  }
}

export function findOriginalCandidate(candidates) {
  return (Array.isArray(candidates) ? candidates : []).find(function(item) {
    return !!(item && (item.isCurrent || item.id === 'current'))
  }) || null
}

export function originalValueFromJob(job) {
  if (!job) return null
  if (job.originalValue !== undefined) return job.originalValue
  const candidate = findOriginalCandidate(job.candidates)
  if (!candidate) return null
  if (candidate.value !== undefined) return candidate.value
  if (candidate.text !== undefined) return candidate.text
  return null
}

export function displayFromOriginalValue(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return String(value)
}

/**
 * Search results only — excludes Original and any hit matching Original Value.
 * Pass `{ kind, originalValue }` or `{ kind, job }` when available so same-value
 * suggestions are dropped even if Original is shown separately in the picker.
 */
export function nonCurrentCandidates(candidates, options) {
  const opts = options || {}
  const kind = opts.kind || (opts.job && opts.job.kind) || ''
  let originalValue = opts.originalValue
  if (originalValue === undefined && opts.job) {
    originalValue = originalValueFromJob(opts.job)
  }
  if (originalValue === undefined) {
    const original = findOriginalCandidate(candidates)
    if (original) {
      originalValue = original.value !== undefined ? original.value : original.text
    }
  }
  return (Array.isArray(candidates) ? candidates : []).filter(function(item) {
    if (!item || item.isCurrent || item.id === 'current') return false
    if (originalValue === undefined || originalValue === null) return true
    return !candidateMatchesOriginal(kind, item, originalValue)
  })
}

/** Searchable suggestions for an awaiting job (excludes Original + same-value dupes). */
export function searchableSuggestions(job) {
  if (!job) return []
  return nonCurrentCandidates(job.candidates, {
    kind: job.kind,
    originalValue: originalValueFromJob(job),
    job: job,
  })
}

/**
 * Count tunes that have at least one awaiting field-lookup with candidates.
 */
export function countTunesWithFieldSuggestions(jobs) {
  const tuneIds = {}
  ;(jobs || []).forEach(function(job) {
    if (!job || job.status !== 'awaiting' || !job.tuneId) return
    if (!searchableSuggestions(job).length) return
    tuneIds[String(job.tuneId)] = true
  })
  return Object.keys(tuneIds).length
}

export function awaitingJobsForTune(jobs, tuneId) {
  const id = String(tuneId || '')
  return (jobs || []).filter(function(job) {
    if (!job || job.status !== 'awaiting') return false
    if (String(job.tuneId || '') !== id) return false
    return searchableSuggestions(job).length > 0
  })
}

/**
 * List-item shape for SearchResultPickerModal "Original Value" row.
 * Prefer the job-stored original from suggestion creation / manual edit —
 * not the live form value after applying a suggestion.
 */
export function buildPickerOriginalValueItem(options) {
  const opts = options || {}
  const value = opts.value
  const display = opts.display != null
    ? String(opts.display)
    : (displayFromOriginalValue(value) || '(empty)')
  const preview = display === '(empty)' ? '' : display
  return {
    title: preview || '(empty)',
    artist: '',
    preview: preview,
    abc: typeof opts.abc === 'string' ? opts.abc : (typeof value === 'string' ? value : ''),
    source: 'original',
    matchType: 'Original Value',
    __current: true,
    __currentValue: value,
  }
}

/** @deprecated Use buildPickerOriginalValueItem */
export function buildPickerCurrentValueItem(options) {
  return buildPickerOriginalValueItem(options)
}

/**
 * Prefer job-stored Original Value; fall back to live field when unset.
 */
export function resolveOriginalValueForPicker(job, fallbackValue) {
  const fromJob = originalValueFromJob(job)
  if (fromJob !== null && fromJob !== undefined) return fromJob
  return fallbackValue
}

export { isTuneFieldEmptyForKind }
