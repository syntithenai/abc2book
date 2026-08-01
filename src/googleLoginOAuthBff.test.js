/**
 * @jest-environment jsdom
 */

import { AUTH_SESSION_ID_KEY, AUTH_BASE_KEY } from './authResolverClient'
import { createOAuthBffController } from './googleLoginOAuthBff'

describe('googleLoginOAuthBff resumeSession', function() {
  var originalFetch

  beforeEach(function() {
    localStorage.clear()
    originalFetch = global.fetch
  })

  afterEach(function() {
    global.fetch = originalFetch
  })

  function makeController(overrides) {
    var accessToken = null
    var ctx = Object.assign({
      clientId: 'test-client',
      scopes: ['email'],
      getAuthBase: function() { return 'http://resolver.test' },
      getAccessToken: function() { return accessToken },
      setAccessToken: function(t) { accessToken = t },
      setUser: function() {},
    }, overrides || {})
    return { controller: createOAuthBffController(ctx), getAccessToken: function() { return accessToken } }
  }

  test('resumeSession keeps session id on transient network failure', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')

    global.fetch = jest.fn(function() {
      return Promise.reject(new Error('Failed to fetch'))
    })

    var setup = makeController()
    var result = await setup.controller.resumeSession()

    expect(result).toBe(null)
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess-123')
    expect(global.fetch).toHaveBeenCalled()
  })

  test('resumeSession clears session id on terminal invalid_session', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')

    global.fetch = jest.fn(function() {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: function() {
          return Promise.resolve({ error: 'invalid_session', detail: 'Session not found' })
        },
      })
    })

    var setup = makeController()
    var result = await setup.controller.resumeSession()

    expect(result).toBe(null)
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBeFalsy()
  })

  test('silentRefresh keeps session id on 502 outage', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')

    var fallbackCalled = false
    global.fetch = jest.fn(function() {
      return Promise.resolve({
        ok: false,
        status: 502,
        json: function() {
          return Promise.resolve({ error: 'bad_gateway' })
        },
      })
    })

    var setup = makeController({
      onFallbackToTokenClient: function() { fallbackCalled = true },
    })
    await setup.controller.refresh()

    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess-123')
    expect(fallbackCalled).toBe(true)
  })
})
