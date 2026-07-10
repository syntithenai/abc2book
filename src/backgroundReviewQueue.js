import { enrichmentSummary, findEnrichmentJob } from './importReviewEnrichmentQueue'
import { getImportReviewSession } from './importReviewSessionStore'
import { getAllMediaAnalysisJobs, getMediaAnalysisJob } from './mediaAnalysisJobs'

const reviewedMediaAnalysisTuneIds = new Set()
const listeners = new Set()

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

function analysisNeedsReview(analysis) {
  if (!analysis || !analysis.formatted) return false
  const formatted = analysis.formatted
  if (formatted.lyricsText && String(formatted.lyricsText).trim()) return true
  if (formatted.melodyNotesText && String(formatted.melodyNotesText).trim()) return true
  if (formatted.chordGridText && String(formatted.chordGridText).trim()) return true
  return false
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
  const imported = importSession && importSession.importedCandidateIds
    ? importSession.importedCandidateIds
    : {}
  const jobs = importSession && Array.isArray(importSession.enrichmentJobs)
    ? importSession.enrichmentJobs
    : []
  const enrichSummary = enrichmentSummary(jobs)

  let importReady = 0
  const importReadyIds = []
  const candidates = importSession && Array.isArray(importSession.candidates)
    ? importSession.candidates
    : []
  candidates.forEach(function(candidate) {
    if (!candidate || !candidate.id || imported[candidate.id]) return
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
      return
    }
    if (full.analysis && analysisNeedsReview(full.analysis) && !reviewedMediaAnalysisTuneIds.has(tuneId)) {
      mediaReady.push(tuneId)
    }
  })

  const ready = importReady + mediaReady.length
  const processing = importProcessing + mediaProcessing.length
  const total = importTotal + mediaReady.length + mediaProcessing.length

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
  ].join('|')
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
