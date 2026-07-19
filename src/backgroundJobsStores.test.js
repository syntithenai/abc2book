import * as stemDownloadQueue from './stemDownloadQueue'
import {
  patchPlaybackRegionScanJob,
  getAllPlaybackRegionScanJobs,
  cancelPlaybackRegionScanJob,
  clearInactivePlaybackRegionScanJobs,
} from './playbackRegionScanJobs'
import {
  patchMediaAnalysisJob,
  getAllMediaAnalysisJobs,
  cancelAllActiveMediaAnalysisJobs,
  clearInactiveMediaAnalysisJobs,
  resetMediaAnalysisJob,
} from './mediaAnalysisJobs'
import {
  syncImportReviewEnrichment,
  clearImportReviewEnrichmentBridge,
  getImportReviewEnrichmentSnapshot,
  __resetImportReviewEnrichmentBridgeForTests,
} from './importReviewEnrichmentBridge'
import {
  registerLongRunningJob,
  getActiveTrackedJobs,
  cancelTrackedJob,
  cancelAllTrackedJobs,
  __resetForTests,
} from './longRunningJobRegistry'
import {
  enqueueFileOcrJob,
  cancelFileOcrJob,
  clearInactiveFileOcrJobs,
  getFileOcrJobs,
  __resetFileOcrJobsForTests,
} from './fileOcrJobs'
import {
  countPlaybackScanIncomplete,
  countMediaAnalysisIncomplete,
  countFileOcrIncomplete,
  countImportEnrichmentIncomplete,
  countActiveSearchIncomplete,
  getFirstActiveBackgroundJobTab,
} from './backgroundJobsCounts'

jest.mock('./tuneFiles', function() {
  return {
    resolveTuneFileBlob: jest.fn(function() {
      return Promise.resolve({ blob: new Blob(['x'], { type: 'image/png' }) })
    }),
  }
})

jest.mock('./sheetImageTranscriptionClient', function() {
  return {
    transcribeSheetImageFile: jest.fn(function() {
      return new Promise(function() { /* hang so job stays active for cancel tests */ })
    }),
  }
})

