import { isAndroidApp } from './platformUtils'
import { DEFAULT_CLOUD_LIGHT_MEDIA_PROXY } from './mediaProxyConfig'

/** Capacitor WebView origin — not used as a Google OAuth redirect (causes Android link loops). */
export const CAPACITOR_ANDROID_OAUTH_REDIRECT = 'https://localhost'

/** Google OAuth redirect: hosted HTTPS page that bounces to the app custom scheme. */
export const ANDROID_OAUTH_CLOUD_CALLBACK =
  DEFAULT_CLOUD_LIGHT_MEDIA_PROXY + '/oauth/android-callback'

/** App receives the auth code on this custom-scheme URL (no Chrome/Tunebook picker). */
export const ANDROID_OAUTH_APP_CALLBACK = 'net.tunebook.app://oauth/callback'

/**
 * OAuth redirect_uri sent to Google.
 * Android: cloud resolver callback page (register exact URL in Google Cloud Console).
 * Web: page origin.
 */
export function getGoogleOAuthRedirectUri(clientId) {
  if (isAndroidApp()) {
    const fromEnv = process.env.REACT_APP_ANDROID_OAUTH_REDIRECT
    if (fromEnv && String(fromEnv).trim()) {
      return String(fromEnv).trim()
    }
    return ANDROID_OAUTH_CLOUD_CALLBACK
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return ''
}

export function isAndroidAppOAuthCallbackUrl(url) {
  const raw = String(url || '')
  if (!raw) return false
  if (raw.indexOf(ANDROID_OAUTH_APP_CALLBACK) === 0) {
    return raw.includes('code=') || raw.includes('error=')
  }
  const googleRedirect = getGoogleOAuthRedirectUri()
  if (googleRedirect && matchesGoogleOAuthRedirect(raw, googleRedirect)) return true
  if (matchesGoogleOAuthRedirect(raw, ANDROID_OAUTH_CLOUD_CALLBACK)) return true
  return false
}

export function matchesGoogleOAuthRedirect(url, redirectUri) {
  const raw = String(url || '')
  const target = String(redirectUri || '')
  if (!target) return false

  try {
    const parsed = new URL(raw, target)
    const expected = new URL(target)
    const parsedPath = parsed.pathname || '/'
    const expectedPath = expected.pathname || '/'
    const pathMatches = parsedPath === expectedPath
      || (parsedPath === '/' && (expectedPath === '/' || expectedPath === ''))
      || (expectedPath === '/' && parsedPath === '')
    const hasAuthParams = parsed.search.includes('code=') || parsed.search.includes('error=')
      || parsed.hash.includes('code=') || parsed.hash.includes('error=')
    return parsed.origin === expected.origin && pathMatches && hasAuthParams
  } catch (e) {
    return raw.indexOf(target) === 0
  }
}

export function matchesAnyAndroidOAuthCallback(url) {
  return isAndroidAppOAuthCallbackUrl(url)
}
