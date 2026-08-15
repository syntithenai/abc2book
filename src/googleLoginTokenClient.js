import jwt_decode from 'jwt-decode'
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import { normalizeToTokenResponse, tokenHasFreshAccess } from './googleLoginTokenAdapter'
import { shouldUseAndroidBrowserOAuth } from './androidGoogleAuth'
import { isNavigatorOffline } from './offlineNetwork'

var GOOGLE_LOGIN_PROFILE_KEY = 'google_login_profile'
var GOOGLE_LOGIN_HINT_EMAIL_KEY = 'google_login_hint_email'

export function readStoredLoginProfile() {
  try {
    var raw = localStorage.getItem(GOOGLE_LOGIN_PROFILE_KEY)
    if (!raw) return null
    var profile = JSON.parse(raw)
    return profile && profile.email ? profile : null
  } catch (e) {
    return null
  }
}

export function storeLoginProfile(profile) {
  if (!profile || !profile.email) return
  localStorage.setItem(GOOGLE_LOGIN_PROFILE_KEY, JSON.stringify({
    email: profile.email,
    family_name: profile.family_name || '',
    given_name: profile.given_name || '',
    name: profile.name || profile.email,
    picture: profile.picture || '',
  }))
  try {
    localStorage.setItem(GOOGLE_LOGIN_HINT_EMAIL_KEY, profile.email)
  } catch (e) {}
}

export function clearLoginProfile() {
  try {
    localStorage.removeItem(GOOGLE_LOGIN_PROFILE_KEY)
  } catch (e) {}
}

export function readLoginHintEmail() {
  try {
    return localStorage.getItem(GOOGLE_LOGIN_HINT_EMAIL_KEY) || ''
  } catch (e) {
    return ''
  }
}

/**
 * Exact Token Client login path (GIS initTokenClient). Behavior matches the
 * historical useGoogleLogin implementation, including hourly popup renew.
 */
