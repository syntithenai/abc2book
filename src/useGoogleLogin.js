import axios from 'axios'
import { useState, useRef, useEffect, useCallback } from 'react'
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'
import {
  AUTH_MODE_PROBE_WAIT_MS,
  LOGIN_AUTH_WAIT_MS,
  pickAuthResolverBaseForLogin,
  readStoredAuthBase,
  readStoredAuthSessionId,
  selectAuthModeForBase,
  selectLoginAuthMode,
} from './authResolverClient'
import {
  isMediaProxyConfigured,
} from './mediaProxyClient'
import {
  getAuthResolverBase,
  getMediaResolverHealthState,
  waitForAuthBase,
  ensureMediaResolverHealthSettingsListener,
  probeMediaResolverHealth,
} from './mediaResolverHealthStore'
import { toast } from 'react-toastify'
import { isAndroidApp, isCapacitorNative } from './platformUtils'
import { isNavigatorOffline, OFFLINE_LOGIN_MESSAGE } from './offlineNetwork'
import {
  clearAndroidOAuthResumeGuard,
  clearAndroidOAuthSession,
  ensureAndroidOAuthDeepLinkListener,
  hasPendingAndroidOAuthCallback,
  isAndroidOAuthResuming,
  markAndroidOAuthResuming,
} from './androidGoogleAuth'
import { getGoogleOAuthRedirectUri } from './googleOAuthRedirectUri'
import {
  createTokenClientController,
  readStoredLoginProfile,
} from './googleLoginTokenClient'
import { createOAuthBffController } from './googleLoginOAuthBff'
import { tokenHasFreshAccess } from './googleLoginTokenAdapter'
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

  /** Native builds must use OAuth BFF — on-device code exchange needs a client_secret. */
  function mustUseOAuthBffLogin() {
    return isCapacitorNative() && isMediaProxyConfigured()
  }

  /** OAuth BFF mode requires a stored session; otherwise stay on Token Client for silent GIS renew. */
  function authModeForBase(base) {
    return selectAuthModeForBase(base, { mustUseOAuthBff: mustUseOAuthBffLogin() })
  }

  /** Silent GIS Token Client renew after BFF resume — uses login_hint to avoid account picker. */
  function tryMountSilentTokenRefresh() {
    if (isAndroidApp()) return
    if (!localStorage.getItem('google_login_user')) return
    var current = accessTokenRef.current
    var expiresAt = current && current.expires_at ? Number(current.expires_at) : 0
    if (current && current.access_token && expiresAt > Date.now() + 60000) return
    ensureTokenController().refresh()
  }

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
        getAuthBase: function() {
          return getAuthResolverBase() || authBaseRef.current || readStoredAuthBase()
        },
        getAccessToken: function() { return accessTokenRef.current },
        setAccessToken: setAccessToken,
        setUser: setUser,
        onTokenUpdated: notifyAccessTokenUpdated,
        onAuthBaseResolved: function(base) {
          if (base) selectController('oauth', base)
        },
        onFallbackToTokenClient: function() {
          var current = accessTokenRef.current
          // Keep the existing bearer when it is still fresh; opening a GIS popup
          // mid-session (e.g. during audio generation) feels like a logout.
          if (tokenHasFreshAccess(current, 60000)) return
          if (isAndroidApp()) return
          var tokenCtrl = ensureTokenController()
          activeControllerRef.current = tokenCtrl
          if (authModeRef.current === 'oauth') {
            authModeRef.current = 'token'
            setAuthMode('token')
          }
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
    if (mode === 'oauth') {
      activeControllerRef.current = ensureOauthController()
    } else {
      activeControllerRef.current = ensureTokenController()
    }
    return activeControllerRef.current
  }

  function waitForMode() {
    if (authModeRef.current !== 'pending') {
      if (mustUseOAuthBffLogin()) {
        return Promise.resolve(activeControllerRef.current || ensureOauthController())
      }
      return Promise.resolve(activeControllerRef.current || ensureTokenController())
    }
    if (!modeReadyRef.current) {
      modeReadyRef.current = waitForAuthBase(
        mustUseOAuthBffLogin() ? LOGIN_AUTH_WAIT_MS : AUTH_MODE_PROBE_WAIT_MS,
        { untilProbeSettled: mustUseOAuthBffLogin() }
      ).then(function(base) {
        if (mustUseOAuthBffLogin()) {
          return selectController('oauth', base)
        }
        return selectController(authModeForBase(base), base)
      })
    }
    return modeReadyRef.current
  }

  function finishAndroidOAuthFromDeepLink(codePayload) {
    if (!codePayload || !codePayload.code) return Promise.resolve()
    probeMediaResolverHealth(null, { force: true })
    return waitForAuthBase(LOGIN_AUTH_WAIT_MS, { untilProbeSettled: true }).then(function(base) {
      var controller = selectController('oauth', base)
      if (!controller.completeAuthorizationCode) {
        return Promise.reject(new Error('OAuth login is not ready'))
      }
      return controller.completeAuthorizationCode(codePayload).catch(function(err) {
        console.warn('Google login failed', err)
        var message = (err && err.message) ? String(err.message) : 'Google login failed'
        if (err && err.body) {
          if (err.body.hint) message = String(err.body.hint)
          else if (err.body.detail) message = String(err.body.detail)
        }
        if (!/cancel|closed|popup_closed|disposed|sign-in cancelled/i.test(message)) {
          toast.error(message)
        }
      })
    })
  }

  /** Prefer BFF code login when an oauthBff resolver is available so renewals
   * stay silent. Fall back to Token Client when no BFF base is known. */
  function login() {
    if (isNavigatorOffline()) {
      toast.info(OFFLINE_LOGIN_MESSAGE)
      return Promise.resolve()
    }
    clearAndroidOAuthResumeGuard()
    if (!hasPendingAndroidOAuthCallback()) {
      clearAndroidOAuthSession()
    }
    // Start resolver probe immediately so login waits on a settled oauthBff base
    // (Android defers the mount-time probe to avoid ANR on cold start).
    probeMediaResolverHealth(null, { force: true })

    if (isAndroidApp()) {
      toast.info('Opening Google sign-in…', { autoClose: 2500 })
    }

    function runWithController(controller) {
      activeControllerRef.current = controller
      try {
        return Promise.resolve(controller.login()).catch(function(err) {
          console.warn('Google login failed', err)
          var message = (err && err.message) ? String(err.message) : 'Google login failed'
          if (err && err.body) {
            if (err.body.hint) message = String(err.body.hint)
            else if (err.body.detail) message = String(err.body.detail)
          }
          if (/still loading/i.test(message)) {
            toast.info('Google sign-in is still loading. Try again in a moment.')
          } else if (/redirect_uri_mismatch|redirect uri mismatch/i.test(message)) {
            toast.error(
              'Google redirect URI mismatch. In Google Cloud Console → OAuth client → '
              + 'Authorized redirect URIs, add exactly: ' + getGoogleOAuthRedirectUri()
            )
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

    if (mustUseOAuthBffLogin()) {
      // Android: open Google immediately — native builds always have oauthBff
      // resolver fallbacks (peppertrees / cloud) without waiting on /health.
      if (isAndroidApp()) {
        var health = getMediaResolverHealthState()
        var probed = health && health.status && health.status.candidates
          ? health.status.candidates : []
        var androidBase = pickAuthResolverBaseForLogin(probed)
          || authBaseRef.current || getAuthResolverBase() || readStoredAuthBase()
        return runWithController(selectController('oauth', androidBase))
      }
      return waitForAuthBase(LOGIN_AUTH_WAIT_MS, { untilProbeSettled: true }).then(function(base) {
        return runWithController(selectController('oauth', base))
      })
    }

    var knownBase = authBaseRef.current || getAuthResolverBase()
    var loginMode = selectLoginAuthMode({
      knownBase: knownBase,
      authMode: authModeRef.current,
    })
    // Explicit Login must use BFF whenever a resolver is known, even if this
    // browser is currently on Token Client. That is how silent refresh starts.
    if (loginMode === 'oauth') {
      return runWithController(selectController('oauth', knownBase))
    }
    if (loginMode === 'token') {
      return runWithController(ensureTokenController())
    }
    // Mode still pending: wait briefly for oauthBff probe, then pick controller.
    return waitForAuthBase(AUTH_MODE_PROBE_WAIT_MS).then(function(base) {
      var controller = selectController(base ? 'oauth' : 'token', base)
      return runWithController(controller)
    })
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

  var stableRequestGoogleScopes = useCallback(function(extraScopes, options) {
    return requestGoogleScopes(extraScopes, options)
  // waitForMode uses refs; stable across renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          resolve()
        })
      } else {
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
    if (!isAndroidApp()) return

    ensureAndroidOAuthDeepLinkListener(function(payload, err) {
      if (err) {
        console.warn('Google OAuth deep link failed', err)
        var message = (err && err.message) ? String(err.message) : 'Google login failed'
        if (!/cancel|closed|sign-in cancelled/i.test(message)) {
          toast.error(message)
        }
        return
      }
      finishAndroidOAuthFromDeepLink(payload)
    })

    if (!hasPendingAndroidOAuthCallback()) return
    if (isAndroidOAuthResuming()) return
    markAndroidOAuthResuming()
    probeMediaResolverHealth(null, { force: true })
    login().finally(function() {
      clearAndroidOAuthResumeGuard()
    })
  // Resume OAuth after Google redirects back into the WebView — run once on load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(function() {
    var cancelled = false
    var pollTimeout = null

    ensureMediaResolverHealthSettingsListener()
    // Defer resolver probe on Android so first paint is not blocked (reduces ANR risk).
    if (isAndroidApp()) {
      setTimeout(function() { probeMediaResolverHealth(null) }, 6000)
    } else {
      probeMediaResolverHealth(null)
    }

    // Select auth mode from the probe without waiting for GSI. Login can then
    // open a GIS popup on the click stack once the script is present.
    waitForAuthBase(mustUseOAuthBffLogin() ? LOGIN_AUTH_WAIT_MS : AUTH_MODE_PROBE_WAIT_MS, {
      untilProbeSettled: mustUseOAuthBffLogin(),
    }).then(function(base) {
      if (cancelled) return
      // Upgrade a speculative token selection when an oauth base appears.
      if (authModeRef.current === 'pending' || (base && authModeRef.current === 'token')) {
        if (mustUseOAuthBffLogin()) {
          selectController('oauth', base)
        } else {
          selectController(authModeForBase(base), base)
        }
      }
    })

    function finishAccessTokenRestore() {
      function afterBffResume() {
        if (!cancelled) tryMountSilentTokenRefresh()
      }

      var sessionId = readStoredAuthSessionId()
      var base = readStoredAuthBase() || getAuthResolverBase() || authBaseRef.current
      if (sessionId && base) {
        var oauthCtrl = selectController('oauth', base)
        if (oauthCtrl.resumeSession) {
          return oauthCtrl.resumeSession().then(function() {
            afterBffResume()
            return null
          })
        }
      }

      tryMountSilentTokenRefresh()
      return Promise.resolve(null)
    }

    function finishModeAndResume() {
      if (cancelled) return Promise.resolve(null)
      if (!localStorage.getItem('google_login_user')) return Promise.resolve(null)

      var storedBase = readStoredAuthBase()
      var storedSession = readStoredAuthSessionId()
      if (storedBase && storedSession) {
        return finishAccessTokenRestore()
      }

      return waitForAuthBase(
        mustUseOAuthBffLogin() ? LOGIN_AUTH_WAIT_MS : AUTH_MODE_PROBE_WAIT_MS,
        { untilProbeSettled: mustUseOAuthBffLogin() }
      ).then(function(base) {
        if (cancelled) return null
        var mode = mustUseOAuthBffLogin() ? 'oauth' : authModeForBase(base)
        selectController(mode, base)
        return finishAccessTokenRestore()
      })
    }

    function initGoogleIdentity() {
      if (cancelled) return
      if (isAndroidApp()) {
        waitForAuthBase(LOGIN_AUTH_WAIT_MS, { untilProbeSettled: true }).then(function(base) {
          if (cancelled) return
          selectController('oauth', base)
          finishModeAndResume()
        })
        return
      }
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
        if (!cancelled && localStorage.getItem('google_login_user')) {
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
    requestGoogleScopes: stableRequestGoogleScopes,
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
