import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import { normalizeToTokenResponse } from './googleLoginTokenAdapter'
import {
  clearAuthSessionStorage,
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
  var disposed = false

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

  function waitForGsiOauth2() {
    return new Promise(function(resolve, reject) {
      var tries = 0
      function tick() {
        if (disposed) {
          reject(new Error('disposed'))
          return
        }
        if (global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2) {
          resolve(global.window.google.accounts.oauth2)
          return
        }
        tries += 1
        if (tries > 100) {
          reject(new Error('Google sign-in is still loading'))
          return
        }
        setTimeout(tick, 100)
      }
      tick()
    })
  }

  function requestAuthorizationCode(extraScopes, options) {
    var prompt = ''
    if (options && options.forceConsent) prompt = 'consent'
    else if (forceConsentNext) prompt = 'consent'
    return waitForGsiOauth2().then(function(oauth2) {
      return new Promise(function(resolve, reject) {
        rememberExtraScopes(extraScopes)
        var useScopes = mergeScopes(extraScopes)
        var config = {
          client_id: ctx.clientId,
          scope: useScopes.join(' '),
          ux_mode: 'popup',
          include_granted_scopes: true,
          // Offline access so the BFF receives a refresh_token.
          // GIS accepts these fields for code clients.
          callback: function(response) {
            if (!response || response.error) {
              reject(new Error((response && (response.error_description || response.error)) || 'Authorization failed'))
              return
            }
            if (!response.code) {
              reject(new Error('No authorization code returned'))
              return
            }
            forceConsentNext = false
            resolve({
              code: response.code,
              // GIS popup may not expose verifier; BFF accepts optional verifier.
              code_verifier: response.code_verifier || '',
            })
          },
          error_callback: function(err) {
            reject(new Error((err && (err.message || err.type)) || 'Authorization cancelled'))
          },
        }
        if (prompt) config.prompt = prompt
        var client = oauth2.initCodeClient(config)
        client.requestCode()
      })
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
    var needsConsent = forceConsentNext || !readStoredAuthSessionId()
    return requestAuthorizationCode(null, { forceConsent: needsConsent })
      .then(exchangeCode)
      .catch(function(err) {
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
    return logoutAuthSession(authBase, sessionId).finally(function() {
      clearAuthSessionStorage()
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
    disposed = true
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
