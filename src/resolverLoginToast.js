import React from 'react'
import { toast } from 'react-toastify'
import {
  getResolverLoginWarning,
  isMediaProxyAuthorizationError,
  normalizeAccessToken,
} from './mediaProxyClient'
import {
  getMediaResolverHealthState,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore'
import { isNavigatorOffline } from './offlineNetwork'

const TOAST_ID = 'resolver-login-required'

/** Dedupe key for the last warned resolver/auth state. */
let lastWarnedKey = ''

/** Whether the last sync saw a non-empty access token. */
let lastSyncedHadToken = false

/** Latest token for health-subscription sync (avoids stale closures). */
let latestAccessToken = null

/** Login handler for the toast button (set from app init). */
let loginHandler = null

/** Optional hook before login (e.g. unlock audio + keep pending play). */
let beforeLoginHandler = null

export function setResolverLoginToastLogin(login) {
  loginHandler = typeof login === 'function' ? login : null
}

export function setResolverLoginToastBeforeLogin(fn) {
  beforeLoginHandler = typeof fn === 'function' ? fn : null
}

function warningKey(status, accessToken) {
  if (!status) return ''
  const candidates = status.candidates || []
  const authBlocked = candidates.filter(function(candidate) {
    return candidate.reachable && candidate.requireAuth && !candidate.available
  })
  const bases = authBlocked.map(function(c) { return c.base }).sort().join(',')
  const reason = authBlocked.map(function(c) { return c.authReason || '' }).sort().join(',')
  return bases + '|' + reason + '|' + (accessToken ? 'token' : 'no-token')
}

function renderResolverLoginToastContent(warning) {
  return function ResolverLoginToastContent(renderProps) {
    const showButton = !!(warning && warning.showLoginButton && typeof loginHandler === 'function')
    return (
      <div
        className="resolver-login-toast"
        style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
      >
        <span>{warning && warning.message ? warning.message : 'Login to continue'}</span>
        {showButton ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="resolver-login-toast-button"
            onClick={function() {
              if (typeof beforeLoginHandler === 'function') {
                try { beforeLoginHandler() } catch (e) {}
              }
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
              loginHandler()
            }}
          >
            Login
          </button>
        ) : null}
      </div>
    )
  }
}

/** Show (or replace) the resolver login toast for a warning object. */
export function showResolverLoginToast(warning, options) {
  if (!warning || !warning.message) return
  const opts = options || {}
  toast.warning(renderResolverLoginToastContent(warning), {
    toastId: TOAST_ID,
    autoClose: opts.autoClose != null ? opts.autoClose : 12000,
    closeOnClick: true,
  })
}

/**
 * Show the login toast for a media-proxy 401/auth failure (or when force=true).
 * Returns true when the error was handled as an auth prompt.
 */
export function showResolverLoginToastForAuthError(error, options) {
  const opts = options || {}
  if (!opts.force && !isMediaProxyAuthorizationError(error)) return false

  const accessToken = normalizeAccessToken(opts.accessToken)
  const status = opts.resolverStatus !== undefined
    ? opts.resolverStatus
    : getMediaResolverHealthState().status
  const fromHealth = getResolverLoginWarning(status, accessToken)
  // Logged-in users can still hit 401s on unauthenticated side requests (art,
  // TTS). Do not flash "Login to continue" when health says the token is fine.
  if (accessToken && !fromHealth && !opts.force) {
    return false
  }
  const warning = {
    message: (fromHealth && fromHealth.message)
      || opts.message
      || 'Login to continue',
    showLoginButton: fromHealth
      ? !!fromHealth.showLoginButton || !accessToken
      : true,
  }
  showResolverLoginToast(warning, opts)
  return true
}

export function syncResolverLoginToast(accessToken) {
  if (arguments.length > 0) {
    latestAccessToken = accessToken
  }
  if (isNavigatorOffline()) {
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
    return
  }
  const token = latestAccessToken
  const hasToken = !!normalizeAccessToken(token)
  if (lastSyncedHadToken && !hasToken) {
    // Intentional logout (or cleared session): dismiss any lingering toast.
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
  }
  lastSyncedHadToken = hasToken

  const state = getMediaResolverHealthState()
  if (!state.checked) return

  const warning = getResolverLoginWarning(state.status, token)
  if (!warning) {
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
    return
  }

  // Never auto-nag when logged out (fresh page load or after logout).
  // Gated actions still call showResolverLoginToast* explicitly.
  if (!hasToken) {
    return
  }

  const key = warningKey(state.status, token)
  if (key === lastWarnedKey) return
  lastWarnedKey = key

  showResolverLoginToast(warning)
}

/** Subscribe once from app init; re-shows after resolver settings change. */
export function startResolverLoginToastSync(accessToken) {
  latestAccessToken = accessToken

  function onSettingsChanged() {
    lastWarnedKey = ''
    toast.dismiss(TOAST_ID)
    syncResolverLoginToast(latestAccessToken)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mediaProxySettingsChanged', onSettingsChanged)
    window.addEventListener('offline', onSettingsChanged)
    window.addEventListener('online', onSettingsChanged)
  }

  syncResolverLoginToast(latestAccessToken)
  const unsubscribe = subscribeMediaResolverHealth(function() {
    // Always use the latest token — health updates after login must not sync
    // against the pre-login null token closed over at subscribe time.
    syncResolverLoginToast(latestAccessToken)
  })

  return function stop() {
    unsubscribe()
    if (typeof window !== 'undefined') {
      window.removeEventListener('mediaProxySettingsChanged', onSettingsChanged)
      window.removeEventListener('offline', onSettingsChanged)
      window.removeEventListener('online', onSettingsChanged)
    }
  }
}

export function __resetResolverLoginToastForTests() {
  lastWarnedKey = ''
  lastSyncedHadToken = false
  latestAccessToken = null
  loginHandler = null
  beforeLoginHandler = null
  toast.dismiss(TOAST_ID)
}
