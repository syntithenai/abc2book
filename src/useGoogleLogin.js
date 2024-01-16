import jwt_decode from "jwt-decode";
import axios from 'axios'
import {useState, useRef, useEffect} from 'react'

export default function useGoogleLogin({scopes, usePrompt, loginButtonId}) {
    var client = useRef(null)
    //var user = useRef(null)
    //var accessToken = useRef(null)
    const [user,setUser] = useState(null)
    const [accessToken,setAccessToken] = useState(null)
    var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID 
    var loginRefreshTimeout = null
     

    function initClient(extraScopes) {
      //console.log("initclient")
      var userInfoScopes = ['email'] //, 'profile', 'https://www.googleapis.com/auth/userinfo.profile', 'openid', 'https://www.googleapis.com/auth/userinfo.email']
      var useScopes = Array.isArray(scopes) ? scopes :  userInfoScopes
      if (Array.isArray(extraScopes)) {
        extraScopes.forEach(function(extraScope) {
          useScopes.push(extraScope)
        })
      }
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
      setUser({email: decoded.email,family_name: decoded.family_name, given_name: decoded.given_name, name: decoded.name, picture: decoded.picture})
      localStorage.setItem('google_login_user',decoded.email)
       //application/vnd.google-apps.spreadsheet
      initClient()
      getToken()
    } 
    
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
        //console.log('load user image',accessToken, user)
        return new Promise(function(resolve,reject) {
          if (accessToken && user && user.picture) { 
            var url = user.picture 
            axios({
              method: 'get',
              url: url,
              headers: {'Authorization': 'Bearer '+accessToken.access_token},
            }).then(function(postRes) {
              //console.log('load user image',postRes)
              resolve(postRes.data)
              
            }).catch(function(e) {
              //getToken()
              //refresh()
              console.log(e)
              resolve()
            })
          } else {
            //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
            resolve()
          }
        })
    }
    
    
    
    useEffect(function() {
      window.onload = function () {
        //console.log('window onload',clientId)
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse
        });
        if (loginButtonId) {
          window.google.accounts.id.renderButton(
            document.getElementById(loginButtonId),
            { theme: "outline", size: "large" }  // customization attributes
          );
        }
        if (usePrompt) {
          // also display the One Tap dialog
          window.google.accounts.id.prompt() 
        }
        refresh()
      }
    },[])
    
    useEffect(function() {
      loadCurrentUser(accessToken).then(function(user) {
          //console.log("loaded user",user)
          setUser(user)
          
      })
    },[accessToken])
    
    
    
    return {user,token: accessToken, login, logout, refresh, loadUserImage, breakLoginToken}
}
