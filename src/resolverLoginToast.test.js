/**
 * @jest-environment jsdom
 */

jest.mock('react-toastify', function() {
  return {
    toast: {
      warning: jest.fn(),
      dismiss: jest.fn(),
    },
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(),
    subscribeMediaResolverHealth: jest.fn(function() {
      return function() {}
    }),
  }
})

import { toast } from 'react-toastify'
import { getMediaResolverHealthState } from './mediaResolverHealthStore'
import {
  __resetResolverLoginToastForTests,
  syncResolverLoginToast,
} from './resolverLoginToast'

describe('resolverLoginToast', function() {
  beforeEach(function() {
    __resetResolverLoginToastForTests()
    jest.clearAllMocks()
  })

  test('shows one warning when shared resolver needs login', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: false,
        candidates: [{
          base: 'https://cloud.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'login_required',
        }],
      },
    })

    syncResolverLoginToast(null)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning.mock.calls[0][0]).toMatch(/Google login/i)

    syncResolverLoginToast(null)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  test('dismisses warning when resolver becomes available', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: true,
        activeBase: 'https://cloud.example',
        candidates: [],
      },
    })

    syncResolverLoginToast('token')
    expect(toast.dismiss).toHaveBeenCalledWith('resolver-login-required')
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
