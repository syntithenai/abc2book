import { createImportCandidate, isReviewSessionActive } from './importReviewSession'
import {
  applyCandidateToTune,
  candidateDisplayValue,
  fieldLookupKindToFormKey,
} from './fieldLookupApplyUtils'
import {
  clearOrphanFieldLookupReviewLinks,
  dismissAwaitingFieldLookupsMissingTune,
  getState as getFieldLookupState,
  linkFieldLookupToReviewCandidate,
} from './tuneFieldLookupQueue'
import { getImportReviewSession } from './importReviewSessionStore'
import { coalesceImportCandidates, fieldLookupJobIdsForCandidate } from './importReviewCandidateUtils'

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
  if (existing.composer) {
    imported.composer = existing.composer
  } else if (job.artist) {
    imported.composer = job.artist
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

  if (job.kind === 'chords') {
    const lyricText = String(
      primary.lyricText
      || (Array.isArray(primary.lyricLines) ? primary.lyricLines.join('\n') : '')
      || ''
    ).trim()
    if (lyricText) {
      imported.wLines = lyricText.split('\n')
    }
    return imported
  }

  const scratch = Object.assign({}, imported)
  applyCandidateToTune(scratch, job.kind, primary, abcTools)
  return scratch
}

export function buildFieldLookupReviewCandidate(job, existingTune, abcTools) {
  if (!job || (!job.tuneId && !job.candidateId)) return null
  if (!PROMOTE_KINDS[job.kind]) return null

  const imported = buildImportedTuneFromFieldLookup(job, existingTune, abcTools)
  const candidate = createImportCandidate({
    id: !job.tuneId && job.candidateId ? String(job.candidateId) : undefined,
    tune: imported,
    sourceKind: 'search-' + job.kind,
    mergeTargetId: job.tuneId ? String(job.tuneId) : null,
    skipEnrich: true,
  })
  candidate.fieldLookupJobId = job.id
  candidate.fieldLookupKind = job.kind
  candidate.fieldLookupJobIds = [job.id]
  candidate.fieldLookupKinds = [job.kind]
  return candidate
}

function jobSearchMode(job) {
  return job && job.options && job.options.searchMode
    ? String(job.options.searchMode)
    : ''
}

/**
 * Awaiting field-lookup jobs that still need a review-queue candidate.
 * Auto-mode field searches never promote; Review / unset (Enhance) do.
 * Candidate-scoped Add-form jobs promote only when orphaned (no live session).
 */
export function getUnpromotedAwaitingFieldLookups(options) {
  const opts = options || {}
  const session = opts.session || getImportReviewSession()
  const activeCandidateIds = {}
  if (isReviewSessionActive(session) && Array.isArray(session.candidates)) {
    session.candidates.forEach(function(candidate) {
      if (candidate && candidate.id) activeCandidateIds[String(candidate.id)] = true
    })
  }
  const state = getFieldLookupState()
  return (state.jobs || []).filter(function(job) {
    if (!job
      || job.status !== 'awaiting'
      || job.reviewCandidateId
      || !PROMOTE_KINDS[job.kind]) {
      return false
    }
    if (jobSearchMode(job) === 'auto') return false
    if (job.tuneId) return true
    if (!job.candidateId) return false
    // Still owned by an active Add/import candidate — stay on that form.
    if (activeCandidateIds[String(job.candidateId)]) return false
    return true
  })
}

/**
 * Create import-review candidates for awaiting field lookups, coalesced by tuneId
 * or orphan candidateId. Clears orphan review links first so reload survivors
 * can be re-promoted. Returns { candidates, linkedJobIds }.
 */
