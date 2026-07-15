import { createImportCandidate } from './importReviewSession'
import { applyCandidateToTune } from './fieldLookupApplyUtils'
import {
  getState as getFieldLookupState,
  linkFieldLookupToReviewCandidate,
} from './tuneFieldLookupQueue'
import { coalesceImportCandidates } from './importReviewCandidateUtils'

const PROMOTE_KINDS = {
  composer: true,
  lyrics: true,
  notation: true,
  chords: true,
  links: true,
  genre: true,
  artists: true,
  aliases: true,
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
  if (job.kind === 'artists' || job.kind === 'aliases') {
    const listKey = job.kind
    const valueKey = job.kind === 'artists' ? 'artist' : 'alias'
    imported[listKey] = (Array.isArray(job.candidates) ? job.candidates : [])
      .map(function(candidate) {
        return String((candidate && candidate[valueKey]) || '').trim()
      })
      .filter(Boolean)
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
  candidate.fieldLookupJobIds = [job.id]
  candidate.fieldLookupKinds = [job.kind]
  return candidate
}

/**
 * Awaiting field-lookup jobs that still need a review-queue candidate.
 * Auto-mode field searches never promote; Review / unset (Enhance) do.
 */
export function getUnpromotedAwaitingFieldLookups() {
  const state = getFieldLookupState()
  return (state.jobs || []).filter(function(job) {
    if (!job
      || job.status !== 'awaiting'
      || !job.tuneId
      || job.reviewCandidateId
      || !PROMOTE_KINDS[job.kind]) {
      return false
    }
    const mode = job.options && job.options.searchMode
    if (mode === 'auto') return false
    return true
  })
}

/**
 * Create import-review candidates for awaiting field lookups, coalesced by tuneId.
 * Returns { candidates, linkedJobIds }.
 */
export function promoteAwaitingFieldLookups(options) {
  const opts = options || {}
  const getTune = opts.getTune
  const abcTools = opts.abcTools || null
  const jobs = getUnpromotedAwaitingFieldLookups()
  const byTune = {}

  jobs.forEach(function(job) {
    const existing = typeof getTune === 'function' ? getTune(job.tuneId) : null
    if (!existing) return
    const key = String(job.tuneId)
    if (!byTune[key]) byTune[key] = { existing: existing, jobs: [] }
    byTune[key].jobs.push(job)
  })

  const candidates = []
  const linkedJobIds = []

  Object.keys(byTune).forEach(function(tuneId) {
    const group = byTune[tuneId]
    const built = group.jobs.map(function(job) {
      return buildFieldLookupReviewCandidate(job, group.existing, abcTools)
    }).filter(Boolean)
    if (!built.length) return

    const coalesced = built.length === 1
      ? built[0]
      : coalesceImportCandidates(built[0], built.slice(1))

    // Keep a stable id from the first built candidate.
    coalesced.mergeTargetId = String(tuneId)
    if (built.length > 1) {
      coalesced.sourceKind = 'search-multi'
    }

    group.jobs.forEach(function(job) {
      linkFieldLookupToReviewCandidate(job.id, coalesced.id)
      linkedJobIds.push(job.id)
    })
    candidates.push(coalesced)
  })

  return { candidates: candidates, linkedJobIds: linkedJobIds }
}
