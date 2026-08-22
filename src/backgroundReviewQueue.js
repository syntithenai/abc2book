import { enrichmentSummary, findEnrichmentJob } from './importReviewEnrichmentQueue'
import { getImportReviewSession } from './importReviewSessionStore'
import { isAddDraftCandidate, isReviewSessionActive } from './importReviewSession'
import { getAllMediaAnalysisJobs, getMediaAnalysisJob } from './mediaAnalysisJobs'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import { searchableSuggestions } from './fieldSuggestionsUtils'
import { getFileOcrReviewSummary } from './fileOcrJobs'

const reviewedMediaAnalysisTuneIds = new Set()
const listeners = new Set()

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function markMediaAnalysisReviewed(tuneId) {
  if (!tuneId) return
  reviewedMediaAnalysisTuneIds.add(String(tuneId))
  notify()
}

export function clearMediaAnalysisReviewed(tuneId) {
  if (!tuneId) return
  reviewedMediaAnalysisTuneIds.delete(String(tuneId))
  notify()
}

export function getBackgroundReviewSummary() {
  const importSession = getImportReviewSession()
  // Blank Add drafts are not Review-queue work, but parked Enhance/import
  // candidates beside an open Add draft still count.
  const sessionActive = isReviewSessionActive(importSession)
  const imported = sessionActive && importSession.importedCandidateIds
    ? importSession.importedCandidateIds
    : {}
  const jobs = sessionActive && Array.isArray(importSession.enrichmentJobs)
    ? importSession.enrichmentJobs
    : []
  const enrichSummary = enrichmentSummary(jobs)

  let importReady = 0
  const importReadyIds = []
  const candidates = sessionActive && Array.isArray(importSession.candidates)
    ? importSession.candidates.filter(function(candidate) {
      return candidate && !isAddDraftCandidate(candidate)
    })
    : []
  candidates.forEach(function(candidate) {
    if (!candidate || !candidate.id || imported[candidate.id] || candidate.imported) return
    const job = findEnrichmentJob(jobs, candidate.id)
    if (job && (job.status === 'pending' || job.status === 'running')) return
    importReady += 1
    importReadyIds.push(String(candidate.id))
  })

  const importProcessing = enrichSummary.pending + enrichSummary.running
  const importTotal = candidates.length

  const mediaReady = []
  const mediaProcessing = []
  getAllMediaAnalysisJobs().forEach(function(job) {
    const full = getMediaAnalysisJob(job.tuneId)
    const tuneId = String(job.tuneId)
    if (full.isAnalyzing) {
      mediaProcessing.push(tuneId)
    }
    // Completed analysis persists field suggestions; it is not Import Review work.
  })

  // Field-lookup suggestions are reviewed on /review (Suggestions), not Import Review.
  // Count tune-scoped awaiting jobs that still have searchable suggestions.
  const fieldLookupAwaitingJobs = tuneFieldLookupQueue.getState().jobs.filter(function(job) {
    if (!job || job.status !== 'awaiting' || !job.tuneId) return false
    if (job.reviewCandidateId) return false
    return searchableSuggestions(job).length > 0
  })
  const fieldLookupProcessing = tuneFieldLookupQueue.getState().jobs.filter(function(job) {
    if (!job || !job.tuneId) return false
    return job.status === 'pending' || job.status === 'running'
  })

  const fileOcrSummary = getFileOcrReviewSummary()

  const ready = importReady + fileOcrSummary.ready.length + fieldLookupAwaitingJobs.length
  const processing = importProcessing + mediaProcessing.length + fieldLookupProcessing.length + fileOcrSummary.processing.length
  const total = importTotal + mediaProcessing.length
    + fieldLookupProcessing.length
    + fieldLookupAwaitingJobs.length
    + fileOcrSummary.total

  return {
    ready: ready,
    processing: processing,
    total: total,
    importReady: importReady,
    importReadyIds: importReadyIds,
    importProcessing: importProcessing,
    importTotal: importTotal,
    mediaReady: mediaReady,
    mediaProcessing: mediaProcessing,
    fieldLookupAwaiting: fieldLookupAwaitingJobs.map(function(job) { return job.id }),
    fieldLookupAwaitingJobs: fieldLookupAwaitingJobs.map(function(job) {
      return {
        id: job.id,
        tuneId: job.tuneId || null,
        candidateId: job.candidateId || null,
        kind: job.kind,
        label: job.label || job.kind,
        tuneName: job.tuneName || job.title || '',
        title: job.title || '',
        candidateCount: Array.isArray(job.candidates) ? job.candidates.length : 0,
      }
    }),
    fieldLookupProcessing: fieldLookupProcessing.map(function(job) { return job.id }),
    fileOcrReady: fileOcrSummary.ready,
    fileOcrProcessing: fileOcrSummary.processing,
    fileOcrFailed: fileOcrSummary.failed || [],
    hasImportSession: !!importSession,
  }
}

export function getBackgroundReviewRevision() {
  const summary = getBackgroundReviewSummary()
  return [
    summary.ready,
    summary.processing,
    summary.total,
    summary.importReady,
    summary.mediaReady.join(','),
    summary.mediaProcessing.join(','),
    (summary.fieldLookupAwaiting || []).join(','),
    (summary.fieldLookupProcessing || []).join(','),
    (summary.fileOcrReady || []).join(','),
    (summary.fileOcrProcessing || []).join(','),
    (summary.fileOcrFailed || []).join(','),
  ].join('|')
}

export function notifyBackgroundReviewQueue() {
  notify()
}

export function subscribeBackgroundReviewQueue(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function __resetBackgroundReviewQueueForTests() {
  reviewedMediaAnalysisTuneIds.clear()
  listeners.clear()
}
