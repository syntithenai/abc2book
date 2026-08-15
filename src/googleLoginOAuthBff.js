import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import { isNavigatorOffline } from './offlineNetwork'
import {
  normalizeToTokenResponse,
  mergeScopeStrings,
  tokenHasFreshAccess,
} from './googleLoginTokenAdapter'
import {
  exchangeAuthCode,
  loadAuthSession,
  logoutAuthSession,
  LOGIN_AUTH_WAIT_MS,
  oauthBffCandidatesForLogin,
  pickAuthResolverBase,
  pickAuthResolverBaseForLogin,
  pickNextAuthResolverBase,
  readStoredAuthSessionId,
  refreshAuthSession,
  setOAuthLoginInFlight,
  storeAuthBase,
  storeAuthSessionId,
} from './authResolverClient'
import { getMediaResolverHealthState, waitForAuthBase } from './mediaResolverHealthStore'
import {
  clearLoginProfile,
  readLoginHintEmail,
  readStoredLoginProfile,
  storeLoginProfile,
} from './googleLoginTokenClient'
import {
  requestGoogleAuthCodeViaBrowser,
  shouldUseAndroidBrowserOAuth,
  AndroidOAuthNavigateAway,
} from './androidGoogleAuth'
import { getGoogleOAuthRedirectUri } from './googleOAuthRedirectUri'
import { isTerminalAuthError } from './authSessionErrors'

function loginHintEmail() {
  var hint = readLoginHintEmail()
  if (hint) return hint
  var profile = readStoredLoginProfile()
  if (profile && profile.email) return profile.email
  try {
    var stored = localStorage.getItem('google_login_user') || ''
    if (stored.indexOf('@') > 0) return stored
  } catch (e) {}
  return ''
}

function redirectUri() {
  return getGoogleOAuthRedirectUri(
    (typeof process !== 'undefined' && process.env && process.env.REACT_APP_GOOGLE_CLIENT_ID)
      || ''
  )
}

/**
 * Authorization Code + PKCE via GIS initCodeClient, with silent refresh through
 * a resolver OAuth BFF. Falls back to onFallbackToTokenClient when silent refresh fails.
 */
