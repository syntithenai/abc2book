import {
  getDriveSyncJobs,
  countDriveSyncIncomplete,
} from './driveSyncJobs'
import {
  markDriveSongbookSyncPending,
  markDriveSongbookSyncRunning,
  markDriveSongbookSyncSuccess,
  __resetDriveSongbookSyncForTests,
} from './driveSongbookSyncStatus'
import {
  patchScratchpadSyncState,
  resetScratchpadSyncState,
} from './scratchpadSyncStatus'
import {
  __resetAudioAnalysisDriveSyncStatusForTests,
  __setAudioAnalysisDriveSyncStatusForTests,
} from './audioAnalysisCloudSync'
import { getFirstActiveBackgroundJobTab } from './backgroundJobsCounts'

describe('driveSyncJobs', function() {
  beforeEach(function() {
    __resetDriveSongbookSyncForTests()
    resetScratchpadSyncState()
    __resetAudioAnalysisDriveSyncStatusForTests()
    localStorage.clear()
  })

  test('idle activities are not incomplete', function() {
    const jobs = getDriveSyncJobs()
    expect(jobs.length).toBe(4)
    expect(jobs.map(function(job) { return job.id })).toEqual([
      'songbook',
      'cached-media',
      'scratchpad',
      'audio-analysis',
    ])
    expect(countDriveSyncIncomplete()).toBe(0)
  })

  test('songbook pending and running count as incomplete', function() {
    markDriveSongbookSyncPending()
    expect(countDriveSyncIncomplete()).toBe(1)
    expect(getDriveSyncJobs()[0].status).toBe('pending')
    markDriveSongbookSyncRunning()
    expect(getDriveSyncJobs()[0].status).toBe('running')
    expect(countDriveSyncIncomplete()).toBe(1)
    markDriveSongbookSyncSuccess()
    expect(getDriveSyncJobs()[0].status).toBe('success')
    expect(countDriveSyncIncomplete()).toBe(0)
  })

  test('scratchpad syncing counts as incomplete', function() {
    patchScratchpadSyncState({
      status: 'syncing',
      message: 'Syncing scratchpad with Google Drive…',
    })
    const job = getDriveSyncJobs().find(function(item) { return item.id === 'scratchpad' })
    expect(job.status).toBe('running')
    expect(countDriveSyncIncomplete()).toBe(1)
  })

  test('audio analysis syncing counts as incomplete', function() {
    __setAudioAnalysisDriveSyncStatusForTests({
      syncing: true,
      message: 'Uploading note audio',
      current: 2,
      total: 5,
    })
    const job = getDriveSyncJobs().find(function(item) { return item.id === 'audio-analysis' })
    expect(job.status).toBe('running')
    expect(job.progressCurrent).toBe(2)
    expect(job.progressTotal).toBe(5)
    expect(countDriveSyncIncomplete()).toBe(1)
  })

  test('getFirstActiveBackgroundJobTab opens Google Drive when it has work', function() {
    expect(getFirstActiveBackgroundJobTab(null)).toBeNull()
    markDriveSongbookSyncRunning()
    expect(getFirstActiveBackgroundJobTab(null)).toBe('google-drive')
  })
})
