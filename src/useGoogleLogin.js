import axios from 'axios'
import { useState, useRef, useEffect } from 'react'
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import {
  AUTH_MODE_PROBE_WAIT_MS,
} from './authResolverClient'
import {
  isMediaProxyConfigured,
} from './mediaProxyClient'
import {
  getAuthResolverBase,
  waitForAuthBase,
  ensureMediaResolverHealthSettingsListener,
  probeMediaResolverHealth,
} from './mediaResolverHealthStore'
import { toast } from 'react-toastify'
import {
  createTokenClientController,
  readStoredLoginProfile,
} from './googleLoginTokenClient'
import { createOAuthBffController } from './googleLoginOAuthBff'
import {
  notifyAccessTokenUpdated,
  setTryRefreshAccessTokenHandler,
  tryRefreshAccessToken as registryTryRefresh,
} from './googleLoginRefreshRegistry'

var gsiInitialized = false
var gsiRenderedButtonIds = {}

export { tryRefreshAccessToken } from './googleLoginRefreshRegistry'

export default function useGoogleLogin({ scopes, usePrompt, loginButtonId }) {
  const [user, setUser] = useState(function() {
    return localStorage.getItem('google_login_user') ? readStoredLoginProfile() : null
  })
  const [accessToken, setAccessToken] = useState(null)
  const [authMode, setAuthMode] = useState('pending')
  const [authBase, setAuthBase] = useState('')

  var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID
  var accessTokenRef = useRef(null)
  var authModeRef = useRef('pending')
  var authBaseRef = useRef('')
  var tokenControllerRef = useRef(null)
  var oauthControllerRef = useRef(null)
  var activeControllerRef = useRef(null)
  var credentialHandlerRef = useRef(null)
  var modeReadyRef = useRef(null)

  accessTokenRef.current = accessToken
  authModeRef.current = authMode
  authBaseRef.current = authBase

  function ensureTokenController() {
    if (!tokenControllerRef.current) {
      tokenControllerRef.current = createTokenClientController({
        clientId: clientId,
        scopes: scopes,
        getAccessToken: function() { return accessTokenRef.current },
        setAccessToken: setAccessToken,
        setUser: setUser,
        onTokenUpdated: notifyAccessTokenUpdated,
      })
    }
    return tokenControllerRef.current
  }

  function ensureOauthController() {
    if (!oauthControllerRef.current) {
      oauthControllerRef.current = createOAuthBffController({
        clientId: clientId,
        scopes: scopes,
        getAuthBase: function() { return authBaseRef.current || getAuthResolverBase() },
        setAccessToken: setAccessToken,
        setUser: setUser,
        onTokenUpdated: notifyAccessTokenUpdated,
        onFallbackToTokenClient: function() {
          // Keep current access token; switch renewals to Token Client popup path.
          var tokenCtrl = ensureTokenController()
          activeControllerRef.current = tokenCtrl
          authModeRef.current = 'token'
          setAuthMode('token')
          if (localStorage.getItem('google_login_user')) {
            tokenCtrl.refresh()
          }
        },
      })
    }
    return oauthControllerRef.current
  }

  function selectController(mode, base) {
    var nextBase = base || ''
    // Avoid setState on every Login click when mode/base are already known —
    // re-renders during the click stack can make GIS report a disposed client.
    if (authModeRef.current !== mode) {
      authModeRef.current = mode
      setAuthMode(mode)
    }
    if (authBaseRef.current !== nextBase) {
      authBaseRef.current = nextBase
      setAuthBase(nextBase)
    }
    if (mode === 'oauth' && nextBase) {
      activeControllerRef.current = ensureOauthController()
    } else {
      activeControllerRef.current = ensureTokenController()
    }
    return activeControllerRef.current
  }

  function waitForMode() {
    if (authModeRef.current !== 'pending') {
      return Promise.resolve(activeControllerRef.current || ensureTokenController())
    }
    if (!modeReadyRef.current) {
      modeReadyRef.current = waitForAuthBase(AUTH_MODE_PROBE_WAIT_MS).then(function(base) {
        return selectController(base ? 'oauth' : 'token', base)
      })
    }
    return modeReadyRef.current
  }

  /** Interactive Login uses Token Client (empty prompt). With an existing Google
   * grant this usually shows at most the account chooser — not the OAuth code
   * "confirm / Drive permission" steps. BFF remains for silent resume. */
  function login() {
    var controller = ensureTokenController()
    activeControllerRef.current = controller
    try {
      return Promise.resolve(controller.login()).catch(function(err) {
        console.warn('Google login failed', err)
        var message = (err && err.message) ? String(err.message) : 'Google login failed'
        if (/still loading/i.test(message)) {
          toast.info('Google sign-in is still loading. Try again in a moment.')
        } else if (/interrupted|pop-up blocked|allow pop-ups/i.test(message)) {
          toast.info(message)
        } else if (!/cancel|closed|popup_closed|disposed|sign-in cancelled/i.test(message)) {
          toast.error(message)
        }
      })
    } catch (err) {
      console.warn('Google login failed', err)
      var message = (err && err.message) ? String(err.message) : 'Google login failed'
      if (!/cancel|closed|popup_closed|disposed|sign-in cancelled/i.test(message)) {
        toast.error(message)
      }
      return Promise.resolve()
    }
  }

  function logout() {
    var controller = activeControllerRef.current || ensureTokenController()
    return Promise.resolve(controller.logout())
  }

  function refresh(scope) {
    return waitForMode().then(function(controller) {
      return controller.refresh(scope)
    })
  }

  function requestGoogleScopes(extraScopes, options) {
    return waitForMode().then(function(controller) {
      return controller.requestGoogleScopes(extraScopes, options)
    })
  }

  function ensureGoogleIdentityScopes(options) {
    return requestGoogleScopes(GOOGLE_IDENTITY_SCOPES, options)
  }

  function tryRefreshAccessToken() {
    var controller = activeControllerRef.current
    if (!controller || typeof controller.tryRefreshAccessToken !== 'function') {
      return Promise.resolve(null)
    }
    return controller.tryRefreshAccessToken()
  }

  credentialHandlerRef.current = function(response) {
    waitForMode().then(function(controller) {
      if (controller.handleCredentialResponse) {
        controller.handleCredentialResponse(response)
      }
    })
  }

  function breakLoginToken() {
    return new Promise(function(resolve) {
      var t = accessTokenRef.current
      if (t && t.access_token) {
        var broken = Object.assign({}, t, { access_token: 'broken' })
        setAccessToken(broken)
        console.log('break token', broken)
      }
      resolve()
    })
  }

  function loadCurrentUser(token) {
    return new Promise(function(resolve) {
      if (token && token.access_token) {
        var url = 'https://www.googleapis.com/oauth2/v3/userinfo?access_token=' + token.access_token
        axios({
          method: 'get',
          url: url,
          headers: { Authorization: 'Bearer ' + token.access_token },
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
          console.log(e)
          resolve()
        })
      } else {
        console.log('no token given ')
        resolve()
      }
    })
  }

  function loadUserImage() {
    return Promise.resolve()
  }

  useEffect(function() {
    setTryRefreshAccessTokenHandler(function() {
      var controller = activeControllerRef.current
      if (!controller || typeof controller.tryRefreshAccessToken !== 'function') {
        return Promise.resolve(null)
      }
      return controller.tryRefreshAccessToken()
    })
    return function() {
      setTryRefreshAccessTokenHandler(null)
    }
  }, [])

  useEffect(function() {
    var cancelled = false
    var pollTimeout = null

    ensureMediaResolverHealthSettingsListener()
    // Start probe early so auth mode can settle before/during GSI load.
    probeMediaResolverHealth(null)

    // Select auth mode from the probe without waiting for GSI. Login can then
    // open a GIS popup on the click stack once the script is present.
    waitForAuthBase(AUTH_MODE_PROBE_WAIT_MS).then(function(base) {
      if (cancelled) return
      // Upgrade a speculative token selection when an oauth base appears.
      if (authModeRef.current === 'pending' || (base && authModeRef.current === 'token')) {
        selectController(base ? 'oauth' : 'token', base)
      }
    })

    function finishModeAndResume() {
      return waitForAuthBase(AUTH_MODE_PROBE_WAIT_MS).then(function(base) {
        if (cancelled) return null
        var controller = selectController(base ? 'oauth' : 'token', base)
        if (base && controller.resumeSession) {
          // Silent BFF resume only. Do not fall back to Token Client popup on
          // mount when an OAuth resolver is available — user can click Login.
          return controller.resumeSession()
        }
        if (!base && localStorage.getItem('google_login_user')) {
          controller.refresh()
        }
        return null
      })
    }

    function initGoogleIdentity() {
      if (cancelled) return
      if (!(window.google && window.google.accounts && window.google.accounts.id)) {
        pollTimeout = setTimeout(initGoogleIdentity, 100)
        return
      }
      if (!gsiInitialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: function(response) {
            if (credentialHandlerRef.current) credentialHandlerRef.current(response)
          },
        })
        gsiInitialized = true
      }
      if (loginButtonId && !gsiRenderedButtonIds[loginButtonId]) {
        var buttonEl = document.getElementById(loginButtonId)
        if (buttonEl) {
          window.google.accounts.id.renderButton(
            buttonEl,
            { theme: 'outline', size: 'large' }
          )
          gsiRenderedButtonIds[loginButtonId] = true
        }
      }
      if (usePrompt) {
        window.google.accounts.id.prompt()
      }

      // If no media proxy configured, skip probe wait and use Token Client immediately.
      if (!isMediaProxyConfigured()) {
        selectController('token', '')
        if (localStorage.getItem('google_login_user')) {
          ensureTokenController().refresh()
        }
        return
      }

      finishModeAndResume()
    }

    if (document.readyState === 'complete') {
      initGoogleIdentity()
    } else {
      window.addEventListener('load', initGoogleIdentity)
    }

    return function() {
      cancelled = true
      if (pollTimeout) clearTimeout(pollTimeout)
      window.removeEventListener('load', initGoogleIdentity)
      // Clear renew timers only. Do not drop controller instances here —
      // React Strict Mode remounts this effect, and disposing GIS clients
      // mid-session makes the next Login click fail with "disposed".
      if (tokenControllerRef.current && tokenControllerRef.current.dispose) {
        tokenControllerRef.current.dispose()
      }
      if (oauthControllerRef.current && oauthControllerRef.current.dispose) {
        oauthControllerRef.current.dispose()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize once on mount
  }, [])

  useEffect(function() {
    if (!accessToken) return
    loadCurrentUser(accessToken).then(function(loadedUser) {
      if (loadedUser && loadedUser.email) {
        setUser(loadedUser)
        try {
          localStorage.setItem('google_login_profile', JSON.stringify({
            email: loadedUser.email,
            family_name: loadedUser.family_name || '',
            given_name: loadedUser.given_name || '',
            name: loadedUser.name || loadedUser.email,
            picture: loadedUser.picture || '',
          }))
        } catch (e) {}
      }
    })
  }, [accessToken])

  return {
    user: user,
    token: accessToken,
    login: login,
    logout: logout,
    refresh: refresh,
    requestGoogleScopes: requestGoogleScopes,
    ensureGoogleIdentityScopes: ensureGoogleIdentityScopes,
    loadUserImage: loadUserImage,
    breakLoginToken: breakLoginToken,
    tryRefreshAccessToken: tryRefreshAccessToken,
    authMode: authMode,
    authBase: authBase,
  }
}

// Re-export registry helper for non-hook callers (same as named export above).
export function tryRefreshAccessTokenFromRegistry() {
  return registryTryRefresh()
}