export function promoteAwaitingFieldLookups(options) {
  const opts = options || {}
  const getTune = opts.getTune
  const abcTools = opts.abcTools || null
  const session = opts.session || getImportReviewSession()
  clearOrphanFieldLookupReviewLinks(session)
  // Only when the caller knows the tune map is fully loaded.
  if (typeof getTune === 'function' && opts.dismissMissingTunes === true) {
    dismissAwaitingFieldLookupsMissingTune(getTune)
  }
  const jobs = getUnpromotedAwaitingFieldLookups({ session: session })
  const byTune = {}
  const byCandidate = {}

  jobs.forEach(function(job) {
    if (job.tuneId) {
      const existing = typeof getTune === 'function' ? getTune(job.tuneId) : null
      if (!existing) return
      const key = String(job.tuneId)
      if (!byTune[key]) byTune[key] = { existing: existing, jobs: [] }
      byTune[key].jobs.push(job)
      return
    }
    const key = String(job.candidateId)
    if (!byCandidate[key]) byCandidate[key] = { jobs: [] }
    byCandidate[key].jobs.push(job)
  })

  const candidates = []
  const linkedJobIds = []

  function linkGroup(groupJobs, coalesced) {
    groupJobs.forEach(function(job) {
      linkFieldLookupToReviewCandidate(job.id, coalesced.id)
      linkedJobIds.push(job.id)
    })
    candidates.push(coalesced)
  }

  Object.keys(byTune).forEach(function(tuneId) {
    const group = byTune[tuneId]
    const built = group.jobs.map(function(job) {
      return buildFieldLookupReviewCandidate(job, group.existing, abcTools)
    }).filter(Boolean)
    if (!built.length) return

    const coalesced = built.length === 1
      ? built[0]
      : coalesceImportCandidates(built[0], built.slice(1))

    coalesced.mergeTargetId = String(tuneId)
    if (built.length > 1) {
      coalesced.sourceKind = 'search-multi'
    }

    linkGroup(group.jobs, coalesced)
  })

  Object.keys(byCandidate).forEach(function(candidateId) {
    const group = byCandidate[candidateId]
    const built = group.jobs.map(function(job) {
      return buildFieldLookupReviewCandidate(job, {
        name: job.title || '',
        composer: job.artist || '',
      }, abcTools)
    }).filter(Boolean)
    if (!built.length) return

    const coalesced = built.length === 1
      ? built[0]
      : coalesceImportCandidates(built[0], built.slice(1))

    coalesced.mergeTargetId = null
    coalesced.id = String(candidateId)
    if (built.length > 1) {
      coalesced.sourceKind = 'search-multi'
    }

    linkGroup(group.jobs, coalesced)
  })

  return { candidates: candidates, linkedJobIds: linkedJobIds }
}

function draftFormOverrideForFieldLookup(kind, applied, abcTools) {
  if (!applied) return null
  const formKey = fieldLookupKindToFormKey(kind)
  if (!formKey) return null
  if (kind === 'composer') {
    const artist = String(applied.artist || '').trim()
    return artist ? { artist: artist } : null
  }
  if (kind === 'lyrics') {
    const text = String(applied.text || (Array.isArray(applied.lines) ? applied.lines.join('\n') : '')).trim()
    return text ? { lyrics: text } : null
  }
  if (kind === 'genre') {
    const genre = String(applied.genre || '').trim()
    return genre ? { genre: genre } : null
  }
  if (kind === 'artists') {
    const artist = String(applied.artist || '').trim()
    return artist ? { artists: [artist] } : null
  }
  if (kind === 'aliases') {
    const alias = String(applied.alias || '').trim()
    return alias ? { aliases: [alias] } : null
  }
  if (kind === 'links') {
    const link = String(applied.link || '').trim()
    if (!link) return null
    return {
      links: [{
        link: link,
        title: String(applied.title || '').trim(),
        image: applied.image || '',
      }],
    }
  }
  if (kind === 'notation' && abcTools && typeof abcTools.abc2json === 'function') {
    const abc = String(applied.abc || '').trim()
    if (!abc) return null
    const imported = abcTools.abc2json(abc)
    if (!imported) return { notes: abc }
    const notes = Array.isArray(imported.notes)
      ? imported.notes.join('\n')
      : candidateDisplayValue('notation', applied)
    return {
      notes: notes,
      voices: imported.voices || undefined,
    }
  }
  if (kind === 'chords') {
    const text = String(applied.chordProSource || applied.chordText || applied.abc || '').trim()
    return text ? { chords: text } : null
  }
  return null
}

/**
 * Apply a resolved Review field-lookup choice onto the linked import-review
 * candidate draft. Keeps the candidate (and sibling field suggestions).
 */
export function applyResolvedFieldLookupToImportSession(session, job, abcTools) {
  if (!session || !job || !job.appliedCandidate || !Array.isArray(session.candidates)) {
    return session
  }
  const reviewId = job.reviewCandidateId ? String(job.reviewCandidateId) : ''
  const jobId = String(job.id || '')
  let changed = false
  const candidates = session.candidates.map(function(candidate) {
    const ids = fieldLookupJobIdsForCandidate(candidate)
    const matches = (reviewId && String(candidate.id) === reviewId)
      || (jobId && ids.indexOf(jobId) >= 0)
    if (!matches) return candidate

    const tune = Object.assign({}, candidate.tune || {})
    applyCandidateToTune(tune, job.kind, job.appliedCandidate, abcTools)
    const formKey = fieldLookupKindToFormKey(job.kind)
    const pending = Object.assign({}, candidate.pendingInlineSuggestions || {})
    if (formKey && pending[formKey]) delete pending[formKey]
    if (job.kind === 'notation' && pending.notes) delete pending.notes
    if (job.kind === 'composer' && pending.artist) delete pending.artist

    const override = draftFormOverrideForFieldLookup(job.kind, job.appliedCandidate, abcTools)
    const draftFormOverrides = Object.assign({}, candidate.draftFormOverrides || {}, override || {})

    changed = true
    return Object.assign({}, candidate, {
      tune: tune,
      pendingInlineSuggestions: pending,
      draftFormOverrides: draftFormOverrides,
    })
  })
  if (!changed) return session
  return Object.assign({}, session, { candidates: candidates })
}
