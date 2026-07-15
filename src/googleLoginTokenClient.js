import jwt_decode from 'jwt-decode'
import { normalizeToTokenResponse } from './googleLoginTokenAdapter'

var GOOGLE_LOGIN_PROFILE_KEY = 'google_login_profile'

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
}

export function clearLoginProfile() {
  try {
    localStorage.removeItem(GOOGLE_LOGIN_PROFILE_KEY)
  } catch (e) {}
}

/**
 * Exact Token Client login path (GIS initTokenClient). Behavior matches the
 * historical useGoogleLogin implementation, including hourly popup renew.
 */
export function createTokenClientController(ctx) {
  var client = { current: null }
  var loginRefreshTimeout = null
  var grantedExtraScopes = []

  function mergeScopes(extraScopes) {
    var userInfoScopes = ['email']
    var useScopes = Array.isArray(ctx.scopes) ? ctx.scopes.slice() : userInfoScopes.slice()
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
      refresh()
    }, (tokenResponse.expires_in * 999))
  }

  function applyToken(tokenResponse) {
    var normalized = normalizeToTokenResponse(tokenResponse) || tokenResponse
    ctx.setAccessToken(normalized)
    localStorage.setItem('google_login_user', '1')
    scheduleRenew(normalized)
    return normalized
  }

  function initClient(extraScopes) {
    if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
      return
    }
    var useScopes = mergeScopes(extraScopes)
    client.current = global.window.google.accounts.oauth2.initTokenClient({
      client_id: ctx.clientId,
      prompt: '',
      scope: useScopes.join(' '),
      callback: function(tokenResponse) {
        applyToken(tokenResponse)
      },
    })
  }

  function getToken() {
    if (client.current) client.current.requestAccessToken()
  }

  function requestGoogleScopes(extraScopes, options) {
    var prompt = (options && options.forceConsent) ? 'consent' : ''
    return new Promise(function(resolve, reject) {
      if (!localStorage.getItem('google_login_user')) {
        reject(new Error('Not logged in'))
        return
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
    initClient()
    getToken()
  }

  function logout() {
    ctx.setUser(null)
    try {
      var token = ctx.getAccessToken && ctx.getAccessToken()
      var raw = token && token.access_token
      if (raw && global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2) {
        global.window.google.accounts.oauth2.revoke(raw, function() {})
      }
    } catch (e) {}
    ctx.setAccessToken(null)
    localStorage.setItem('google_login_user', '')
    clearLoginProfile()
    clearTimeout(loginRefreshTimeout)
  }

  function refresh(scope) {
    if (localStorage.getItem('google_login_user')) {
      setTimeout(function() {
        initClient(scope)
        getToken()
      }, 1000)
    }
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
    initClient()
    getToken()
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
    tryRefreshAccessToken: function() {
      return Promise.resolve(null)
    },
    dispose: dispose,
  }
}
