import { resolveResolverAccessToken } from './resolverAccessToken'

describe('resolveResolverAccessToken', function() {
  test('returns string token as-is', function() {
    expect(resolveResolverAccessToken('abc')).toBe('abc')
  })

  test('reads access_token from token object', function() {
    expect(resolveResolverAccessToken({ access_token: 'xyz' })).toBe('xyz')
  })

  test('returns empty string when missing', function() {
    expect(resolveResolverAccessToken(null)).toBe('')
  })
})
