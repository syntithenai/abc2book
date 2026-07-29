import {
  ANDROID_OAUTH_APP_CALLBACK,
  ANDROID_OAUTH_CLOUD_CALLBACK,
  getGoogleOAuthRedirectUri,
  isAndroidAppOAuthCallbackUrl,
} from './googleOAuthRedirectUri'

describe('googleOAuthRedirectUri', function() {
  const originalCapacitor = window.Capacitor

  afterEach(function() {
    if (originalCapacitor) window.Capacitor = originalCapacitor
    else delete window.Capacitor
    delete window.location
  })

  test('uses cloud resolver callback on Android', function() {
    window.Capacitor = { isNativePlatform: function() { return true }, getPlatform: function() { return 'android' } }
    expect(getGoogleOAuthRedirectUri('abc.apps.googleusercontent.com'))
      .toBe(ANDROID_OAUTH_CLOUD_CALLBACK)
  })

  test('uses page origin on web', function() {
    delete window.Capacitor
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://tunebook.net' },
      configurable: true,
    })
    expect(getGoogleOAuthRedirectUri('abc.apps.googleusercontent.com'))
      .toBe('https://tunebook.net')
  })

  test('matches custom scheme callback URLs', function() {
    expect(isAndroidAppOAuthCallbackUrl(
      ANDROID_OAUTH_APP_CALLBACK + '?code=abc'
    )).toBe(true)
  })
})