export function createOAuthBffController(ctx) {
  var loginRefreshTimeout = null
  var loginInFlight = null
  var refreshInFlight = null
  var resumeInFlight = null
  var grantedExtraScopes = []
  var forceConsentNext = false
  var authRequestSeq = 0

  function getAuthBase() {
    return (ctx.getAuthBase && ctx.getAuthBase()) || ''
  }

  function mergeScopes(extraScopes) {
    var useScopes = Array.isArray(ctx.scopes) ? ctx.scopes.slice() : []
    GOOGLE_IDENTITY_SCOPES.forEach(function(scope) {
      if (useScopes.indexOf(scope) === -1) useScopes.push(scope)
    })
    grantedExtraScopes.forEach(function(scope) {
      if (useScopes.indexOf(scope) === -1) useScopes.push(scope)
    })
    if (Array.isArray(extraScopes)) {
      extraScopes.forEach(function(extraScope) {
        if (useScopes.indexOf(extraScope) === -1) useScopes.push(extraScope)
      })
    }
    return useScopes
  }

  function rememberExtraScopes(extraScopes) {
    if (!Array.isArray(extraScopes)) return
    extraScopes.forEach(function(extraScope) {
      if (grantedExtraScopes.indexOf(extraScope) === -1) {
        grantedExtraScopes.push(extraScope)
      }
    })
  }

  var refreshBackoffUntil = 0

  function scheduleRenew(tokenResponse) {
    if (!(tokenResponse && tokenResponse.expires_in > 0)) return
    clearTimeout(loginRefreshTimeout)
    // Renew at 90% of lifetime for silent BFF refresh.
    loginRefreshTimeout = setTimeout(function() {
      if (isNavigatorOffline()) {
        scheduleRenew(tokenResponse)
        return
      }
      silentRefresh().catch(function() {})
    }, Math.floor(tokenResponse.expires_in * 900))
  }

  function applyTokenPayload(payload) {
    var normalized = normalizeToTokenResponse(payload)
    if (!normalized) return null
    var previous = ctx.getAccessToken && ctx.getAccessToken()
    if (previous && previous.scope) {
      normalized.scope = mergeScopeStrings(previous.scope, normalized.scope.split(/\s+/))
    }
    if (payload.session_id) {
      storeAuthSessionId(payload.session_id)
    }
    var base = getAuthBase()
    if (base) storeAuthBase(base)
    ctx.setAccessToken(normalized)
    if (payload.email) {
      var profile = {
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture || '',
        given_name: payload.given_name || '',
        family_name: payload.family_name || '',
      }
      ctx.setUser(profile)
      storeLoginProfile(profile)
      localStorage.setItem('google_login_user', payload.email)
    } else {
      localStorage.setItem('google_login_user', '1')
    }
    scheduleRenew(normalized)
    if (ctx.onTokenUpdated) ctx.onTokenUpdated(normalized)
    return normalized
  }

  function formatGisError(err) {
    if (!err) return 'Authorization cancelled'
    if (typeof err === 'string') return err
    var type = err.type ? String(err.type) : ''
    var message = err.message ? String(err.message) : ''
    if (type === 'popup_closed' || type === 'popup_closed_by_user') {
      return 'Sign-in cancelled'
    }
    if (type === 'popup_failed_to_open' || /failed to open popup/i.test(message)) {
      return 'Pop-up blocked. Allow pop-ups for this site and try Login again.'
    }
    // GIS / HMR can report this when a previous sign-in client was replaced.
    if (type === 'disposed' || /^disposed$/i.test(message)) {
      return 'Sign-in was interrupted. Close other Google sign-in windows and try Login again.'
    }
    return message || type || 'Authorization cancelled'
  }

  function scopesForRequest(extraScopes, options) {
    // Incremental scope upgrades (picker, photos, etc.) — not the main login path.
    if (options && (options.loginOnly || options.identityOnly)) {
      return GOOGLE_IDENTITY_SCOPES.slice()
    }
    return mergeScopes(extraScopes)
  }

  function isIdentityOnlyScopes(extraScopes) {
    if (!Array.isArray(extraScopes) || extraScopes.length === 0) return false
    for (var i = 0; i < extraScopes.length; i++) {
      if (GOOGLE_IDENTITY_SCOPES.indexOf(extraScopes[i]) === -1) return false
    }
    return true
  }

  function requestAuthorizationCode(extraScopes, options) {
    var prompt = ''
    if (options && options.forceConsent) prompt = 'consent'
    else if (forceConsentNext) prompt = 'consent'

    if (shouldUseAndroidBrowserOAuth()) {
      var androidScopes = scopesForRequest(extraScopes, options)
      if (!(options && (options.loginOnly || options.identityOnly))) {
        rememberExtraScopes(extraScopes)
      }
      return requestGoogleAuthCodeViaBrowser({
        clientId: ctx.clientId,
        scopes: androidScopes,
        prompt: prompt,
        loginHint: loginHintEmail(),
        incremental: !!(options && options.incremental),
      })
    }

    // Prefer a synchronous GIS open on login clicks. Polling for GSI here
    // runs after setTimeout and browsers block the OAuth popup.
    var oauth2 = global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2
    if (!oauth2) {
      return Promise.reject(new Error('Google sign-in is still loading'))
    }
    var requestId = ++authRequestSeq
    return new Promise(function(resolve, reject) {
      if (!(options && (options.loginOnly || options.identityOnly))) {
        rememberExtraScopes(extraScopes)
      }
      var useScopes = scopesForRequest(extraScopes, options)
      var settled = false
      function settle(fn, value) {
        if (settled || requestId !== authRequestSeq) return
        settled = true
        fn(value)
      }
      var identityOnly = !!(options && (options.loginOnly || options.identityOnly))
      var incremental = !!(options && options.incremental)
      var config = {
        client_id: ctx.clientId,
        scope: useScopes.join(' '),
        ux_mode: 'popup',
        // Login must request only the scopes listed above. include_granted_scopes
        // would re-attach old sensitive grants (e.g. drive.readonly) and trigger
        // "Google hasn't verified this app" even when drive.file is approved.
        include_granted_scopes: incremental && !identityOnly,
        // Required for BFF refresh tokens (GIS passes through to Google auth URL).
        access_type: 'offline',
        callback: function(response) {
          if (!response || response.error) {
            settle(reject, new Error((response && (response.error_description || response.error)) || 'Authorization failed'))
            return
          }
          if (!response.code) {
            settle(reject, new Error('No authorization code returned'))
            return
          }
          forceConsentNext = false
          settle(resolve, {
            code: response.code,
            // GIS popup may not expose verifier; BFF accepts optional verifier.
            code_verifier: response.code_verifier || '',
          })
        },
        error_callback: function(err) {
          settle(reject, new Error(formatGisError(err)))
        },
      }
      if (prompt) config.prompt = prompt
      var hint = loginHintEmail()
      if (hint) config.login_hint = hint
      var client = oauth2.initCodeClient(config)
      client.requestCode()
    })
  }

  function exchangeCode(codePayload, authBaseOverride) {
    var authBase = authBaseOverride || getAuthBase()
    if (!authBase) {
      return Promise.reject(new Error('No OAuth resolver available'))
    }
    return exchangeAuthCode(authBase, {
      code: codePayload.code,
      code_verifier: codePayload.code_verifier || '',
      redirect_uri: redirectUri(),
    }).then(function(body) {
      if (body && body.access_token && !body.session_id) {
        // Online-only grant: resolver works now; user may need one consent retry later
        // for silent BFF refresh (revoke app access at Google, then log in again).
        forceConsentNext = true
        console.warn('OAuth BFF: signed in without offline refresh session')
      } else if (body && body.session_id) {
        forceConsentNext = false
      }
      return applyTokenPayload(body)
    }).catch(function(err) {
      if (err && err.body && err.body.error === 'refresh_token_missing') {
        forceConsentNext = true
      }
      throw err
    })
  }

  function oauthBffExchangeErrorParts(err) {
    return [
      err && err.message,
      err && err.body && err.body.detail,
      err && err.body && err.body.error,
      err && err.body && err.body.hint,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  function shouldRetryOAuthBffOnAnotherResolver(err) {
    var text = oauthBffExchangeErrorParts(err)
    return /client[_\s-]?secret|token_exchange|oauth_bff_unavailable|oauth exchange failed|missing_parameters|could not reach oauth resolver/.test(text)
  }

  function resolveLoginAuthBase() {
    if (shouldUseAndroidBrowserOAuth()) {
      var quickHealth = getMediaResolverHealthState()
      var quickProbed = quickHealth && quickHealth.status && quickHealth.status.candidates
        ? quickHealth.status.candidates : []
      var quickBase = pickAuthResolverBaseForLogin(quickProbed)
      if (quickBase) {
        storeAuthBase(quickBase)
        if (ctx.onAuthBaseResolved) ctx.onAuthBaseResolved(quickBase)
        return Promise.resolve(quickBase)
      }
    }
    return waitForAuthBase(LOGIN_AUTH_WAIT_MS, { untilProbeSettled: true }).then(function() {
      var health = getMediaResolverHealthState()
      var probed = health && health.status && health.status.candidates
        ? health.status.candidates : []
      var base = pickAuthResolverBaseForLogin(probed) || getAuthBase()
      if (base) {
        storeAuthBase(base)
        if (ctx.onAuthBaseResolved) ctx.onAuthBaseResolved(base)
      }
      return base || ''
    })
  }

  function exchangeCodeWithResolverFallback(codePayload, base, attempt, requestCodeAgain) {
    attempt = attempt || 0
    return exchangeCode(codePayload, base).catch(function(err) {
      var health = getMediaResolverHealthState()
      var probed = health && health.status && health.status.candidates
        ? health.status.candidates : []
      var candidates = oauthBffCandidatesForLogin(probed)
      var nextBase = pickNextAuthResolverBase(candidates, base)
      if (!nextBase || attempt >= 1 || !shouldRetryOAuthBffOnAnotherResolver(err)) {
        throw err
      }
      storeAuthBase(nextBase)
      if (ctx.onAuthBaseResolved) ctx.onAuthBaseResolved(nextBase)
      console.warn('OAuth BFF exchange failed on ' + base + '; retrying on ' + nextBase, err)
      return requestCodeAgain().then(function(retryPayload) {
        return exchangeCodeWithResolverFallback(retryPayload, nextBase, attempt + 1, requestCodeAgain)
      })
    })
  }

  function login() {
    // Always allow an explicit Login click to start a new attempt (Android WebView
    // navigation leaves a never-settling promise on the previous try).
    loginInFlight = null
    setOAuthLoginInFlight(true)
    // Offline access (refresh token / BFF session) is only issued on consent.
    // Token Client grants do not produce one, so first BFF login must re-consent.
    var needConsent = !!forceConsentNext || !readStoredAuthSessionId()
    function requestCode() {
      return requestAuthorizationCode(null, { forceConsent: needConsent })
    }
    var existingBase = getAuthBase()
    var oauth2Ready = !!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)
    // Open GIS on the click stack when the resolver is already known. Waiting
    // for the probe first lets browsers treat the popup as blocked.
    var codePromise = (!shouldUseAndroidBrowserOAuth() && oauth2Ready && existingBase)
      ? requestCode()
      : null
    loginInFlight = resolveLoginAuthBase().then(function(base) {
      if (!base) {
        throw new Error('No OAuth resolver available. Check Settings → Providers or your network connection.')
      }
      return (codePromise || requestCode()).then(function(codePayload) {
        return exchangeCodeWithResolverFallback(codePayload, base, 0, requestCode)
      })
    }).catch(function(err) {
      if (err && err.name === 'AndroidOAuthNavigateAway') return null
      throw err
    }).finally(function() {
      loginInFlight = null
      setOAuthLoginInFlight(false)
    })
    return loginInFlight
  }

  function completeAuthorizationCode(codePayload) {
    if (!codePayload || !codePayload.code) {
      return Promise.reject(new Error('No authorization code returned'))
    }
    setOAuthLoginInFlight(true)
    var needConsent = !!forceConsentNext
    return resolveLoginAuthBase().then(function(base) {
      if (!base) {
        throw new Error('No OAuth resolver available. Check Settings → Providers or your network connection.')
      }
      return exchangeCodeWithResolverFallback(codePayload, base, 0, function() {
        return requestAuthorizationCode(null, { forceConsent: needConsent })
      })
    }).finally(function() {
      setOAuthLoginInFlight(false)
    })
  }

  function requestGoogleScopes(extraScopes, options) {
    if (!localStorage.getItem('google_login_user')) {
      return Promise.reject(new Error('Not logged in'))
    }
    var scopeOptions = Object.assign({ incremental: true }, options || {})
    if (isIdentityOnlyScopes(extraScopes)) {
      scopeOptions.identityOnly = true
    }
    return resolveLoginAuthBase().then(function(base) {
      if (!base) {
        throw new Error('No OAuth resolver available')
      }
      return requestAuthorizationCode(extraScopes, scopeOptions).then(function(codePayload) {
        return exchangeCodeWithResolverFallback(codePayload, base, 0, function() {
          return requestAuthorizationCode(extraScopes, scopeOptions)
        })
      })
    })
  }

  function silentRefresh() {
    if (isNavigatorOffline()) return Promise.resolve(null)
    if (refreshInFlight) return refreshInFlight
    if (refreshBackoffUntil > Date.now()) {
      return Promise.resolve(null)
    }
    var authBase = getAuthBase()
    var sessionId = readStoredAuthSessionId()
    if (!sessionId) {
      return fallbackToTokenClientRenew(null)
    }
    if (!authBase) {
      // Probe not settled yet — keep session; BFF resume will retry.
      return Promise.resolve(null)
    }
    refreshInFlight = refreshAuthSession(authBase, sessionId)
      .then(function(body) {
        refreshInFlight = null
        refreshBackoffUntil = 0
        return applyTokenPayload(Object.assign({}, body, { session_id: body.session_id || sessionId }))
      })
      .catch(function(err) {
        refreshInFlight = null
        if (err && err.status === 429) {
          var retryAfter = Number(err.retryAfter || (err.body && err.body.retry_after)) || 60
          refreshBackoffUntil = Date.now() + retryAfter * 1000
          clearTimeout(loginRefreshTimeout)
          loginRefreshTimeout = setTimeout(function() {
            silentRefresh().catch(function() {})
          }, retryAfter * 1000)
          console.warn('OAuth BFF refresh rate limited; retry in', retryAfter, 's')
          return null
        }
        console.warn('OAuth BFF silent refresh failed', err)
        return fallbackToTokenClientRenew(err)
      })
    return refreshInFlight
  }

  function fallbackToTokenClientRenew(err) {
    if (err && isTerminalAuthError(err)) {
      storeAuthSessionId('')
    }
    if (ctx.onFallbackToTokenClient) {
      ctx.onFallbackToTokenClient(err)
    }
    return Promise.resolve(null)
  }

  function tryRefreshAccessToken() {
    if (refreshBackoffUntil > Date.now()) {
      return Promise.resolve(null)
    }
    var current = ctx.getAccessToken && ctx.getAccessToken()
    // Reuse a still-fresh bearer. Missing expires_at used to force silentRefresh
    // on every media-proxy 401 and could clear the session / log the user out.
    if (tokenHasFreshAccess(current)) {
      return Promise.resolve(current)
    }
    return silentRefresh()
  }

  function clearRememberedLogin() {
    storeAuthSessionId('')
    storeAuthBase('')
    if (ctx.setUser) ctx.setUser(null)
    if (ctx.setAccessToken) ctx.setAccessToken(null)
    try {
      localStorage.setItem('google_login_user', '')
    } catch (e) {}
    clearLoginProfile()
  }

  function resumeSession() {
    if (resumeInFlight) return resumeInFlight
    var authBase = getAuthBase()
    var sessionId = readStoredAuthSessionId()
    if (!authBase || !sessionId || !localStorage.getItem('google_login_user')) {
      return Promise.resolve(null)
    }
    resumeInFlight = loadAuthSession(authBase, sessionId)
      .then(function(body) {
        resumeInFlight = null
        return applyTokenPayload(Object.assign({}, body, {
          session_id: body.session_id || sessionId,
          email: body.email,
        }))
      })
      .catch(function(err) {
        resumeInFlight = null
        console.warn('OAuth BFF session resume failed', err)
        if (isTerminalAuthError(err)) {
          clearRememberedLogin()
        }
        return null
      })
    return resumeInFlight
  }

  function logout() {
    var authBase = getAuthBase()
    var sessionId = readStoredAuthSessionId()
    clearTimeout(loginRefreshTimeout)
    // Remember email for Token Client login_hint before clearing profile.
    try {
      var profile = null
      try {
        profile = JSON.parse(localStorage.getItem('google_login_profile') || 'null')
      } catch (e) {}
      if (profile && profile.email) {
        localStorage.setItem('google_login_hint_email', profile.email)
      }
    } catch (e) {}
    // Drop local session immediately so a follow-up Login on the same click
    // can open GIS without waiting on network logout (and cannot race a later
    // finally() that would wipe a newly created BFF session).
    storeAuthSessionId('')
    storeAuthBase('')
    ctx.setUser(null)
    ctx.setAccessToken(null)
    localStorage.setItem('google_login_user', '')
    clearLoginProfile()
    return logoutAuthSession(authBase, sessionId)
  }

  function refresh() {
    return silentRefresh()
  }

  function handleCredentialResponse() {
    // One Tap JWT does not yield a refresh token; run full code login.
    return login()
  }

  function dispose() {
    clearTimeout(loginRefreshTimeout)
  }

  return {
    login: login,
    logout: logout,
    refresh: refresh,
    requestGoogleScopes: requestGoogleScopes,
    handleCredentialResponse: handleCredentialResponse,
    rememberExtraScopes: rememberExtraScopes,
    tryRefreshAccessToken: tryRefreshAccessToken,
    resumeSession: resumeSession,
    completeAuthorizationCode: completeAuthorizationCode,
    dispose: dispose,
  }
}
