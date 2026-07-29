import {
  ANDROID_OAUTH_PENDING_KEY,
  ANDROID_OAUTH_VERIFIER_KEY,
  consumeAndroidOAuthCallbackFromUrl,
  hasPendingAndroidOAuthCallback,
  isAndroidOAuthCallbackUrl,
} from './androidGoogleAuth'

describe('androidGoogleAuth', function() {
  const originalCapacitor = window.Capacitor

  beforeEach(function() {
    localStorage.clear()
    sessionStorage.clear()
    window.Capacitor = { isNativePlatform: function() { return true }, getPlatform: function() { return 'android' } }
    localStorage.setItem(ANDROID_OAUTH_PENDING_KEY, '1')
    localStorage.setItem(ANDROID_OAUTH_VERIFIER_KEY, 'verifier-123')
  })

  afterEach(function() {
    if (originalCapacitor) window.Capacitor = originalCapacitor
    else delete window.Capacitor
    localStorage.clear()
    sessionStorage.clear()
  })

  test('detects custom scheme callback URLs', function() {
    expect(isAndroidOAuthCallbackUrl('net.tunebook.app://oauth/callback?code=abc')).toBe(true)
  })

  test('consumes callback payload from custom scheme deep link', function() {
    const payload = consumeAndroidOAuthCallbackFromUrl(
      'net.tunebook.app://oauth/callback?code=abc'
    )
    expect(payload).toEqual({ code: 'abc', code_verifier: 'verifier-123' })
    expect(hasPendingAndroidOAuthCallback()).toBe(false)
  })
})
