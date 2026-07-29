/**
 * Google OAuth on Android: Custom Tabs → Google → cloud callback → app deep link.
 */
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { isAndroidApp } from './platformUtils'
import {
  getGoogleOAuthRedirectUri,
  isAndroidAppOAuthCallbackUrl,
} from './googleOAuthRedirectUri'

export const ANDROID_OAUTH_PENDING_KEY = 'android_oauth_pending'
export const ANDROID_OAUTH_VERIFIER_KEY = 'android_oauth_verifier'
export const ANDROID_OAUTH_RETURN_KEY = 'android_oauth_return_path'
export const ANDROID_OAUTH_RESUMING_KEY = 'android_oauth_resuming'

/** Ignore browserFinished fired immediately when Custom Tabs opens. */
const BROWSER_FINISHED_GRACE_MS = 2500

export function AndroidOAuthNavigateAway() {
  this.name = 'AndroidOAuthNavigateAway'
  this.message = 'Navigating to Google sign-in'
}

var browserFinishedHandle = null
var browserOpenedAt = 0

function storageGet(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || ''
  } catch (e) {
    return ''
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    sessionStorage.setItem(key, value)
  } catch (e) {}
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  } catch (e) {}
}

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomVerifier(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function createPkcePair() {
  const verifier = randomVerifier(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return {
    code_verifier: verifier,
    code_challenge: base64UrlEncode(digest),
  }
}

export function parseAndroidOAuthRedirectUrl(url) {
  const raw = String(url || '')
  const hashIndex = raw.indexOf('#')
  const queryIndex = raw.indexOf('?')
  const paramString = hashIndex >= 0
    ? raw.slice(hashIndex + 1)
    : (queryIndex >= 0 ? raw.slice(queryIndex + 1) : '')
  const params = new URLSearchParams(paramString)
  return {
    code: params.get('code') || '',
    error: params.get('error') || '',
    error_description: params.get('error_description') || '',
  }
}

export function clearAndroidOAuthResumeGuard() {
  storageRemove(ANDROID_OAUTH_RESUMING_KEY)
}

export function isAndroidOAuthResuming() {
  return !!storageGet(ANDROID_OAUTH_RESUMING_KEY)
}

export function markAndroidOAuthResuming() {
  storageSet(ANDROID_OAUTH_RESUMING_KEY, '1')
}

export function clearAndroidOAuthSession() {
  storageRemove(ANDROID_OAUTH_PENDING_KEY)
  storageRemove(ANDROID_OAUTH_VERIFIER_KEY)
  storageRemove(ANDROID_OAUTH_RETURN_KEY)
  clearAndroidOAuthResumeGuard()
}

async function removeBrowserFinishedListener() {
  if (!browserFinishedHandle) return
  try {
    await browserFinishedHandle.remove()
  } catch (e) {}
  browserFinishedHandle = null
}

export async function closeAndroidOAuthBrowser() {
  await removeBrowserFinishedListener()
  try {
    await Browser.close()
  } catch (e) {}
}

async function installBrowserFinishedListener(openedAt) {
  await removeBrowserFinishedListener()
  browserFinishedHandle = await Browser.addListener('browserFinished', function() {
    if (Date.now() - openedAt < BROWSER_FINISHED_GRACE_MS) return
    if (!storageGet(ANDROID_OAUTH_PENDING_KEY)) return
    clearAndroidOAuthSession()
  })
}

function restoreReturnPath() {
  var returnPath = storageGet(ANDROID_OAUTH_RETURN_KEY) || '/'
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', returnPath)
    }
  } catch (e) {}
}

export function isAndroidOAuthCallbackUrl(url) {
  return isAndroidAppOAuthCallbackUrl(url)
}

export function hasPendingAndroidOAuthCallback(url) {
  if (!isAndroidApp()) return false
  if (!storageGet(ANDROID_OAUTH_PENDING_KEY)) return false
  const target = url || (typeof window !== 'undefined' ? window.location.href : '')
  return isAndroidOAuthCallbackUrl(target)
}

/**
 * Return OAuth code payload from a callback URL (deep link or WebView location).
 */
