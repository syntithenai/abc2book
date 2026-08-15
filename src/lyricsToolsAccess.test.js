jest.mock('./mediaProxyConfig', function() {
  return {
    getMediaProxyBaseCandidates: jest.fn(function() {
      return ['https://resolver.example']
    }),
  }
})

import { getLyricsToolsAccess, isLyricsToolsAuthWarming } from './lyricsToolsAccess'
import { getMediaProxyBaseCandidates } from './mediaProxyConfig'

describe('lyricsToolsAccess', function() {
  beforeEach(function() {
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example'])
    try { localStorage.removeItem('google_login_user') } catch (e) {}
  })

  afterEach(function() {
    try { localStorage.removeItem('google_login_user') } catch (e) {}
  })

  test('isLyricsToolsAuthWarming when stored user but no token', function() {
    localStorage.setItem('google_login_user', 'yes')
    expect(isLyricsToolsAuthWarming('')).toBe(true)
    expect(isLyricsToolsAuthWarming('tok')).toBe(false)
  })

  test('treats unchecked resolver as warming', function() {
    const access = getLyricsToolsAccess({
      resolverChecked: false,
      resolverAvailable: false,
      accessToken: '',
    })
    expect(access.warming).toBe(true)
    expect(access.ready).toBe(false)
    expect(access.needsLogin).toBe(false)
  })

  test('suppresses login while google session is restoring', function() {
    localStorage.setItem('google_login_user', 'yes')
    const access = getLyricsToolsAccess({
      resolverChecked: true,
      resolverAvailable: true,
      resolverStatus: {
        available: true,
        candidates: [{ reachable: true, requireAuth: true, available: true }],
      },
      accessToken: '',
    })
    expect(access.warming).toBe(true)
    expect(access.needsLogin).toBe(false)
    expect(access.loginWarning).toBeNull()
  })

  test('needs login when resolver requires auth and user has no session', function() {
    const access = getLyricsToolsAccess({
      resolverChecked: true,
      resolverAvailable: true,
      resolverStatus: {
        available: true,
        candidates: [{ reachable: true, requireAuth: true, available: true }],
      },
      accessToken: '',
    })
    expect(access.needsLogin).toBe(true)
    expect(access.ready).toBe(false)
    expect(access.loginWarning.showLoginButton).toBe(true)
  })

  test('ready when available and token present', function() {
    localStorage.setItem('google_login_user', 'yes')
    const access = getLyricsToolsAccess({
      resolverChecked: true,
      resolverAvailable: true,
      resolverStatus: {
        available: true,
        candidates: [{ reachable: true, requireAuth: true, available: true }],
      },
      accessToken: 'tok',
    })
    expect(access.ready).toBe(true)
    expect(access.needsLogin).toBe(false)
  })

  test('shows login when shared resolver is auth-blocked without token', function() {
    const access = getLyricsToolsAccess({
      resolverChecked: true,
      resolverAvailable: false,
      resolverStatus: {
        available: false,
        candidates: [{
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      accessToken: '',
    })
    expect(access.needsLogin).toBe(true)
    expect(access.unreachable).toBe(false)
  })

  test('needsNetwork when offline instead of login', function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      const access = getLyricsToolsAccess({
        resolverChecked: true,
        resolverAvailable: false,
        resolverStatus: {
          available: false,
          candidates: [{
            reachable: true,
            requireAuth: true,
            available: false,
            authReason: 'login_required',
          }],
        },
        accessToken: '',
      })
      expect(access.needsLogin).toBe(false)
      expect(access.needsNetwork).toBe(true)
      expect(access.unreachableMessage).toMatch(/internet connection/i)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
