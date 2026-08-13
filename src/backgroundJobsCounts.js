import { countActiveFifoJobs } from './components/backgroundJobs/jobQueueUtils'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'
import * as bulkComposerDiscoveryQueue from './bulkComposerDiscoveryQueue'
import * as mediaCacheQueue from './mediaCacheQueue'
import * as stemCreateQueue from './stemCreateQueue'
import { getAllPlaybackRegionScanJobs } from './playbackRegionScanJobs'
import { getAllMediaAnalysisJobs } from './mediaAnalysisJobs'
import { getFileOcrJobs } from './fileOcrJobs'
import {
  getActiveBulkCheckSession,
  isBulkCheckPhaseRunning,
} from './bulkCheckSessionStore'
import { isBulkCheckRunnerActive } from './bulkCheckRunner'
import { getImportReviewEnrichmentSnapshot } from './importReviewEnrichmentBridge'
import { getManualTrackedSearchJobs } from './longRunningJobRegistry'
import { countScratchpadBackgroundIncomplete } from './scratchpadBackgroundJobs'
import { enrichmentSummary } from './importReviewEnrichmentQueue'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import { isMediaAnalysisLookupJob } from './mediaAnalysisSuggestions'
import { countActiveAudioGenerationJobs } from './audioGenerationJobStore'
import { countActiveChordReadinessJobs } from './chordReadinessCleanupQueue'
import { getStemAnalysisJobSnapshot } from './stemAnalysisJobStore'

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
  const liveJob = getStemAnalysisJobSnapshot()
  if (mediaController) {
    if (mediaController.stemSeparationActive) count += 1
    else if (mediaController.stemAnalysisProgress && mediaController.stemAnalysisProgress.active) {
      count += 1
    }
  } else if (liveJob.active) {
    count += 1
  }
  return count
}

export function countAudioGenerationIncomplete() {
  return countActiveAudioGenerationJobs()
}

export function countChordCleanupIncomplete() {
  return countActiveChordReadinessJobs()
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

export function countFileOcrIncomplete() {
  return getFileOcrJobs().filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
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
  const fieldJobs = tuneFieldLookupQueue.getState().jobs.filter(function(job) {
    if (isMediaAnalysisLookupJob(job)) return false
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
  }).length
  return fieldJobs + getManualTrackedSearchJobs().length
}

/** Display order of Background Jobs tabs in Settings (eventKey → count field). */
export const BACKGROUND_JOB_TAB_ORDER = [
  { eventKey: 'research', countKey: 'research' },
  { eventKey: 'composer-discovery', countKey: 'composerDiscovery' },
  { eventKey: 'media-cache', countKey: 'mediaCache' },
  { eventKey: 'stem-create', countKey: 'stemCreate' },
  { eventKey: 'audio-generation', countKey: 'audioGeneration' },
  { eventKey: 'chord-cleanup', countKey: 'chordCleanup' },
  { eventKey: 'playback-scans', countKey: 'playbackScans' },
  { eventKey: 'bulk-check', countKey: 'bulkCheck' },
  { eventKey: 'media-analysis', countKey: 'mediaAnalysis' },
  { eventKey: 'file-ocr', countKey: 'fileOcr' },
  { eventKey: 'scratchpad', countKey: 'scratchpad' },
  { eventKey: 'import-enrichment', countKey: 'importEnrichment' },
  { eventKey: 'active-searches', countKey: 'activeSearches' },
]

export function getBackgroundJobTabCounts(mediaController) {
  return {
    research: countBackgroundResearchIncomplete(),
    composerDiscovery: countComposerDiscoveryIncomplete(),
    mediaCache: countMediaCacheIncomplete(),
    stemCreate: countStemCreateIncomplete(mediaController),
    audioGeneration: countAudioGenerationIncomplete(),
    chordCleanup: countChordCleanupIncomplete(),
    playbackScans: countPlaybackScanIncomplete(),
    mediaAnalysis: countMediaAnalysisIncomplete(),
    fileOcr: countFileOcrIncomplete(),
    scratchpad: countScratchpadBackgroundIncomplete(),
    bulkCheck: countBulkCheckIncomplete(),
    importEnrichment: countImportEnrichmentIncomplete(),
    activeSearches: countActiveSearchIncomplete(),
  }
}

/** First Background Jobs tab (in Settings order) with incomplete work, or null. */
export function getFirstActiveBackgroundJobTab(mediaController) {
  const counts = getBackgroundJobTabCounts(mediaController)
  for (let i = 0; i < BACKGROUND_JOB_TAB_ORDER.length; i++) {
    const tab = BACKGROUND_JOB_TAB_ORDER[i]
    if (counts[tab.countKey] > 0) return tab.eventKey
  }
  return null
}

export function getBackgroundJobTabCountsKey(mediaController) {
  const counts = getBackgroundJobTabCounts(mediaController)
  return [
    counts.research,
    counts.composerDiscovery,
    counts.mediaCache,
    counts.stemCreate,
    counts.audioGeneration,
    counts.chordCleanup,
    counts.playbackScans,
    counts.mediaAnalysis,
    counts.fileOcr,
    counts.scratchpad,
    counts.bulkCheck,
    counts.importEnrichment,
    counts.activeSearches,
  ].join('|')
}
