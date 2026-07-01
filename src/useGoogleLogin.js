import jwt_decode from "jwt-decode";
import axios from 'axios'
import {useState, useRef, useEffect} from 'react'
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes'

var gsiInitialized = false
var gsiRenderedButtonIds = {}
var GOOGLE_LOGIN_PROFILE_KEY = 'google_login_profile'

function readStoredLoginProfile() {
  try {
    var raw = localStorage.getItem(GOOGLE_LOGIN_PROFILE_KEY)
    if (!raw) return null
    var profile = JSON.parse(raw)
    return profile && profile.email ? profile : null
  } catch (e) {
    return null
  }
}

function storeLoginProfile(profile) {
  if (!profile || !profile.email) return
  localStorage.setItem(GOOGLE_LOGIN_PROFILE_KEY, JSON.stringify({
    email: profile.email,
    family_name: profile.family_name || '',
    given_name: profile.given_name || '',
    name: profile.name || profile.email,
    picture: profile.picture || '',
  }))
}

export default function useGoogleLogin({scopes, usePrompt, loginButtonId}) {
    var client = useRef(null)
    //var user = useRef(null)
    //var accessToken = useRef(null)
    const [user,setUser] = useState(function() {
      return localStorage.getItem('google_login_user') ? readStoredLoginProfile() : null
    })
    const [accessToken,setAccessToken] = useState(null)
    var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID 
    var loginRefreshTimeout = null
    var grantedExtraScopesRef = useRef([])
    var credentialHandlerRef = useRef(null)
     

    function mergeScopes(extraScopes) {
      var userInfoScopes = ['email']
      var useScopes = Array.isArray(scopes) ? scopes.slice() : userInfoScopes.slice()
      grantedExtraScopesRef.current.forEach(function(scope) {
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
        if (grantedExtraScopesRef.current.indexOf(extraScope) === -1) {
          grantedExtraScopesRef.current.push(extraScope)
        }
      })
    }

    function initClient(extraScopes) {
      //console.log("initclient")
      if (!(global.window.google && global.window.google.accounts && global.window.google.accounts.oauth2)) {
        // GSI client script not loaded yet; skip until it is available.
        return
      }
      var useScopes = mergeScopes(extraScopes)
      client.current = global.window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        prompt: '',
        scope: useScopes.join(' '),
        callback: (tokenResponse) => {
          //console.log("initclient callback set token ",tokenResponse, "expires in ",tokenResponse.expires_in )
          setAccessToken(tokenResponse)
          localStorage.setItem('google_login_user','1')
          // auto renew tokens
          if (tokenResponse.expires_in > 0) {
                clearTimeout(loginRefreshTimeout)
                loginRefreshTimeout = setTimeout(function() {
                  refresh()
                }, (tokenResponse.expires_in * 999))
          }
        },
      });
    }

    function ensureGoogleIdentityScopes(options) {
      return requestGoogleScopes(GOOGLE_IDENTITY_SCOPES, options)
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
          client_id: clientId,
          scope: useScopes.join(' '),
          callback: function(tokenResponse) {
            if (tokenResponse && tokenResponse.error) {
              reject(new Error(tokenResponse.error_description || tokenResponse.error))
              return
            }
            setAccessToken(tokenResponse)
            localStorage.setItem('google_login_user','1')
            if (tokenResponse.expires_in > 0) {
              clearTimeout(loginRefreshTimeout)
              loginRefreshTimeout = setTimeout(function() {
                refresh()
              }, (tokenResponse.expires_in * 999))
            }
            resolve(tokenResponse)
          },
        })
        client.current.requestAccessToken({ prompt: prompt })
      })
    }
     
    function getToken() {
      //console.log("gettoken",client.current)
      if (client.current) client.current.requestAccessToken();
    }
    
    function revokeToken() {
      //console.log("revoke")
      setUser(null)
      try {
        global.window.google.accounts.oauth2.revoke(accessToken.current, () => {console.log('access token revoked')});
      } catch (e) {}
      setAccessToken(null)
      localStorage.setItem('google_login_user','')
      localStorage.removeItem(GOOGLE_LOGIN_PROFILE_KEY)
    }
    
    function login() {
      //console.log("login")
      initClient()
      getToken()
    }
    
    function logout() {
      return revokeToken()
    }
    
    function refresh(scope) {
      //console.log("refresh",localStorage.getItem('google_login_user'))
      if (localStorage.getItem('google_login_user')) {
          setTimeout(function() {
            initClient(scope)
            getToken()
          },1000)
        }
    }
    
    function handleCredentialResponse(response) {
      //console.log("handle CREDS")
      var decoded = jwt_decode(response.credential)
      //console.log("CREDS",decoded.email,decoded.family_name, decoded.given_name, decoded.name, decoded.picture, decoded)
      var profile = {email: decoded.email,family_name: decoded.family_name, given_name: decoded.given_name, name: decoded.name, picture: decoded.picture}
      setUser(profile)
      storeLoginProfile(profile)
      localStorage.setItem('google_login_user',decoded.email)
       //application/vnd.google-apps.spreadsheet
      initClient()
      getToken()
    }

    credentialHandlerRef.current = handleCredentialResponse
    
    function breakLoginToken() {
		//console.log('check', 'state', accessToken)
		return new Promise(function(resolve,reject) {
			var t = accessToken
			if (accessToken && accessToken.access_token) {
				t.access_token = 'broken'
				setAccessToken(t)
				console.log('break token',t) 
			}	
			//console.log('check use ' , t)
			//loadCurrentUser(t).then(function(res) {
				//if (res && res.email) {
					//console.log('loaded',res)
					//resolve(res)
				//} else {
					//console.log('failed loaded',res)
					//initClient()
					//getToken()
					//resolve()
				//}
				
			//})
		})
	}
    
    function loadCurrentUser(accessToken) {
        //console.log('load current',accessToken)
        return new Promise(function(resolve,reject) {
          if (accessToken) { 
            var url = 'https://www.googleapis.com/oauth2/v3/userinfo?access_token='+accessToken.access_token
            axios({
              method: 'get',
              url: url,
              headers: {'Authorization': 'Bearer '+accessToken.access_token},
            }).then(function(postRes) {
              //console.log(postRes)
              resolve(postRes.data)
              
            }).catch(function(e) {
              //getToken()
              //refresh()
              console.log(e)
              resolve()
            })
          } else {
            //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
             console.log('no token given ')
              resolve()
          }
        })
    }
    //?access_token='+accessToken.access_token
    function loadUserImage(accessToken) {
        // The profile picture is a public googleusercontent.com URL that is
        // rendered directly via an <img> tag. Fetching it with axios and an
        // Authorization header triggers a CORS preflight that strict browsers
        // (eg. Brave) reject, and the response body is never used, so we skip
        // the network request entirely.
        return Promise.resolve()
    }
    
    
    
    useEffect(function() {
      var cancelled = false
      var pollTimeout = null

      function initGoogleIdentity() {
        // The GSI client script is loaded async, so window.google may not be
        // ready when this runs (or when window.onload fires). Poll until it is.
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
            }
          });
          gsiInitialized = true
        }
        if (loginButtonId && !gsiRenderedButtonIds[loginButtonId]) {
          var buttonEl = document.getElementById(loginButtonId)
          if (buttonEl) {
            window.google.accounts.id.renderButton(
              buttonEl,
              { theme: "outline", size: "large" }  // customization attributes
            );
            gsiRenderedButtonIds[loginButtonId] = true
          }
        }
        if (usePrompt) {
          // also display the One Tap dialog
          window.google.accounts.id.prompt() 
        }
        refresh()
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
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize Google Identity once on mount
    },[])
    
    useEffect(function() {
      if (!accessToken) return
      loadCurrentUser(accessToken).then(function(loadedUser) {
          // userinfo needs email/profile scopes; keep JWT profile when unavailable.
          if (loadedUser && loadedUser.email) {
            setUser(loadedUser)
            storeLoginProfile(loadedUser)
          }
      })
    },[accessToken])
    
    
    
    return {user, token: accessToken, login, logout, refresh, requestGoogleScopes, ensureGoogleIdentityScopes, loadUserImage, breakLoginToken}
}
