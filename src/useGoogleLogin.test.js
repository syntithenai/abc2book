/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { toast } from 'react-toastify'
import { OFFLINE_LOGIN_MESSAGE } from './offlineNetwork'
import { probeMediaResolverHealth } from './mediaResolverHealthStore'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockTokenLogin = jest.fn()
const mockTokenRefresh = jest.fn()

jest.mock('react', function() {
  const actual = jest.requireActual('react')
  return Object.assign({}, actual, {
    useEffect: function() {},
  })
})

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: false, available: false, status: null, authBase: '', authBaseChecked: false }
    }),
    getAuthResolverBase: jest.fn(function() { return '' }),
    waitForAuthBase: jest.fn(function() { return Promise.resolve('') }),
    ensureMediaResolverHealthSettingsListener: jest.fn(),
    probeMediaResolverHealth: jest.fn(function() { return Promise.resolve(false) }),
  }
})

jest.mock('./mediaProxyClient', function() {
  return {
    isMediaProxyConfigured: jest.fn(function() { return true }),
  }
})

jest.mock('./platformUtils', function() {
  return {
    isAndroidApp: function() { return false },
    isCapacitorNative: function() { return false },
  }
})

jest.mock('./androidGoogleAuth', function() {
  return {
    clearAndroidOAuthResumeGuard: jest.fn(),
    clearAndroidOAuthSession: jest.fn(),
    ensureAndroidOAuthDeepLinkListener: jest.fn(),
    hasPendingAndroidOAuthCallback: function() { return false },
    isAndroidOAuthResuming: function() { return false },
    markAndroidOAuthResuming: jest.fn(),
  }
})

jest.mock('./googleLoginTokenClient', function() {
  return {
    createTokenClientController: jest.fn(function() {
      return {
        login: mockTokenLogin,
        refresh: mockTokenRefresh,
        dispose: jest.fn(),
        tryRefreshAccessToken: jest.fn(function() { return Promise.resolve(null) }),
      }
    }),
    readStoredLoginProfile: jest.fn(function() { return null }),
  }
})

jest.mock('./googleLoginOAuthBff', function() {
  return {
    createOAuthBffController: jest.fn(function() {
      return {
        login: jest.fn(),
        resumeSession: jest.fn(function() { return Promise.resolve() }),
        dispose: jest.fn(),
        tryRefreshAccessToken: jest.fn(function() { return Promise.resolve(null) }),
      }
    }),
  }
})

jest.mock('./googleLoginRefreshRegistry', function() {
  return {
    notifyAccessTokenUpdated: jest.fn(),
    setTryRefreshAccessTokenHandler: jest.fn(),
    tryRefreshAccessToken: jest.fn(),
  }
})

jest.mock('./authResolverClient', function() {
  return {
    AUTH_MODE_PROBE_WAIT_MS: 0,
    LOGIN_AUTH_WAIT_MS: 0,
    pickAuthResolverBaseForLogin: jest.fn(),
    readStoredAuthBase: jest.fn(function() { return '' }),
    readStoredAuthSessionId: jest.fn(function() { return '' }),
    selectAuthModeForBase: jest.fn(function() { return 'token' }),
    selectLoginAuthMode: jest.fn(function() { return 'token' }),
  }
})

jest.mock('./googleOAuthRedirectUri', function() {
  return {
    getGoogleOAuthRedirectUri: jest.fn(function() { return 'http://localhost' }),
  }
})

jest.mock('./googleLoginTokenAdapter', function() {
  return {
    tokenHasFreshAccess: jest.fn(function() { return false }),
  }
})

jest.mock('axios', function() {
  return { get: jest.fn() }
})

import useGoogleLogin from './useGoogleLogin'

function LoginHarness(props) {
  const google = useGoogleLogin({ scopes: [], usePrompt: false })
  return React.createElement('button', {
    type: 'button',
    'data-testid': 'login',
    onClick: function() { google.login() },
  }, 'Login')
}

describe('useGoogleLogin offline', function() {
  let container
  let root
  const originalOnLine = navigator.onLine

  beforeEach(function() {
    mockTokenLogin.mockReset()
    mockTokenRefresh.mockReset()
    toast.info.mockReset()
    probeMediaResolverHealth.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.google = {
      accounts: {
        id: {
          initialize: jest.fn(),
          renderButton: jest.fn(),
          prompt: jest.fn(),
        },
      },
    }
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
    delete window.google
  })

  test('login toasts needs-internet and does not open GIS while offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await act(async function() {
      root.render(React.createElement(LoginHarness))
    })
    probeMediaResolverHealth.mockClear()
    mockTokenLogin.mockClear()

    await act(async function() {
      container.querySelector('[data-testid="login"]').click()
      await Promise.resolve()
    })

    expect(toast.info).toHaveBeenCalledWith(OFFLINE_LOGIN_MESSAGE)
    expect(mockTokenLogin).not.toHaveBeenCalled()
    expect(probeMediaResolverHealth).not.toHaveBeenCalled()
  })
})
