jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(function() { return 'background-review' }),
      warn: jest.fn(function() { return 'background-review' }),
      dismiss: jest.fn(),
    },
  }
})

jest.mock('./backgroundReviewQueue', function() {
  return {
    getBackgroundReviewSummary: jest.fn(function() {
      return { ready: 0, processing: 0, importReadyIds: [], mediaReady: [] }
    }),
  }
})

import { toast } from 'react-toastify'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'
import {
  __resetBackgroundReviewToastForTests,
  dismissBackgroundReviewToast,
  showBackgroundJobsContinuingNotice,
  showBackgroundProcessingNotice,
  snoozeBackgroundReviewToast,
  syncBackgroundReviewToast,
} from './backgroundReviewToast'

describe('backgroundReviewToast', function() {
  let now

  beforeEach(function() {
    toast.info.mockClear()
    toast.warn.mockClear()
    toast.dismiss.mockClear()
    getBackgroundReviewSummary.mockReset()
    getBackgroundReviewSummary.mockReturnValue({
      ready: 0,
      processing: 0,
      importReadyIds: [],
      mediaReady: [],
    })
    __resetBackgroundReviewToastForTests()
    now = 1_000
    jest.spyOn(Date, 'now').mockImplementation(function() { return now })
  })

  afterEach(function() {
    if (Date.now.mockRestore) Date.now.mockRestore()
    __resetBackgroundReviewToastForTests()
  })

  test('dismisses toast when nothing is pending', function() {
    syncBackgroundReviewToast()
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
    expect(toast.dismiss).toHaveBeenCalledWith('background-review-processing')
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.warn).not.toHaveBeenCalled()
  })

  test('shows ready toast once when processing drops to zero', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 0,
      processing: 2,
      importReadyIds: [],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).not.toHaveBeenCalled()

    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a', 'b'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    // Same ready set — subsequent notifies must not re-fire
    syncBackgroundReviewToast()
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)
  })

  test('shows ready toast when ready appears while processing already zero', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a', 'b'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(2)
  })

  test('does not show ready toast while processing continues', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 1,
      importReadyIds: ['a'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    syncBackgroundReviewToast()
    expect(toast.warn).not.toHaveBeenCalled()
  })

  test('shows transient toast for processing-only work when explicitly requested', function() {
    getBackgroundReviewSummary.mockReturnValue({ ready: 0, processing: 1, importReadyIds: [], mediaReady: [] })

    showBackgroundProcessingNotice()

    expect(toast.info).toHaveBeenCalledTimes(1)
    expect(toast.info).toHaveBeenCalledWith(
      '1 still processing',
      expect.objectContaining({
        toastId: 'background-review-processing',
        autoClose: 4000,
      })
    )
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
  })

  test('does not re-show processing toast on routine sync while work continues', function() {
    getBackgroundReviewSummary.mockReturnValue({ ready: 0, processing: 1, importReadyIds: [], mediaReady: [] })

    syncBackgroundReviewToast()
    syncBackgroundReviewToast()

    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
  })

  test('dismissBackgroundReviewToast uses stable toast ids', function() {
    dismissBackgroundReviewToast()
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
    expect(toast.dismiss).toHaveBeenCalledWith('background-review-processing')
  })

  test('manual close suppresses ready toast for at least 30 seconds', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a', 'b'],
      mediaReady: [],
    })

    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    const firstReadyCall = toast.warn.mock.calls[0]
    firstReadyCall[1].onClose()

    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    now += 29_000
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    now += 1_100
    // Fingerprint unchanged and already shown — still suppressed by dismiss window
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    // After suppress window, still same fingerprint — do not re-spam
    now += 1
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    // New ready work after suppress window expired
    getBackgroundReviewSummary.mockReturnValue({
      ready: 3,
      processing: 0,
      importReadyIds: ['a', 'b', 'c'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(2)
  })

  test('suppressReadyToast dismisses without showing while review is open', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
    })

    syncBackgroundReviewToast({ suppressReadyToast: true })

    expect(toast.warn).not.toHaveBeenCalled()
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
  })

  test('continue-later snooze suppresses toast for the same ready work', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
    })

    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)

    snoozeBackgroundReviewToast()
    toast.warn.mockClear()

    syncBackgroundReviewToast()
    expect(toast.warn).not.toHaveBeenCalled()
    expect(toast.dismiss).toHaveBeenCalledWith('background-review')
  })

  test('continue-later snooze waits for processing to finish before re-showing', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReadyIds: ['a'],
      mediaReady: [],
    })
    snoozeBackgroundReviewToast()
    toast.warn.mockClear()

    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 1,
      importReadyIds: ['a', 'b'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).not.toHaveBeenCalled()

    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: ['a', 'b'],
      mediaReady: [],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)
  })

  test('continue-later snooze re-shows when new media analysis is ready', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 1,
      processing: 0,
      importReadyIds: [],
      mediaReady: ['tune-1'],
    })
    snoozeBackgroundReviewToast()
    toast.warn.mockClear()

    getBackgroundReviewSummary.mockReturnValue({
      ready: 2,
      processing: 0,
      importReadyIds: [],
      mediaReady: ['tune-1', 'tune-2'],
    })
    syncBackgroundReviewToast()
    expect(toast.warn).toHaveBeenCalledTimes(1)
  })

  test('showBackgroundJobsContinuingNotice toasts active job count', function() {
    getBackgroundReviewSummary.mockReturnValue({
      ready: 0,
      processing: 3,
      importReadyIds: [],
      mediaReady: [],
    })
    const message = showBackgroundJobsContinuingNotice()
    expect(message).toBe('3 jobs continuing in background')
    expect(toast.info).toHaveBeenCalledWith(
      '3 jobs continuing in background',
      expect.objectContaining({ toastId: 'background-jobs-continuing' })
    )
  })

  test('showBackgroundJobsContinuingNotice is a no-op when nothing is processing', function() {
    expect(showBackgroundJobsContinuingNotice()).toBe(null)
    expect(toast.info).not.toHaveBeenCalled()
  })
})
