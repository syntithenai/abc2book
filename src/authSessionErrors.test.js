import { isTerminalAuthError, isTransientAuthError } from './authSessionErrors'

describe('authSessionErrors', function() {
  test('isTerminalAuthError detects invalid_session', function() {
    expect(isTerminalAuthError({
      status: 401,
      body: { error: 'invalid_session' },
    })).toBe(true)
  })

  test('isTerminalAuthError detects refresh_failed', function() {
    expect(isTerminalAuthError({
      status: 401,
      body: { error: 'refresh_failed', detail: 'token revoked' },
    })).toBe(true)
  })

  test('isTerminalAuthError detects refresh_token_missing from exchange', function() {
    expect(isTerminalAuthError({
      body: { error: 'refresh_token_missing' },
    })).toBe(true)
  })

  test('isTerminalAuthError rejects transient network failures', function() {
    var err = new Error('Could not reach OAuth resolver at http://localhost:8787 (Failed to fetch)')
    expect(isTerminalAuthError(err)).toBe(false)
    expect(isTransientAuthError(err)).toBe(true)
  })

  test('isTerminalAuthError rejects 502 resolver outages', function() {
    expect(isTerminalAuthError({ status: 502, message: 'Bad Gateway' })).toBe(false)
    expect(isTransientAuthError({ status: 502, message: 'Bad Gateway' })).toBe(true)
  })

  test('isTerminalAuthError rejects 429 rate limits', function() {
    expect(isTerminalAuthError({ status: 429, body: { error: 'refresh_rate_limited' } })).toBe(false)
    expect(isTransientAuthError({ status: 429 })).toBe(true)
  })
})
