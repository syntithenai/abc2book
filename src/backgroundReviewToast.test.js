import { toast } from 'react-toastify'
import {
  syncBackgroundReviewToast,
  __resetBackgroundReviewToastForTests,
} from './backgroundReviewToast'

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
    getBackgroundReviewSummary: jest.fn(function() {
      return { ready: 2, processing: 0, importReadyIds: ['a'], mediaReady: [], fieldLookupAwaiting: [] }
    }),
  }
})

describe('backgroundReviewToast', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    if (typeof __resetBackgroundReviewToastForTests === 'function') {
      __resetBackgroundReviewToastForTests()
    }
  })

  test('syncBackgroundReviewToast no longer shows persistent ready toast', function() {
    syncBackgroundReviewToast({ onReview: jest.fn() })
    expect(toast.warn).not.toHaveBeenCalled()
  })
})