export function createTokenClientController(ctx) {
  var client = { current: null }
  var loginRefreshTimeout = null
  var refreshPendingTimeout = null
  var refreshInFlight = false
  var grantedExtraScopes = []

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
    loginRefreshTimeout = setTimeout(function() {
      if (isNavigatorOffline()) {
        scheduleRenew(tokenResponse)
        return
      }
      refresh()
    }, (tokenResponse.expires_in * 999))
  }

  function applyToken(tokenResponse) {
    refreshInFlight = false
    var normalized = normalizeToTokenResponse(tokenResponse) || tokenResponse
    ctx.setAccessToken(normalized)
    localStorage.setItem('google_login_user', '1')
    scheduleRenew(normalized)
    return normalized
  }

  function scopesForClient(extraScopes, identityOnly) {
    if (identityOnly) {
      return GOOGLE_IDENTITY_SCOPES.slice()
    }
    return mergeScopes(extraScopes)
  }

  function initClient(extraScopes, identityOnly) {
    if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
      return
    }
    var useScopes = scopesForClient(extraScopes, !!identityOnly)
    var refreshConfig = {
      client_id: ctx.clientId,
      prompt: '',
      scope: useScopes.join(' '),
      callback: function(tokenResponse) {
        refreshInFlight = false
        if (tokenResponse && tokenResponse.error) return
        applyToken(tokenResponse)
      },
      error_callback: function() {
        refreshInFlight = false
      },
    }
    var refreshHint = readLoginHintEmail()
    if (refreshHint) refreshConfig.login_hint = refreshHint
    client.current = global.window.google.accounts.oauth2.initTokenClient(refreshConfig)
  }

  function getToken() {
    if (!client.current || refreshInFlight) return
    refreshInFlight = true
    client.current.requestAccessToken()
  }

  function requestGoogleScopes(extraScopes, options) {
    var prompt = (options && options.forceConsent) ? 'consent' : ''
    return new Promise(function(resolve, reject) {
      if (!localStorage.getItem('google_login_user')) {
        reject(new Error('Not logged in'))
        return
      }
      if (shouldUseAndroidBrowserOAuth()) {
        rememberExtraScopes(extraScopes)
        return Promise.reject(new Error(
          'Google scope upgrade on Android requires an OAuth resolver. Check your network connection.'
        ))
      }
      if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
        reject(new Error('Google sign-in is still loading'))
        return
      }
      rememberExtraScopes(extraScopes)
      var useScopes = mergeScopes(extraScopes)
      client.current = global.window.google.accounts.oauth2.initTokenClient({
        client_id: ctx.clientId,
        scope: useScopes.join(' '),
        callback: function(tokenResponse) {
          if (tokenResponse && tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error))
            return
          }
          resolve(applyToken(tokenResponse))
        },
      })
      client.current.requestAccessToken({ prompt: prompt })
    })
  }

  function login() {
    if (shouldUseAndroidBrowserOAuth()) {
      return Promise.reject(new Error(
        'Google login on Android requires an OAuth resolver. Check your network connection.'
      ))
    }

    if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
      return Promise.reject(new Error('Google sign-in is still loading'))
    }
    clearTimeout(refreshPendingTimeout)
    refreshPendingTimeout = null
    refreshInFlight = false
    // Identity + drive.file (app-created tunebook files) in one consent screen.
    var useScopes = mergeScopes(null)
    var hint = readLoginHintEmail()
    return new Promise(function(resolve, reject) {
      var config = {
        client_id: ctx.clientId,
        prompt: '',
        scope: useScopes.join(' '),
        callback: function(tokenResponse) {
          if (tokenResponse && tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error))
            return
          }
          resolve(applyToken(tokenResponse))
        },
        error_callback: function(err) {
          var type = err && err.type ? String(err.type) : ''
          var message = err && err.message ? String(err.message) : ''
          if (type === 'popup_closed' || type === 'popup_closed_by_user') {
            reject(new Error('Sign-in cancelled'))
            return
          }
          if (type === 'popup_failed_to_open' || /failed to open popup/i.test(message)) {
            reject(new Error('Pop-up blocked. Allow pop-ups for this site and try Login again.'))
            return
          }
          reject(new Error(message || type || 'Authorization cancelled'))
        },
      }
      if (hint) config.login_hint = hint
      client.current = global.window.google.accounts.oauth2.initTokenClient(config)
      try {
        client.current.requestAccessToken()
      } catch (err) {
        reject(err)
      }
    })
  }

  function logout() {
    // Keep email hint for quieter next Login; clear signed-in profile/token only.
    // Do not revoke the Google grant — that forces consent screens again.
    ctx.setUser(null)
    ctx.setAccessToken(null)
    localStorage.setItem('google_login_user', '')
    clearLoginProfile()
    clearTimeout(loginRefreshTimeout)
  }

  function refresh(scope) {
    if (isNavigatorOffline()) return
    if (!localStorage.getItem('google_login_user')) return
    if (refreshInFlight || refreshPendingTimeout) return
    var current = ctx.getAccessToken && ctx.getAccessToken()
    if (tokenHasFreshAccess(current, 60000)) {
      scheduleRenew(current)
      return
    }
    function runRefreshAttempt() {
      if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
        refreshPendingTimeout = setTimeout(function() {
          refreshPendingTimeout = null
          runRefreshAttempt()
        }, 200)
        return
      }
      refreshPendingTimeout = null
      initClient(scope, !scope)
      getToken()
    }
    refreshPendingTimeout = setTimeout(runRefreshAttempt, 300)
  }

  function handleCredentialResponse(response) {
    var decoded = jwt_decode(response.credential)
    var profile = {
      email: decoded.email,
      family_name: decoded.family_name,
      given_name: decoded.given_name,
      name: decoded.name,
      picture: decoded.picture,
    }
    ctx.setUser(profile)
    storeLoginProfile(profile)
    localStorage.setItem('google_login_user', decoded.email)
    initClient(null, true)
    getToken()
  }

  function dispose() {
    clearTimeout(loginRefreshTimeout)
    clearTimeout(refreshPendingTimeout)
    refreshPendingTimeout = null
  }

  return {
    login: login,
    logout: logout,
    refresh: refresh,
    requestGoogleScopes: requestGoogleScopes,
    handleCredentialResponse: handleCredentialResponse,
    rememberExtraScopes: rememberExtraScopes,
    tryRefreshAccessToken: function() {
      return Promise.resolve(null)
    },
    dispose: dispose,
  }
}
