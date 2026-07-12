import { createImportCandidate } from './importReviewSession'
import { applyCandidateToTune } from './fieldLookupApplyUtils'
import {
  getState as getFieldLookupState,
  linkFieldLookupToReviewCandidate,
} from './tuneFieldLookupQueue'

const PROMOTE_KINDS = {
  composer: true,
  lyrics: true,
  notation: true,
  chords: true,
  links: true,
}

/**
 * Build a partial imported tune carrying only the looked-up field value(s)
 * so merge review can show Use import / Use search suggestions.
 */
export function buildImportedTuneFromFieldLookup(job, existingTune, abcTools) {
  const existing = existingTune || {}
  const imported = {
    name: existing.name || job.title || '',
  }
  if (job.kind === 'links') {
    const candidates = Array.isArray(job.candidates) ? job.candidates : []
    imported.links = candidates.filter(function(candidate) {
      return candidate && String(candidate.link || '').trim()
    }).map(function(candidate) {
      const link = {
        link: String(candidate.link).trim(),
        title: String(candidate.title || '').trim(),
      }
      if (candidate.image) link.image = candidate.image
      return link
    })
    return imported
  }
  const primary = (Array.isArray(job.candidates) && job.candidates[0])
    || (Array.isArray(job.manualCandidates) && job.manualCandidates[0])
    || null
  if (!primary) return imported

  const scratch = Object.assign({}, imported)
  applyCandidateToTune(scratch, job.kind, primary, abcTools)
  return scratch
}

export function buildFieldLookupReviewCandidate(job, existingTune, abcTools) {
  if (!job || !job.tuneId) return null
  if (!PROMOTE_KINDS[job.kind]) return null

  const imported = buildImportedTuneFromFieldLookup(job, existingTune, abcTools)
  const candidate = createImportCandidate({
    tune: imported,
    sourceKind: 'search-' + job.kind,
    mergeTargetId: String(job.tuneId),
    skipEnrich: true,
  })
  candidate.fieldLookupJobId = job.id
  candidate.fieldLookupKind = job.kind
  return candidate
}

/**
 * Awaiting field-lookup jobs that still need a review-queue candidate.
 */
export function getUnpromotedAwaitingFieldLookups() {
  const state = getFieldLookupState()
  return (state.jobs || []).filter(function(job) {
    return job
      && job.status === 'awaiting'
      && job.tuneId
      && !job.reviewCandidateId
      && PROMOTE_KINDS[job.kind]
  })
}

/**
 * Create import-review candidates for awaiting field lookups and link the jobs.
 * Returns { candidates, linkedJobIds }.
 */
export function promoteAwaitingFieldLookups(options) {
  const opts = options || {}
  const getTune = opts.getTune
  const abcTools = opts.abcTools || null
  const jobs = getUnpromotedAwaitingFieldLookups()
  const candidates = []
  const linkedJobIds = []

  jobs.forEach(function(job) {
    const existing = typeof getTune === 'function' ? getTune(job.tuneId) : null
    if (!existing) return
    const candidate = buildFieldLookupReviewCandidate(job, existing, abcTools)
    if (!candidate) return
    linkFieldLookupToReviewCandidate(job.id, candidate.id)
    candidates.push(candidate)
    linkedJobIds.push(job.id)
  })

  return { candidates: candidates, linkedJobIds: linkedJobIds }
}
