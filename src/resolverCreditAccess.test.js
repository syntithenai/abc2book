jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
    },
  }
})

import { toast } from 'react-toastify'
import {
  getGatedActionLabel,
  getResolverGatedActionAccess,
  runResolverGatedAction,
} from './resolverCreditAccess'
import { OFFLINE_MESSAGE } from './offlineNetwork'

describe('resolverCreditAccess offline gating', function() {
  const originalOnLine = navigator.onLine

  afterEach(function() {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
    toast.info.mockReset()
  })

  test('getGatedActionLabel does not say Login to when needsNetwork', function() {
    expect(getGatedActionLabel({ needsNetwork: true, needsLogin: false }, 'Generate')).toBe('Generate')
  })

  test('getResolverGatedActionAccess reports needsNetwork instead of login when offline', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const access = getResolverGatedActionAccess({
      resolverChecked: true,
      resolverAvailable: false,
      accessToken: '',
      resolverStatus: {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
    }, { requiresFeature: 'audioGeneration' })
    expect(access.needsNetwork).toBe(true)
    expect(access.needsLogin).toBe(false)
    expect(access.loginWarning.showLoginButton).toBe(false)
  })

  test('runResolverGatedAction toasts needs-internet and never calls login', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const login = jest.fn()
    const onReady = jest.fn()
    const handled = runResolverGatedAction({
      needsNetwork: true,
      needsLogin: false,
      showButton: false,
    }, { login: login, onReady: onReady })
    expect(handled).toBe(true)
    expect(toast.info).toHaveBeenCalledWith(OFFLINE_MESSAGE)
    expect(login).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
  })
})
