import { toast } from 'react-toastify'
import {
  syncBackgroundReviewToast,
  collectAttachAnalysisReadyKeys,
  __resetBackgroundReviewToastForTests,
} from './backgroundReviewToast'
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
      importReadyIds: ['a'],
      mediaReady: [],
      fieldLookupAwaiting: [],
      fileOcrReady: ['ocr1'],
      fileOcrProcessing: [],
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

  test('syncBackgroundReviewToast skips when no attach-analysis ready work', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
      fieldLookupAwaiting: ['f'],
      fileOcrReady: [],
      fileOcrProcessing: [],
      mediaProcessing: [],
    })
    syncBackgroundReviewToast({ onReview: jest.fn() })
    expect(toast.warn).not.toHaveBeenCalled()
  })
})
