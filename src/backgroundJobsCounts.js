import { countActiveFifoJobs } from './components/backgroundJobs/jobQueueUtils'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'
import * as bulkComposerDiscoveryQueue from './bulkComposerDiscoveryQueue'
import * as mediaCacheQueue from './mediaCacheQueue'
import * as stemCreateQueue from './stemCreateQueue'
import { getAllPlaybackRegionScanJobs } from './playbackRegionScanJobs'
import { getAllMediaAnalysisJobs } from './mediaAnalysisJobs'
import {
  getActiveBulkCheckSession,
  isBulkCheckPhaseRunning,
} from './bulkCheckSessionStore'
import { isBulkCheckRunnerActive } from './bulkCheckRunner'
import { getImportReviewEnrichmentSnapshot } from './importReviewEnrichmentBridge'
import { getActiveTrackedJobs } from './longRunningJobRegistry'
import { enrichmentSummary } from './importReviewEnrichmentQueue'

export function countBackgroundResearchIncomplete() {
  return countActiveFifoJobs(bulkBackgroundResearchQueue.getState().jobs)
}

export function countComposerDiscoveryIncomplete() {
  return bulkComposerDiscoveryQueue.getState().jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
  }).length
}

export function countMediaCacheIncomplete() {
  return countActiveFifoJobs(mediaCacheQueue.getState().jobs)
}

export function countStemCreateIncomplete(mediaController) {
  let count = countActiveFifoJobs(stemCreateQueue.getState().jobs)
  if (mediaController) {
    if (mediaController.stemSeparationActive) count += 1
    else if (mediaController.stemAnalysisProgress && mediaController.stemAnalysisProgress.active) {
      count += 1
    }
  }
  return count
}

export function countPlaybackScanIncomplete() {
  return getAllPlaybackRegionScanJobs().filter(function(job) {
    return job.isScanning
  }).length
}

export function countMediaAnalysisIncomplete() {
  return getAllMediaAnalysisJobs().filter(function(job) {
    return job.isAnalyzing
  }).length
}

export function countBulkCheckIncomplete() {
  const session = getActiveBulkCheckSession()
  if (!session) return 0
  if (isBulkCheckRunnerActive()) return 1
  if (isBulkCheckPhaseRunning(session.phase)) return 1
  return 0
}

export function countImportEnrichmentIncomplete() {
  const snapshot = getImportReviewEnrichmentSnapshot()
  if (!snapshot.active) return 0
  const summary = enrichmentSummary(snapshot.jobs)
  return summary.awaiting + summary.pending + summary.running
}

export function countActiveSearchIncomplete() {
  return getActiveTrackedJobs().length
}

export function getBackgroundJobTabCounts(mediaController) {
  return {
    research: countBackgroundResearchIncomplete(),
    composerDiscovery: countComposerDiscoveryIncomplete(),
    mediaCache: countMediaCacheIncomplete(),
    stemCreate: countStemCreateIncomplete(mediaController),
    playbackScans: countPlaybackScanIncomplete(),
    mediaAnalysis: countMediaAnalysisIncomplete(),
    bulkCheck: countBulkCheckIncomplete(),
    importEnrichment: countImportEnrichmentIncomplete(),
    activeSearches: countActiveSearchIncomplete(),
  }
}

export function getBackgroundJobTabCountsKey(mediaController) {
  const counts = getBackgroundJobTabCounts(mediaController)
  return [
    counts.research,
    counts.composerDiscovery,
    counts.mediaCache,
    counts.stemCreate,
    counts.playbackScans,
    counts.mediaAnalysis,
    counts.bulkCheck,
    counts.importEnrichment,
    counts.activeSearches,
  ].join('|')
}
