import {
  candidateOffersOauthBff,
  readStoredAuthSessionId,
  readStoredAuthBase,
} from './authResolverClient'

function readHasLoginFlag() {
  try {
    return !!localStorage.getItem('google_login_user')
  } catch (e) {
    return false
  }
}

function reachableOauthBffBases(candidates) {
  var bases = []
  if (!Array.isArray(candidates)) return bases
  candidates.forEach(function(candidate) {
    if (candidateOffersOauthBff(candidate) && candidate.reachable) {
      bases.push(candidate.base || '')
    }
  })
  return bases
}

/**
 * Build a short narrative summary for Settings → Providers → Google sign-in.
 */
export function buildGoogleLoginSummary(options) {
  var user = options && options.user
  var token = options && options.token
  var authMode = options && options.authMode ? options.authMode : 'pending'
  var authBase = options && options.authBase ? options.authBase : ''
  var authBaseChecked = !!(options && options.authBaseChecked)
  var resolverStatus = options && options.resolverStatus

  var hasLoginFlag = readHasLoginFlag()
  var sessionId = readStoredAuthSessionId()
  var storedAuthBase = readStoredAuthBase()
  var email = user && user.email ? user.email : ''
  var hasToken = !!(token && token.access_token)
  var expiresAt = token && token.expires_at ? Number(token.expires_at) : 0
  var tokenValid = hasToken && (!expiresAt || expiresAt > Date.now() + 60000)
  var signedIn = !!(email || (hasLoginFlag && hasToken))
  var effectiveAuthBase = authBase || storedAuthBase || ''
  var reachableBff = reachableOauthBffBases(resolverStatus && resolverStatus.candidates)

  var silentRefreshActive = authMode === 'oauth' && !!sessionId && !!effectiveAuthBase
  var silentRefreshAvailable = reachableBff.length > 0 || !!effectiveAuthBase

  var tone = 'pending'
  var headline = 'Checking Google sign-in…'
  var summary = 'Waiting for the resolver probe to finish.'
  var silentRefreshLabel = 'Unknown'
  var actions = []

  if (!authBaseChecked || authMode === 'pending') {
    tone = 'pending'
    headline = 'Checking Google sign-in…'
    summary = 'TuneBook is probing your media resolver to see whether silent OAuth refresh is available.'
    silentRefreshLabel = 'Checking'
  } else if (!signedIn && !hasLoginFlag) {
    tone = 'warn'
    headline = 'Not signed in'
    summary = silentRefreshAvailable
      ? 'A resolver with OAuth BFF is available, so you can sign in once and get silent refresh on reload.'
      : 'Sign in with Google to use Drive sync and resolver-backed features. Without an OAuth BFF resolver, renewals use pop-up windows.'
    silentRefreshLabel = silentRefreshAvailable ? 'Available after sign-in' : 'Not available'
    actions.push({
      label: 'Log in with Google',
      description: 'Opens Google sign-in. With OAuth BFF, this also creates a silent-refresh session.',
    })
  } else if (silentRefreshActive && tokenValid) {
    tone = 'ok'
    headline = 'Everything looks good'
    summary = email
      ? ('Signed in as ' + email + '. Silent refresh is active — page reloads and token expiry renew in the background without pop-ups.')
      : 'Signed in. Silent refresh is active — page reloads and token expiry renew in the background without pop-ups.'
    silentRefreshLabel = 'Yes'
  } else if (silentRefreshActive && !tokenValid) {
    tone = 'warn'
    headline = 'Session found but token needs renewal'
    summary = email
      ? ('Signed in as ' + email + '. Your BFF session is stored, but the access token is missing or expired. Try refreshing the token or reloading the page.')
      : 'Your BFF session is stored, but the access token is missing or expired. Try refreshing the token or reloading the page.'
    silentRefreshLabel = 'Yes (token needs renewal)'
    actions.push({
      label: 'Refresh token now',
      description: 'Renews silently through your resolver OAuth BFF.',
    })
  } else if (authMode === 'oauth' && !sessionId) {
    tone = 'warn'
    headline = 'Silent refresh not active'
    summary = email
      ? ('Signed in as ' + email + ', but no BFF session is stored in this browser. Page reloads may open a Google pop-up until you sign in again through the OAuth BFF path.')
      : 'Signed in, but no BFF session is stored in this browser. Page reloads may open a Google pop-up until you sign in again through the OAuth BFF path.'
    silentRefreshLabel = 'No'
    actions.push({
      label: 'Sign out, then log in again',
      description: 'Establishes a fresh BFF session while your OAuth BFF resolver is reachable.',
    })
  } else if (authMode === 'token' || !silentRefreshAvailable) {
    tone = 'warn'
    headline = silentRefreshAvailable
      ? 'Signed in without silent refresh'
      : 'Signed in with pop-up refresh only'
    summary = email
      ? ('Signed in as ' + email + '. ')
      : 'Signed in. '
    if (silentRefreshAvailable && authMode === 'token') {
      summary += 'An OAuth BFF resolver is reachable, but this browser is using pop-up Token Client mode. Sign out and log in again while the resolver is available to switch to silent refresh.'
    } else if (!silentRefreshAvailable) {
      summary += 'No reachable resolver offers OAuth BFF, so TuneBook must use Google pop-up windows to renew your access token on reload or expiry.'
    } else {
      summary += 'Renewals use Google pop-up windows rather than silent background refresh.'
    }
    silentRefreshLabel = 'No'
    if (silentRefreshAvailable) {
      actions.push({
        label: 'Sign out, then log in again',
        description: 'While an OAuth BFF resolver is reachable, this creates a silent-refresh session.',
      })
    } else {
      actions.push({
        label: 'Set up an OAuth BFF resolver',
        description: 'Run the local media resolver (or use a host that advertises oauthBff), then check Providers → Resolver.',
      })
      actions.push({
        label: 'Check resolver URL',
        description: 'Open Providers → Resolver and confirm a candidate is reachable and offers OAuth BFF.',
      })
    }
  } else {
    tone = 'warn'
    headline = 'Sign-in needs attention'
    summary = 'Something is incomplete with Google sign-in. Try signing out and back in, or reload the page.'
    silentRefreshLabel = silentRefreshActive ? 'Yes' : 'No'
    actions.push({
      label: 'Sign out, then log in again',
      description: 'Clears stale state and re-establishes sign-in.',
    })
  }

  var oauthBffHost = effectiveAuthBase
    || (reachableBff.length ? reachableBff[0] : '')

  return {
    tone: tone,
    headline: headline,
    summary: summary,
    silentRefresh: silentRefreshActive,
    silentRefreshLabel: silentRefreshLabel,
    actions: actions,
    signedIn: signedIn,
    email: email,
    authMode: authMode,
    hasToken: hasToken,
    tokenValid: tokenValid,
    hasSession: !!sessionId,
    authBase: effectiveAuthBase,
    reachableBff: reachableBff,
    oauthBffHost: oauthBffHost,
  }
}

// Backwards-compatible alias for any callers still using the old name.
export function buildGoogleLoginStatus(options) {
  return buildGoogleLoginSummary(options)
}
