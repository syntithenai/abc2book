/**
 * @jest-environment jsdom
 */

import { AUTH_SESSION_ID_KEY, AUTH_BASE_KEY } from './authResolverClient'
import { createOAuthBffController } from './googleLoginOAuthBff'
import * as healthStore from './mediaResolverHealthStore'

jest.mock('./mediaResolverHealthStore', function() {
  var actual = jest.requireActual('./mediaResolverHealthStore')
  return Object.assign({}, actual, {
    waitForAuthBase: jest.fn(function() {
      return Promise.resolve('http://resolver.test')
    }),
    getMediaResolverHealthState: jest.fn(function() {
      return {
        authBase: 'http://resolver.test',
        authBaseChecked: true,
        status: {
          candidates: [
            { base: 'http://resolver.test', reachable: true, oauthBff: true },
          ],
        },
      }
    }),
  })
})

function mockGisCodeClient() {
  var lastConfig = null
  var requestCodeCalls = 0
  global.window.google = {
    accounts: {
      oauth2: {
        initCodeClient: function(config) {
          lastConfig = config
          return {
            requestCode: function() {
              requestCodeCalls += 1
              if (config && config.callback) {
                config.callback({ code: 'auth-code', code_verifier: 'verifier' })
              }
            },
          }
        },
      },
    },
  }
  return {
    getLastConfig: function() { return lastConfig },
    getRequestCodeCalls: function() { return requestCodeCalls },
  }
}

function mockExchangeFetch() {
  global.fetch = jest.fn(function(url) {
    if (String(url).indexOf('/auth/google/exchange') !== -1) {
      return Promise.resolve({
        ok: true,
        json: function() {
          return Promise.resolve({
            access_token: 'ya29.from-bff',
            session_id: 'sess-from-bff',
            expires_in: 3600,
            email: 'user@example.com',
          })
        },
      })
    }
    return Promise.resolve({
      ok: true,
      json: function() { return Promise.resolve({ ok: true }) },
    })
  })
}

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
    expect(localStorage.getItem(AUTH_BASE_KEY)).toBe('http://resolver.test')
    expect(localStorage.getItem('google_login_user')).toBe('user@example.com')
    expect(global.fetch).toHaveBeenCalled()
  })

  test('resumeSession clears session id on terminal invalid_session', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')
    localStorage.setItem('google_login_profile', JSON.stringify({
      email: 'user@example.com',
      name: 'User Example',
    }))

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
    expect(localStorage.getItem(AUTH_BASE_KEY)).toBeFalsy()
    expect(localStorage.getItem('google_login_user')).toBeFalsy()
    expect(localStorage.getItem('google_login_profile')).toBeFalsy()
  })

  test('silentRefresh keeps session id when auth base not ready yet', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem('google_login_user', 'user@example.com')

    var fallbackCalled = false
    global.fetch = jest.fn()

    var setup = makeController({
      getAuthBase: function() { return '' },
      onFallbackToTokenClient: function() { fallbackCalled = true },
    })
    await setup.controller.refresh()

    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess-123')
    expect(fallbackCalled).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
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

  test('tryRefreshAccessToken reuses a fresh bearer without calling the BFF', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    global.fetch = jest.fn()

    var accessToken = {
      access_token: 'ya29.fresh',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      issued_at: Date.now(),
      scope: 'email',
    }
    var setup = makeController({
      getAccessToken: function() { return accessToken },
      setAccessToken: function(t) { accessToken = t },
    })

    var refreshed = await setup.controller.tryRefreshAccessToken()
    expect(refreshed.access_token).toBe('ya29.fresh')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('logout clears local session before the resolver responds', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-123')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')

    var release
    global.fetch = jest.fn(function() {
      return new Promise(function(resolve) {
        release = function() {
          resolve({
            ok: true,
            json: function() { return Promise.resolve({ ok: true }) },
          })
        }
      })
    })

    var setup = makeController()
    var pending = setup.controller.logout()
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBeFalsy()
    expect(localStorage.getItem(AUTH_BASE_KEY)).toBeFalsy()
    expect(localStorage.getItem('google_login_user')).toBeFalsy()
    release()
    await pending
  })
})

describe('googleLoginOAuthBff login', function() {
  var originalFetch
  var originalGoogle

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

  beforeEach(function() {
    localStorage.clear()
    originalFetch = global.fetch
    originalGoogle = global.window.google
    healthStore.waitForAuthBase.mockReset()
    healthStore.waitForAuthBase.mockImplementation(function() {
      return Promise.resolve('http://resolver.test')
    })
  })

  afterEach(function() {
    global.fetch = originalFetch
    global.window.google = originalGoogle
  })

  test('opens GIS on the click stack before the resolver probe settles', async function() {
    var gis = mockGisCodeClient()
    mockExchangeFetch()
    var resolveWait
    healthStore.waitForAuthBase.mockImplementation(function() {
      return new Promise(function(resolve) { resolveWait = resolve })
    })

    var setup = makeController()
    var pending = setup.controller.login()
    expect(gis.getRequestCodeCalls()).toBe(1)
    expect(gis.getLastConfig().prompt).toBe('consent')
    resolveWait('http://resolver.test')
    await pending
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess-from-bff')
    expect(setup.getAccessToken().access_token).toBe('ya29.from-bff')
  })

  test('does not force consent when a BFF session already exists', async function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-existing')
    var gis = mockGisCodeClient()
    mockExchangeFetch()

    var setup = makeController()
    await setup.controller.login()
    expect(gis.getLastConfig().prompt).toBeUndefined()
  })
})
