import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import { normalizeToTokenResponse } from './googleLoginTokenAdapter'
import {
  exchangeAuthCode,
  loadAuthSession,
  logoutAuthSession,
  readStoredAuthSessionId,
  refreshAuthSession,
  storeAuthBase,
  storeAuthSessionId,
} from './authResolverClient'
import {
  clearLoginProfile,
  storeLoginProfile,
} from './googleLoginTokenClient'

function redirectUri() {
  if (typeof window === 'undefined' || !window.location) return ''
  return window.location.origin
}

/**
 * Authorization Code + PKCE via GIS initCodeClient, with silent refresh through
 * a resolver OAuth BFF. Falls back to onFallbackToTokenClient when silent refresh fails.
 */
export function createOAuthBffController(ctx) {
  var loginRefreshTimeout = null
  var refreshInFlight = null
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

  function scheduleRenew(tokenResponse) {
    if (!(tokenResponse && tokenResponse.expires_in > 0)) return
    clearTimeout(loginRefreshTimeout)
    // Renew at 90% of lifetime for silent BFF refresh.
    loginRefreshTimeout = setTimeout(function() {
      silentRefresh().catch(function() {})
    }, Math.floor(tokenResponse.expires_in * 900))
  }

  function applyTokenPayload(payload) {
    var normalized = normalizeToTokenResponse(payload)
    if (!normalized) return null
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

  function requestAuthorizationCode(extraScopes, options) {
    var prompt = ''
    if (options && options.forceConsent) prompt = 'consent'
    else if (forceConsentNext) prompt = 'consent'
    // Prefer a synchronous GIS open on login clicks. Polling for GSI here
    // runs after setTimeout and browsers block the OAuth popup.
    var oauth2 = global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2
    if (!oauth2) {
      return Promise.reject(new Error('Google sign-in is still loading'))
    }
    var requestId = ++authRequestSeq
    return new Promise(function(resolve, reject) {
      rememberExtraScopes(extraScopes)
      var useScopes = mergeScopes(extraScopes)
      var settled = false
      function settle(fn, value) {
        if (settled || requestId !== authRequestSeq) return
        settled = true
        fn(value)
      }
      var config = {
        client_id: ctx.clientId,
        scope: useScopes.join(' '),
        ux_mode: 'popup',
        include_granted_scopes: true,
        // Offline access so the BFF receives a refresh_token.
        // GIS accepts these fields for code clients.
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
      var client = oauth2.initCodeClient(config)
      client.requestCode()
    })
  }

  function exchangeCode(codePayload) {
    var authBase = getAuthBase()
    if (!authBase) {
      return Promise.reject(new Error('No OAuth resolver available'))
    }
    return exchangeAuthCode(authBase, {
      code: codePayload.code,
      code_verifier: codePayload.code_verifier || '',
      redirect_uri: redirectUri(),
    }).then(function(body) {
      return applyTokenPayload(body)
    }).catch(function(err) {
      if (err && err.body && err.body.error === 'refresh_token_missing') {
        forceConsentNext = true
      }
      throw err
    })
  }

  function login() {
    // Prefer the authorization-code popup without forcing consent. That skips
    // Google's consent UI when the app was already granted (avoids the Token
    // Client consent page that 500s for some accounts after prior BFF prompts).
    // Only force consent when we previously learned a refresh_token is required.
    function attempt(forceConsent) {
      return requestAuthorizationCode(null, { forceConsent: !!forceConsent }).then(exchangeCode)
    }
    var forced = !!forceConsentNext
    return attempt(forced).catch(function(err) {
      console.warn('OAuth BFF login failed', err)
      throw err
    })
  }

  function requestGoogleScopes(extraScopes, options) {
    if (!localStorage.getItem('google_login_user')) {
      return Promise.reject(new Error('Not logged in'))
    }
    return requestAuthorizationCode(extraScopes, options).then(exchangeCode)
  }

  function silentRefresh() {
    if (refreshInFlight) return refreshInFlight
    var authBase = getAuthBase()
    var sessionId = readStoredAuthSessionId()
    if (!authBase || !sessionId) {
      return fallbackToTokenClientRenew()
    }
    refreshInFlight = refreshAuthSession(authBase, sessionId)
      .then(function(body) {
        refreshInFlight = null
        return applyTokenPayload(Object.assign({}, body, { session_id: body.session_id || sessionId }))
      })
      .catch(function(err) {
        refreshInFlight = null
        console.warn('OAuth BFF silent refresh failed', err)
        return fallbackToTokenClientRenew()
      })
    return refreshInFlight
  }

  function fallbackToTokenClientRenew() {
    // Keep current access token; ask facade to renew via Token Client popup.
    storeAuthSessionId('')
    if (ctx.onFallbackToTokenClient) {
      ctx.onFallbackToTokenClient()
    }
    return Promise.resolve(null)
  }

  function tryRefreshAccessToken() {
    return silentRefresh()
  }

  function resumeSession() {
    var authBase = getAuthBase()
    var sessionId = readStoredAuthSessionId()
    if (!authBase || !sessionId || !localStorage.getItem('google_login_user')) {
      return Promise.resolve(null)
    }
    return loadAuthSession(authBase, sessionId)
      .then(function(body) {
        return applyTokenPayload(Object.assign({}, body, {
          session_id: body.session_id || sessionId,
          email: body.email,
        }))
      })
      .catch(function(err) {
        console.warn('OAuth BFF session resume failed', err)
        storeAuthSessionId('')
        return null
      })
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
    return logoutAuthSession(authBase, sessionId).finally(function() {
      // Drop session id only. Keep sticky auth base. Do not revoke Google grant.
      storeAuthSessionId('')
      ctx.setUser(null)
      ctx.setAccessToken(null)
      localStorage.setItem('google_login_user', '')
      clearLoginProfile()
    })
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
    dispose: dispose,
  }
}