describe('background job store APIs', function() {
  afterEach(function() {
    stemDownloadQueue.clearFinishedJobs()
    clearInactivePlaybackRegionScanJobs()
    clearInactiveMediaAnalysisJobs()
    clearInactiveFileOcrJobs()
    __resetFileOcrJobsForTests()
    clearImportReviewEnrichmentBridge()
    __resetImportReviewEnrichmentBridgeForTests()
    __resetForTests()
  })

  test('stemDownloadQueue.cancelAllJobs cancels pending jobs', function() {
    stemDownloadQueue.enqueueStemDownloadJob({
      tuneId: 't1',
      linkIndex: 0,
      src: 'audio.mp3',
      tune: { id: 't1', links: [{ link: 'audio.mp3' }] },
      tuneName: 'Tune',
    })
    expect(stemDownloadQueue.getState().jobs.some(function(job) {
      return job.status === 'pending'
    })).toBe(true)
    stemDownloadQueue.cancelAllJobs()
    expect(stemDownloadQueue.getState().jobs.every(function(job) {
      return job.status === 'cancelled'
    })).toBe(true)
  })

  test('playbackRegionScanJobs list, cancel, and clear inactive', function() {
    patchPlaybackRegionScanJob('t1', 0, {
      isScanning: true,
      status: 'Scanning...',
      progress: 10,
    })
    expect(getAllPlaybackRegionScanJobs().length).toBe(1)
    expect(countPlaybackScanIncomplete()).toBe(1)

    const controller = { abort: jest.fn() }
    patchPlaybackRegionScanJob('t1', 0, { abortController: controller })
    cancelPlaybackRegionScanJob('t1', 0)
    expect(controller.abort).toHaveBeenCalled()

    patchPlaybackRegionScanJob('t1', 0, { isScanning: false, status: 'Scan complete' })
    patchPlaybackRegionScanJob('t3', 0, {
      isScanning: false,
      status: 'Scan complete',
      progress: 100,
    })
    clearInactivePlaybackRegionScanJobs()
    expect(getAllPlaybackRegionScanJobs().length).toBe(0)
  })

  test('fileOcrJobs list, cancel, clear inactive, and count', function() {
    const job = enqueueFileOcrJob({
      tune: { id: 't-ocr', name: 'OCR Tune' },
      meta: { id: 'f1', name: 'sheet.png', type: 'image/png' },
    })
    expect(getFileOcrJobs().length).toBe(1)
    expect(countFileOcrIncomplete()).toBe(1)
    expect(getFirstActiveBackgroundJobTab(null)).toBe('file-ocr')

    // Cancel while still pending (before async runner starts)
    cancelFileOcrJob(job.id)
    expect(getFileOcrJobs()[0].status).toBe('cancelled')
    expect(countFileOcrIncomplete()).toBe(0)

    clearInactiveFileOcrJobs()
    expect(getFileOcrJobs().length).toBe(0)
  })

  test('mediaAnalysisJobs list, cancel all, and clear inactive', function() {
    patchMediaAnalysisJob('t1', {
      isAnalyzing: true,
      status: 'Analyzing...',
      progress: 25,
    })
    expect(getAllMediaAnalysisJobs().length).toBe(1)
    expect(countMediaAnalysisIncomplete()).toBe(1)

    const controller = { abort: jest.fn() }
    patchMediaAnalysisJob('t1', { abortController: controller })
    cancelAllActiveMediaAnalysisJobs()
    expect(controller.abort).toHaveBeenCalled()
    expect(getAllMediaAnalysisJobs().length).toBe(0)

    patchMediaAnalysisJob('t2', {
      isAnalyzing: false,
      status: 'Done',
      progress: 100,
      error: 'failed earlier',
    })
    clearInactiveMediaAnalysisJobs()
    expect(getAllMediaAnalysisJobs().length).toBe(0)
    resetMediaAnalysisJob('t2')
  })

  test('importReviewEnrichmentBridge sync and clear', function() {
    const onSkipJob = jest.fn()
    syncImportReviewEnrichment({
      jobs: [
        { id: 'j1', status: 'pending', title: 'Tune A' },
        { id: 'j2', status: 'running', title: 'Tune B' },
      ],
      onSkipJob: onSkipJob,
    })
    const snapshot = getImportReviewEnrichmentSnapshot()
    expect(snapshot.active).toBe(true)
    expect(snapshot.jobs.length).toBe(2)
    expect(countImportEnrichmentIncomplete()).toBe(2)
    snapshot.onSkipJob('j1')
    expect(onSkipJob).toHaveBeenCalledWith('j1')
    clearImportReviewEnrichmentBridge()
    expect(getImportReviewEnrichmentSnapshot().active).toBe(false)
    expect(countImportEnrichmentIncomplete()).toBe(0)
  })

  test('longRunningJobRegistry tracks labeled jobs and cancels them', function() {
    const onCancel = jest.fn()
    const unregister = registerLongRunningJob({
      label: 'Chord search',
      onCancel: onCancel,
    })
    expect(getActiveTrackedJobs().length).toBe(1)
    expect(countActiveSearchIncomplete()).toBe(1)
    cancelTrackedJob(getActiveTrackedJobs()[0].id)
    expect(onCancel).toHaveBeenCalled()
    unregister()
  })

  test('longRunningJobRegistry cancelAllTrackedJobs', function() {
    const first = jest.fn()
    const second = jest.fn()
    registerLongRunningJob({ label: 'One', onCancel: first })
    registerLongRunningJob({ label: 'Two', onCancel: second })
    cancelAllTrackedJobs()
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })

  test('getFirstActiveBackgroundJobTab picks first tab with incomplete jobs', function() {
    expect(getFirstActiveBackgroundJobTab(null)).toBeNull()

    patchMediaAnalysisJob('t1', {
      isAnalyzing: true,
      status: 'Analyzing...',
      progress: 10,
    })
    expect(getFirstActiveBackgroundJobTab(null)).toBe('media-analysis')

    patchPlaybackRegionScanJob('t2', 0, {
      isScanning: true,
      status: 'Scanning...',
      progress: 5,
    })
    // playback-scans comes before media-analysis in Settings tab order
    expect(getFirstActiveBackgroundJobTab(null)).toBe('playback-scans')
  })
})
