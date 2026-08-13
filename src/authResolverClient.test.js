import {
  candidateOffersOauthBff,
  pickAuthResolverBase,
  pickAuthResolverBaseForLogin,
  pickNextAuthResolverBase,
  oauthBffCandidatesForLogin,
  resolveStickyAuthBase,
  selectAuthModeForBase,
  selectLoginAuthMode,
  AUTH_SESSION_ID_KEY,
  AUTH_BASE_KEY,
} from './authResolverClient'
import { normalizeToTokenResponse, mergeScopeStrings } from './googleLoginTokenAdapter'

describe('authResolverClient', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('pickAuthResolverBase picks first reachable oauthBff candidate', function() {
    expect(pickAuthResolverBase([
      { base: 'http://a', reachable: true, oauthBff: false },
      { base: 'http://b', reachable: true, oauthBff: true },
      { base: 'http://c', reachable: true, features: { oauthBff: true } },
    ])).toBe('http://b')
  })

  test('pickAuthResolverBase ignores unreachable oauthBff', function() {
    expect(pickAuthResolverBase([
      { base: 'http://a', reachable: false, oauthBff: true },
      { base: 'http://b', reachable: true, features: { oauthBff: true } },
    ])).toBe('http://b')
  })

  test('pickNextAuthResolverBase returns next reachable oauthBff after failed base', function() {
    var candidates = [
      { base: 'http://a', reachable: true, oauthBff: true },
      { base: 'http://b', reachable: true, oauthBff: true },
      { base: 'http://c', reachable: true, oauthBff: true },
    ]
    expect(pickNextAuthResolverBase(candidates, 'http://a')).toBe('http://b')
    expect(pickNextAuthResolverBase(candidates, 'http://b')).toBe('http://c')
    expect(pickNextAuthResolverBase(candidates, 'http://c')).toBe('')
  })

  test('pickAuthResolverBaseForLogin falls back to default public hosts on native', function() {
    var originalCapacitor = global.window.Capacitor
    global.window.Capacitor = { isNativePlatform: function() { return true } }
    expect(pickAuthResolverBaseForLogin([
      { base: 'http://down', reachable: false, oauthBff: true },
    ])).toBe('https://peppertrees.syntithenai.com')
    global.window.Capacitor = originalCapacitor
  })

  test('oauthBffCandidatesForLogin augments failed probe list on native', function() {
    var originalCapacitor = global.window.Capacitor
    global.window.Capacitor = { isNativePlatform: function() { return true } }
    var list = oauthBffCandidatesForLogin([])
    expect(list.some(function(c) {
      return c.base === 'https://peppertrees.syntithenai.com' && c.oauthBff
    })).toBe(true)
    global.window.Capacitor = originalCapacitor
  })

  test('candidateOffersOauthBff reads top-level or features', function() {
    expect(candidateOffersOauthBff({ reachable: true, oauthBff: true })).toBe(true)
    expect(candidateOffersOauthBff({ reachable: true, features: { oauthBff: true } })).toBe(true)
    expect(candidateOffersOauthBff({ reachable: true, oauthBff: false })).toBe(false)
  })

  test('resolveStickyAuthBase keeps sticky when still offering oauthBff and session exists', function() {
    localStorage.setItem(AUTH_BASE_KEY, 'http://sticky')
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess')
    const result = resolveStickyAuthBase([
      { base: 'http://other', reachable: true, oauthBff: true },
      { base: 'http://sticky', reachable: true, oauthBff: true },
    ], 'http://sticky')
    expect(result).toBe('http://sticky')
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess')
  })

  test('resolveStickyAuthBase prefers probe order when signed out (no session)', function() {
    localStorage.setItem(AUTH_BASE_KEY, 'http://sticky')
    const result = resolveStickyAuthBase([
      { base: 'http://local', reachable: true, oauthBff: true },
      { base: 'http://sticky', reachable: true, oauthBff: true },
    ], 'http://sticky')
    expect(result).toBe('http://local')
    expect(localStorage.getItem(AUTH_BASE_KEY)).toBe('http://local')
  })

  test('resolveStickyAuthBase preserves sticky session when sticky temporarily unreachable', function() {
    localStorage.setItem(AUTH_BASE_KEY, 'http://sticky')
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess')
    const result = resolveStickyAuthBase([
      { base: 'http://other', reachable: true, oauthBff: true },
    ], 'http://sticky')
    expect(result).toBe('http://sticky')
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess')
    expect(localStorage.getItem(AUTH_BASE_KEY)).toBe('http://sticky')
  })

  test('selectAuthModeForBase uses oauth only when BFF session exists', function() {
    expect(selectAuthModeForBase('http://resolver', {})).toBe('token')
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess')
    expect(selectAuthModeForBase('http://resolver', {})).toBe('oauth')
    expect(selectAuthModeForBase('', {})).toBe('token')
    expect(selectAuthModeForBase('http://resolver', { mustUseOAuthBff: true })).toBe('oauth')
  })

  test('selectLoginAuthMode prefers BFF when a resolver is reachable even without a session', function() {
    expect(selectLoginAuthMode({
      knownBase: 'http://localhost:3000',
      authMode: 'token',
    })).toBe('oauth')
    expect(selectLoginAuthMode({
      knownBase: '',
      authMode: 'token',
    })).toBe('token')
    expect(selectLoginAuthMode({
      knownBase: '',
      authMode: 'pending',
    })).toBe('pending')
    expect(selectLoginAuthMode({
      knownBase: '',
      authMode: 'pending',
      mustUseOAuthBff: true,
    })).toBe('oauth')
  })
})

describe('googleLoginTokenAdapter', function() {
  test('normalizeToTokenResponse requires access_token', function() {
    expect(normalizeToTokenResponse(null)).toBe(null)
    expect(normalizeToTokenResponse({})).toBe(null)
    var normalized = normalizeToTokenResponse({ access_token: 'abc', expires_in: 10, scope: 'email' })
    expect(normalized.access_token).toBe('abc')
    expect(normalized.expires_in).toBe(10)
    expect(normalized.scope).toBe('email')
    expect(typeof normalized.expires_at).toBe('number')
    expect(normalized.expires_at).toBeGreaterThan(Date.now())
    expect(typeof normalized.issued_at).toBe('number')
  })

  test('normalizeToTokenResponse defaults expires_in', function() {
    expect(normalizeToTokenResponse({ access_token: 'abc' }).expires_in).toBe(3600)
  })

  test('tokenHasFreshAccess reuses tokens without expires_at', function() {
    const { tokenHasFreshAccess } = require('./googleLoginTokenAdapter')
    expect(tokenHasFreshAccess({ access_token: 'abc' })).toBe(true)
    expect(tokenHasFreshAccess({
      access_token: 'abc',
      expires_at: Date.now() + 600000,
    })).toBe(true)
    expect(tokenHasFreshAccess({
      access_token: 'abc',
      expires_at: Date.now() + 1000,
    })).toBe(false)
    expect(tokenHasFreshAccess(null)).toBe(false)
  })

  test('mergeScopeStrings dedupes', function() {
    expect(mergeScopeStrings('a b', ['b', 'c'])).toBe('a b c')
  })
})
