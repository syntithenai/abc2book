import { toast } from 'react-toastify'
import {
  syncBackgroundReviewToast,
  collectAttachAnalysisReadyKeys,
  showBulkImportStartedToast,
  __resetBackgroundReviewToastForTests,
} from './backgroundReviewToast'
import { isImportReviewUiVisible } from './importReviewSessionStore'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'

jest.mock('react-toastify', function() {
  return {
    toast: Object.assign(jest.fn(), {
      warn: jest.fn(),
      info: jest.fn(),
      dismiss: jest.fn(),
    }),
  }
})

jest.mock('./importReviewSessionStore', function() {
  return {
    isImportReviewUiVisible: jest.fn().mockReturnValue(false),
  }
})

jest.mock('./backgroundReviewQueue', function() {
  return {
    getBackgroundReviewSummary: jest.fn(),
  }
})

describe('backgroundReviewToast', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    if (typeof __resetBackgroundReviewToastForTests === 'function') {
      __resetBackgroundReviewToastForTests()
    }
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReady: 0,
      importProcessing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
      fieldLookupAwaiting: [],
      fileOcrReady: ['ocr1'],
      fileOcrProcessing: [],
      fileOcrFailed: [],
      mediaProcessing: [],
    })
  })

  test('collectAttachAnalysisReadyKeys only includes fileocr and media', function() {
    const keys = collectAttachAnalysisReadyKeys({
      importReadyIds: ['a'],
      mediaReady: ['m1'],
      fieldLookupAwaiting: ['f1'],
      fileOcrReady: ['ocr1'],
    })
    expect(keys).toEqual(['media:m1', 'fileocr:ocr1'])
  })

  test('syncBackgroundReviewToast shows ready toast for file OCR', function() {
    syncBackgroundReviewToast({ onReview: jest.fn() })
    expect(toast.warn).toHaveBeenCalled()
  })

  test('syncBackgroundReviewToast skips when no attach-analysis or import ready work', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a'],
      importReady: 0,
      importProcessing: 0,
      mediaReady: [],
      fieldLookupAwaiting: ['f'],
      fileOcrReady: [],
      fileOcrProcessing: [],
      fileOcrFailed: [],
      mediaProcessing: [],
    })
    syncBackgroundReviewToast({ onReview: jest.fn() })
    expect(toast.warn).not.toHaveBeenCalled()
  })

  test('showBulkImportStartedToast shows background notice', function() {
    showBulkImportStartedToast()
    expect(toast.info).toHaveBeenCalledWith(
      'Import running in the background…',
      expect.objectContaining({ toastId: 'bulk-import-started' })
    )
  })

  test('syncBackgroundReviewToast shows import review ready toast', function() {
    getBackgroundReviewSummary
      .mockReturnValueOnce({
        ready: 0,
        processing: 1,
        importReady: 0,
        importProcessing: 2,
        importReadyIds: [],
        mediaReady: [],
        fieldLookupAwaiting: [],
        fileOcrReady: [],
        fileOcrProcessing: [],
        fileOcrFailed: [],
        mediaProcessing: [],
      })
      .mockReturnValueOnce({
        ready: 2,
        processing: 0,
        importReady: 2,
        importProcessing: 0,
        importReadyIds: ['a', 'b'],
        mediaReady: [],
        fieldLookupAwaiting: [],
        fileOcrReady: [],
        fileOcrProcessing: [],
        fileOcrFailed: [],
        mediaProcessing: [],
      })
    syncBackgroundReviewToast({ onReview: jest.fn() })
    syncBackgroundReviewToast({ onImportReview: jest.fn() })
    expect(toast.warn).toHaveBeenCalled()
    expect(isImportReviewUiVisible).toHaveBeenCalled()
  })
})