export function consumeAndroidOAuthCallbackFromUrl(url) {
  if (!isAndroidApp()) return null
  const rawUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
  if (!isAndroidOAuthCallbackUrl(rawUrl)) return null
  if (!storageGet(ANDROID_OAUTH_PENDING_KEY)) return null

  const verifier = storageGet(ANDROID_OAUTH_VERIFIER_KEY)
  if (!verifier) return null

  const parsed = parseAndroidOAuthRedirectUrl(rawUrl)
  if (!parsed.code && !parsed.error) return null

  clearAndroidOAuthSession()
  restoreReturnPath()

  if (parsed.error) {
    if (parsed.error === 'access_denied') {
      throw new Error('Sign-in cancelled')
    }
    throw new Error(parsed.error_description || parsed.error)
  }
  if (!parsed.code) {
    throw new Error('No authorization code returned')
  }
  return {
    code: parsed.code,
    code_verifier: verifier,
  }
}

function buildGoogleAuthUrl(options, pkce) {
  const opts = options || {}
  const clientId = opts.clientId
  const scopes = Array.isArray(opts.scopes) ? opts.scopes.filter(Boolean) : []
  const redirect = getGoogleOAuthRedirectUri(clientId)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: scopes.join(' '),
    code_challenge: pkce.code_challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    include_granted_scopes: opts.incremental ? 'true' : 'false',
  })
  if (opts.prompt) params.set('prompt', opts.prompt)
  if (opts.loginHint) params.set('login_hint', opts.loginHint)
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString()
}

async function beginAndroidBrowserOAuth(options) {
  const opts = options || {}
  const clientId = opts.clientId
  if (!clientId) throw new Error('Google client id is not configured')
  const scopes = Array.isArray(opts.scopes) ? opts.scopes.filter(Boolean) : []
  if (!scopes.length) throw new Error('No OAuth scopes requested')

  clearAndroidOAuthResumeGuard()
  const pkce = await createPkcePair()
  const authUrl = buildGoogleAuthUrl(opts, pkce)
  const returnPath = window.location.pathname + window.location.search + window.location.hash

  storageSet(ANDROID_OAUTH_PENDING_KEY, String(Date.now()))
  storageSet(ANDROID_OAUTH_VERIFIER_KEY, pkce.code_verifier)
  storageSet(ANDROID_OAUTH_RETURN_KEY, returnPath || '/')

  browserOpenedAt = Date.now()
  await installBrowserFinishedListener(browserOpenedAt)

  try {
    await Browser.open({ url: authUrl })
  } catch (e) {
    // Fallback when Custom Tabs plugin is unavailable.
    window.location.assign(authUrl)
  }
}

/**
 * Start Custom Tabs OAuth or return the code if we are already on the redirect URL.
 */
export async function requestGoogleAuthCodeViaBrowser(options) {
  if (!isAndroidApp()) {
    throw new Error('Browser OAuth is only used on Android')
  }

  const resumed = consumeAndroidOAuthCallbackFromUrl()
  if (resumed) return resumed

  await beginAndroidBrowserOAuth(options)
  throw new AndroidOAuthNavigateAway()
}

export function isUserCancelledError(err) {
  const message = err && err.message ? String(err.message) : ''
  return /cancel|closed|sign-in cancelled/i.test(message)
}

export function shouldUseAndroidBrowserOAuth() {
  return isAndroidApp()
}

var deepLinkListenerInstalled = false

/** Listen for OAuth deep links when Android offers "Open with Tunebook". */
export function ensureAndroidOAuthDeepLinkListener(onPayload) {
  if (!isAndroidApp() || deepLinkListenerInstalled || typeof onPayload !== 'function') return
  deepLinkListenerInstalled = true

  function deliver(url) {
    if (!url) return
    try {
      const payload = consumeAndroidOAuthCallbackFromUrl(url)
      if (payload) {
        closeAndroidOAuthBrowser()
        onPayload(payload)
      }
    } catch (err) {
      closeAndroidOAuthBrowser()
      onPayload(null, err)
    }
  }

  App.addListener('appUrlOpen', function(event) {
    deliver(event && event.url ? event.url : '')
  }).catch(function() {})

  App.getLaunchUrl().then(function(launch) {
    if (launch && launch.url) deliver(launch.url)
  }).catch(function() {})
}
