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
  setResolverLoginToastBeforeLogin,
  setResolverLoginToastLogin,
  showResolverLoginToastForAuthError,
  syncResolverLoginToast,
} from './resolverLoginToast'

const authBlockedStatus = {
  available: false,
  candidates: [{
    base: 'https://cloud.example',
    reachable: true,
    available: false,
    requireAuth: true,
    authReason: 'login_required',
  }],
}

describe('resolverLoginToast', function() {
  beforeEach(function() {
    __resetResolverLoginToastForTests()
    jest.clearAllMocks()
  })

  test('does not auto-show login toast when logged out on page load', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: authBlockedStatus,
    })

    syncResolverLoginToast(null)
    expect(toast.warning).not.toHaveBeenCalled()

    syncResolverLoginToast(null)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('auto-shows login toast when a token is present but invalid', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: false,
        candidates: [{
          base: 'https://cloud.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'invalid_token',
        }],
      },
    })

    syncResolverLoginToast('token')
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const renderFn = toast.warning.mock.calls[0][0]
    expect(typeof renderFn).toBe('function')
    const content = renderFn({ closeToast: jest.fn() })
    expect(content.props.children[0].props.children).toMatch(/expired/i)

    syncResolverLoginToast('token')
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  test('includes a Login button when a login handler is set', function() {
    const login = jest.fn()
    const beforeLogin = jest.fn()
    setResolverLoginToastLogin(login)
    setResolverLoginToastBeforeLogin(beforeLogin)
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: false,
        candidates: [{
          base: 'https://cloud.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'invalid_token',
        }],
      },
    })

    syncResolverLoginToast('token')
    const renderFn = toast.warning.mock.calls[0][0]
    const closeToast = jest.fn()
    const content = renderFn({ closeToast: closeToast })
    const button = content.props.children[1]
    expect(button.props['data-testid']).toBe('resolver-login-toast-button')
    expect(button.props.children).toBe('Login')
    button.props.onClick()
    expect(beforeLogin).toHaveBeenCalled()
    expect(closeToast).toHaveBeenCalled()
    expect(login).toHaveBeenCalled()
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

  test('dismisses stale login toast once health clears after a token is present', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: false,
        candidates: [{
          base: 'https://cloud.example',
          reachable: true,
          available: false,
          requireAuth: true,
          authReason: 'invalid_token',
        }],
      },
    })

    syncResolverLoginToast('token')
    expect(toast.warning).toHaveBeenCalledTimes(1)

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
  })

  test('does not auto-show login toast after logout', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: true,
        activeBase: 'https://cloud.example',
        candidates: [],
      },
    })
    syncResolverLoginToast('token')
    expect(toast.warning).not.toHaveBeenCalled()

    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: authBlockedStatus,
    })
    syncResolverLoginToast(null)
    expect(toast.dismiss).toHaveBeenCalledWith('resolver-login-required')
    expect(toast.warning).not.toHaveBeenCalled()

    // Health re-probe while still logged out must not re-nag.
    syncResolverLoginToast(null)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('gated auth error still shows login toast after logout suppress', function() {
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: true,
        activeBase: 'https://cloud.example',
        candidates: [],
      },
    })
    syncResolverLoginToast('token')

    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: authBlockedStatus,
    })
    syncResolverLoginToast(null)
    expect(toast.warning).not.toHaveBeenCalled()

    setResolverLoginToastLogin(jest.fn())
    const handled = showResolverLoginToastForAuthError(
      new Error('Media proxy error 401: Missing Authorization Bearer token'),
      { accessToken: null }
    )
    expect(handled).toBe(true)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  test('showResolverLoginToastForAuthError handles media proxy 401', function() {
    setResolverLoginToastLogin(jest.fn())
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: true,
        candidates: [],
      },
    })
    const handled = showResolverLoginToastForAuthError(
      new Error('Media proxy error 401: Missing Authorization Bearer token'),
      { accessToken: null }
    )
    expect(handled).toBe(true)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const renderFn = toast.warning.mock.calls[0][0]
    const content = renderFn({ closeToast: jest.fn() })
    expect(content.props.children[0].props.children).toBe('Login to continue')
    expect(content.props.children[1].props['data-testid']).toBe('resolver-login-toast-button')
  })

  test('showResolverLoginToastForAuthError ignores 401 when already logged in', function() {
    setResolverLoginToastLogin(jest.fn())
    getMediaResolverHealthState.mockReturnValue({
      checked: true,
      status: {
        available: true,
        candidates: [],
      },
    })
    const handled = showResolverLoginToastForAuthError(
      new Error('Media proxy error 401: Missing Authorization Bearer token'),
      { accessToken: 'ya29.token' }
    )
    expect(handled).toBe(false)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  test('syncResolverLoginToast dismisses when offline', function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      getMediaResolverHealthState.mockReturnValue({
        checked: true,
        status: authBlockedStatus,
      })
      syncResolverLoginToast(null)
      expect(toast.warning).not.toHaveBeenCalled()
      expect(toast.dismiss).toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
