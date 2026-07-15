import {
  candidateOffersOauthBff,
  pickAuthResolverBase,
  resolveStickyAuthBase,
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

  test('candidateOffersOauthBff reads top-level or features', function() {
    expect(candidateOffersOauthBff({ reachable: true, oauthBff: true })).toBe(true)
    expect(candidateOffersOauthBff({ reachable: true, features: { oauthBff: true } })).toBe(true)
    expect(candidateOffersOauthBff({ reachable: true, oauthBff: false })).toBe(false)
  })

  test('resolveStickyAuthBase keeps sticky when still offering oauthBff', function() {
    localStorage.setItem(AUTH_BASE_KEY, 'http://sticky')
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess')
    const result = resolveStickyAuthBase([
      { base: 'http://other', reachable: true, oauthBff: true },
      { base: 'http://sticky', reachable: true, oauthBff: true },
    ], 'http://sticky')
    expect(result).toBe('http://sticky')
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBe('sess')
  })

  test('resolveStickyAuthBase clears sticky session when sticky unreachable', function() {
    localStorage.setItem(AUTH_BASE_KEY, 'http://sticky')
    localStorage.setItem(AUTH_SESSION_ID_KEY, 'sess')
    const result = resolveStickyAuthBase([
      { base: 'http://other', reachable: true, oauthBff: true },
    ], 'http://sticky')
    expect(result).toBe('http://other')
    expect(localStorage.getItem(AUTH_SESSION_ID_KEY)).toBeFalsy()
  })
})

describe('googleLoginTokenAdapter', function() {
  test('normalizeToTokenResponse requires access_token', function() {
    expect(normalizeToTokenResponse(null)).toBe(null)
    expect(normalizeToTokenResponse({})).toBe(null)
    expect(normalizeToTokenResponse({ access_token: 'abc', expires_in: 10, scope: 'email' }))
      .toEqual({ access_token: 'abc', expires_in: 10, scope: 'email' })
  })

  test('normalizeToTokenResponse defaults expires_in', function() {
    expect(normalizeToTokenResponse({ access_token: 'abc' }).expires_in).toBe(3600)
  })

  test('mergeScopeStrings dedupes', function() {
    expect(mergeScopeStrings('a b', ['b', 'c'])).toBe('a b c')
  })
})
