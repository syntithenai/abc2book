/**
 * @jest-environment jsdom
 */

import { AUTH_SESSION_ID_KEY, AUTH_BASE_KEY } from './authResolverClient'
import { buildGoogleLoginSummary } from './googleLoginStatus'

describe('buildGoogleLoginSummary', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('reports healthy silent refresh when BFF session and token are valid', function() {
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess-1234567890')
    localStorage.setItem(AUTH_BASE_KEY, 'http://resolver.test')
    localStorage.setItem('google_login_user', 'user@example.com')

    const status = buildGoogleLoginSummary({
      user: { email: 'user@example.com' },
      token: {
        access_token: 'tok',
        expires_at: Date.now() + 3600000,
      },
      authMode: 'oauth',
      authBase: 'http://resolver.test',
      authBaseChecked: true,
      resolverStatus: {
        candidates: [
          { base: 'http://resolver.test', reachable: true, available: true, oauthBff: true },
        ],
      },
    })

    expect(status.tone).toBe('ok')
    expect(status.headline).toMatch(/good/i)
    expect(status.silentRefresh).toBe(true)
    expect(status.silentRefreshLabel).toBe('Yes')
    expect(status.summary).toMatch(/silent refresh is active/i)
    expect(status.actions).toEqual([])
  })

  test('explains how to restore silent refresh in token client mode', function() {
    localStorage.setItem('google_login_user', '1')

    const status = buildGoogleLoginSummary({
      user: { email: 'user@example.com' },
      token: { access_token: 'tok', expires_at: Date.now() + 3600000 },
      authMode: 'token',
      authBase: 'http://resolver.test',
      authBaseChecked: true,
      resolverStatus: {
        candidates: [
          { base: 'http://resolver.test', reachable: true, available: true, oauthBff: true },
        ],
      },
    })

    expect(status.silentRefresh).toBe(false)
    expect(status.silentRefreshLabel).toBe('No')
    expect(status.summary).toMatch(/sign out and log in again/i)
    expect(status.actions.some(function(action) {
      return action.label.indexOf('Sign out') === 0
    })).toBe(true)
  })

  test('suggests resolver setup when no oauth BFF is reachable', function() {
    localStorage.setItem('google_login_user', '1')

    const status = buildGoogleLoginSummary({
      user: { email: 'user@example.com' },
      token: { access_token: 'tok', expires_at: Date.now() + 3600000 },
      authMode: 'token',
      authBase: '',
      authBaseChecked: true,
      resolverStatus: { candidates: [] },
    })

    expect(status.silentRefreshLabel).toBe('No')
    expect(status.summary).toMatch(/pop-up/i)
    expect(status.actions.some(function(action) {
      return action.label.indexOf('OAuth BFF resolver') !== -1
    })).toBe(true)
  })
})
