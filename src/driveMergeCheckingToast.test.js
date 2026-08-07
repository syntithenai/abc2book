import { toast } from 'react-toastify'
import { beginDriveMergeCheckingToast, endDriveMergeCheckingToast, resetDriveMergeCheckingToastForTests } from './driveMergeCheckingToast'

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
      dismiss: jest.fn(),
    },
  }
})

describe('driveMergeCheckingToast', function() {
  beforeEach(function() {
    jest.useFakeTimers()
    resetDriveMergeCheckingToastForTests()
    toast.info.mockClear()
    toast.dismiss.mockClear()
  })

  afterEach(function() {
    jest.useRealTimers()
  })

  test('shows toast only after delay when check is still running', function() {
    beginDriveMergeCheckingToast()
    expect(toast.info).not.toHaveBeenCalled()
    jest.advanceTimersByTime(500)
    expect(toast.info).toHaveBeenCalledWith(
      'Checking Google Drive for updates…',
      expect.objectContaining({ toastId: 'drive-merge-checking' })
    )
  })

  test('does not show toast when check finishes before delay', function() {
    beginDriveMergeCheckingToast()
    endDriveMergeCheckingToast()
    jest.advanceTimersByTime(500)
    expect(toast.info).not.toHaveBeenCalled()
  })

  test('keeps toast until all concurrent checks finish', function() {
    beginDriveMergeCheckingToast()
    beginDriveMergeCheckingToast()
    jest.advanceTimersByTime(500)
    expect(toast.info).toHaveBeenCalledTimes(1)
    endDriveMergeCheckingToast()
    expect(toast.dismiss).not.toHaveBeenCalled()
    endDriveMergeCheckingToast()
    expect(toast.dismiss).toHaveBeenCalledWith('drive-merge-checking')
  })
})
