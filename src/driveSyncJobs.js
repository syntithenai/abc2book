/**
 * Aggregate Google Drive sync activities for Settings → Background jobs.
 */
import { parseExternalMediaCacheKey } from './mediaCacheStorage'
import {
  getMediaCacheDriveBackupStatus,
  subscribeMediaCacheDriveBackup,
} from './mediaCacheDriveBackup'
import {
  getScratchpadSyncState,
  subscribeScratchpadSync,
} from './scratchpadSyncStatus'
import {
  scratchpadPendingSyncSummary,
  subscribeScratchpad,
} from './scratchpadStore'
import {
  getAudioAnalysisDriveSyncStatus,
  subscribeAudioAnalysisDriveSync,
} from './audioAnalysisCloudSync'
import {
  getDriveSongbookSyncState,
  subscribeDriveSongbookSync,
} from './driveSongbookSyncStatus'

export const DRIVE_SYNC_JOB_IDS = {
  songbook: 'songbook',
  cachedMedia: 'cached-media',
  scratchpad: 'scratchpad',
  audioAnalysis: 'audio-analysis',
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function songbookJob() {
  const state = getDriveSongbookSyncState()
  const status = state.status || 'idle'
  let message = state.message || ''
  if (status === 'success' && state.lastSyncedAt && !message) {
    message = 'Last saved ' + formatTime(state.lastSyncedAt)
  }
  return {
    id: DRIVE_SYNC_JOB_IDS.songbook,
    title: 'Songbook',
    kind: 'songbook',
    status: status,
    message: message,
    error: status === 'error' ? (state.lastError || state.message) : null,
    incomplete: status === 'pending' || status === 'running',
  }
}

function cachedMediaJob() {
  const status = getMediaCacheDriveBackupStatus()
  const pendingCount = status.pendingCount || 0
  let jobStatus = 'idle'
  if (status.syncing) jobStatus = 'running'
  else if (pendingCount > 0) jobStatus = 'pending'
  else if (status.lastError) jobStatus = 'error'
  else if (status.lastResult && status.lastResult.ok) jobStatus = 'success'

  let message = ''
  if (status.syncing) {
    if (status.progressTotal > 0) {
      message = 'Uploading ' + status.progressCurrent + ' of ' + status.progressTotal
    } else {
      message = 'Syncing cached media with Google Drive…'
    }
  } else if (pendingCount > 0) {
    message = pendingCount + ' file' + (pendingCount === 1 ? '' : 's') + ' waiting to upload'
  } else if (status.lastError) {
    message = status.lastError
  } else if (status.lastResult && status.lastResult.uploaded) {
    message = 'Uploaded ' + status.lastResult.uploaded + ' file' + (status.lastResult.uploaded === 1 ? '' : 's')
  } else if (status.backedUpCount) {
    message = status.backedUpCount + ' file' + (status.backedUpCount === 1 ? '' : 's') + ' backed up on Drive'
  } else if (!status.enabled) {
    message = 'Cached media backup is off'
  }

  const parsed = status.currentKey ? parseExternalMediaCacheKey(status.currentKey) : null
  return {
    id: DRIVE_SYNC_JOB_IDS.cachedMedia,
    title: 'Cached media backup',
    kind: 'cached-media',
    status: jobStatus,
    message: message,
    error: jobStatus === 'error' ? status.lastError : null,
    progressCurrent: status.progressCurrent || 0,
    progressTotal: status.progressTotal || 0,
    currentTuneId: parsed && parsed.tuneId ? parsed.tuneId : null,
    currentSrc: parsed && parsed.src ? parsed.src : null,
    enabled: !!status.enabled,
    incomplete: status.syncing || pendingCount > 0,
  }
}

function scratchpadJob() {
  const state = getScratchpadSyncState()
  const pending = scratchpadPendingSyncSummary()
  const pendingCount = (pending.pendingItems || 0) + (pending.tombstones || 0)
  let jobStatus = state.status || 'idle'
  if (jobStatus === 'syncing') jobStatus = 'running'
  else if (jobStatus !== 'error' && jobStatus !== 'success' && pending.pending) {
    jobStatus = 'pending'
  }
  let message = state.message || ''
  if (!message && pending.pending) {
    message = pendingCount + ' item' + (pendingCount === 1 ? '' : 's') + ' waiting to sync'
  }
  return {
    id: DRIVE_SYNC_JOB_IDS.scratchpad,
    title: 'Scratchpad',
    kind: 'scratchpad',
    status: jobStatus,
    message: message,
    error: jobStatus === 'error' ? (state.message || 'Scratchpad sync failed') : null,
    incomplete: jobStatus === 'running' || jobStatus === 'pending',
  }
}

function audioAnalysisJob() {
  const state = getAudioAnalysisDriveSyncStatus()
  let jobStatus = 'idle'
  if (state.syncing) jobStatus = 'running'
  else if (state.lastError) jobStatus = 'error'
  else if (state.lastResult && state.lastResult.ok) jobStatus = 'success'

  let message = state.message || ''
  if (!message && state.lastResult && state.lastResult.ok) {
    const parts = []
    if (state.lastResult.sets != null) parts.push(state.lastResult.sets + ' set(s)')
    if (state.lastResult.uploaded) parts.push('uploaded ' + state.lastResult.uploaded)
    if (state.lastResult.downloaded) parts.push('downloaded ' + state.lastResult.downloaded)
    message = parts.length ? ('Synced ' + parts.join('; ')) : 'Audio Analysis synced'
  }
  return {
    id: DRIVE_SYNC_JOB_IDS.audioAnalysis,
    title: 'Audio Analysis',
    kind: 'audio-analysis',
    status: jobStatus,
    message: message,
    error: jobStatus === 'error' ? state.lastError : null,
    progressCurrent: state.current || 0,
    progressTotal: state.total || 0,
    incomplete: !!state.syncing,
  }
}

export function getDriveSyncJobs() {
  return [
    songbookJob(),
    cachedMediaJob(),
    scratchpadJob(),
    audioAnalysisJob(),
  ]
}

export function countDriveSyncIncomplete() {
  return getDriveSyncJobs().filter(function(job) {
    return job.incomplete
  }).length
}

export function getDriveSyncJobsKey() {
  return getDriveSyncJobs().map(function(job) {
    return [
      job.id,
      job.status,
      job.message || '',
      job.progressCurrent || 0,
      job.progressTotal || 0,
      job.incomplete ? '1' : '0',
    ].join(':')
  }).join('|')
}

export function subscribeDriveSyncJobs(listener) {
  const unsubs = [
    subscribeDriveSongbookSync(listener),
    subscribeMediaCacheDriveBackup(listener),
    subscribeScratchpadSync(listener),
    subscribeScratchpad(listener),
    subscribeAudioAnalysisDriveSync(listener),
  ]
  return function() {
    unsubs.forEach(function(unsub) { unsub() })
  }
}
