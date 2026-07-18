jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    },
  }
})

jest.mock('./fileOcrJobs', function() {
  return {
    enqueueFileOcrJob: jest.fn(),
  }
})

jest.mock('./useTuneMediaAnalysis', function() {
  return {
    requestTuneMediaAnalysis: jest.fn(),
  }
})

jest.mock('./importReviewSessionStore', function() {
  return {
    getImportReviewSession: jest.fn(function() {
      return { candidates: [{ id: 'add', addDraft: true }], entryMode: 'add' }
    }),
    setImportReviewSession: jest.fn(),
    hideImportReviewUi: jest.fn(),
    clearImportReviewSession: jest.fn(),
  }
})

jest.mock('./importReviewSession', function() {
  return {
    removeAddDraftFromSession: jest.fn(function() { return null }),
  }
})

jest.mock('./importReviewEnrichmentBridge', function() {
  return {
    clearImportReviewEnrichmentBridge: jest.fn(),
  }
})

jest.mock('./mediaAnalysisJobs', function() {
  return {
    subscribeMediaAnalysisJobs: jest.fn(function() { return function() {} }),
    getMediaAnalysisJob: jest.fn(function() {
      return { isAnalyzing: false, analysis: { formatted: {} } }
    }),
  }
})

import {
  queueOcrFromAddDraft,
  queueMediaAnalysisFromAddDraft,
  __resetAttachAnalyzePendingForTests,
} from './addAttachAnalyzeActions'
import { enqueueFileOcrJob } from './fileOcrJobs'
import { requestTuneMediaAnalysis } from './useTuneMediaAnalysis'
import { toast } from 'react-toastify'
import { hideImportReviewUi } from './importReviewSessionStore'

describe('addAttachAnalyzeActions', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    __resetAttachAnalyzePendingForTests()
    enqueueFileOcrJob.mockReturnValue({ id: 'ocr-job', tuneId: 't1', status: 'pending' })
    requestTuneMediaAnalysis.mockResolvedValue({ ok: true })
  })

  test('queueOcrFromAddDraft enqueues, toasts, and closes Add', async function() {
    const saveTune = jest.fn(function(t) { return t })
    const navigate = jest.fn()
    const tune = {
      id: 't1',
      name: 'Sheet',
      activeFile: 'f1',
      tuneFiles: [{ id: 'f1', name: 'page.png' }],
    }
    const result = await queueOcrFromAddDraft({
      tune: tune,
      tunebook: { saveTune: saveTune },
      navigate: navigate,
    })
    expect(saveTune).toHaveBeenCalled()
    expect(enqueueFileOcrJob).toHaveBeenCalledWith(expect.objectContaining({
      tune: tune,
      meta: expect.objectContaining({ id: 'f1' }),
    }))
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/OCR queued/i))
    expect(hideImportReviewUi).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/tunes')
    expect(result.job.id).toBe('ocr-job')
  })

  test('queueMediaAnalysisFromAddDraft starts analysis and closes Add', async function() {
    const saveTune = jest.fn(function(t) { return t })
    const navigate = jest.fn()
    const tune = { id: 't2', name: 'Clip', links: [{ link: 'blob:x' }] }
    await queueMediaAnalysisFromAddDraft({
      tune: tune,
      tunebook: { saveTune: saveTune },
      analysisDeps: { tunebook: {}, tunes: { t2: tune } },
      navigate: navigate,
    })
    expect(saveTune).toHaveBeenCalled()
    expect(requestTuneMediaAnalysis).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Analysis queued/i))
    expect(navigate).toHaveBeenCalledWith('/tunes')
  })
})
