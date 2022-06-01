import axios from 'axios'
import {useState, useRef, useEffect} from 'react';
import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

import useCheckOnlineStatus from './useCheckOnlineStatus'
    
export default function useGoogleSheet(props) {
  const {tunes, pollingInterval, onLogin, onMerge} = props
  var checkOnlineStatus = useCheckOnlineStatus()
  //console.log('useGoogleSheet',props)
    var client;
  // google login
  var googleSheetId = useRef(null)
  var [loginUser, setLoginUser] = useState(null)
  var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID 
  //var [access_token, setAccess_token] = useState(null)
  var access_token = null
  var [accessToken, setAccessToken] = useState(null)
  let abcTools = useAbcTools();
  var utils = useUtils()
  var recurseLoadSheetTimeout = props.recurseLoadSheetTimeout
  

  useEffect(function() {
    console.log('load google sheet',global.window.google)
    if (global.window.google && localStorage.getItem('abc2book_lastuser')) {
      //applyGoogleWindowInit()
      initClient()
    }
  },[global.window.google])

  function getRecording(id) {
    return new Promise(function(resolve,reject) {
      console.log('get rec',id ,accessToken, access_token)
      //var useToken = accessToken ? accessToken : access_token
      //if (id) {
        //axios({
          //method: 'get',
          //url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
          //headers: {'Authorization': 'Bearer '+useToken},
        //}).then(function(postRes) {
          //resolve(postRes.data)
          ////console.log(postRes)
        //}).catch(function(e) {
          //getToken()
          //resolve()
        //})
      //}
      resolve()
    })
  }
  
  function updateRecordingTitle(recording) {
    return new Promise(function(resolve,reject) {  console.log('update title',recording.title,recording)
      var useToken = accessToken ? accessToken : access_token
      if (recording && useToken) {
          axios({
            method: 'patch',
            url: 'https://www.googleapis.com/drive/v3/files/'+recording.googleId+"?alt=json",
            data: {name: recording.title},
            headers: {'Authorization': 'Bearer '+useToken},
          }).then(function(postRes) {
            //googleSheetId.current = postRes.data.id
            console.log('updated title',postRes)
            resolve()
          }).catch(function(e) {
            resolve()
          })
      } else {
        resolve()
      }
    })
  }
  
  function createRecording(recording) {
    return new Promise(function(resolve,reject) {
      console.log('create rec',recording ,accessToken, access_token)
      var useToken = accessToken ? accessToken : access_token
      if (useToken) {
        var  data = {
          "description": "Audio recording from TuneBook App",
          "kind": "drive#file",
          "name": recording.title,
          "mimeType": "audio/wav" //"vnd.google-apps.spreadsheet"
        }
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files',
          data: data,
          headers: {'Authorization': 'Bearer '+useToken},
        }).then(function(postRes) {
          //googleSheetId.current = postRes.data.id
          console.log('created',postRes)
          updateRecording(postRes.data.id, recording.data).then(function(updated) {
            //onLogin("")
            console.log('updated',updated)
            resolve(postRes.data.id)
          }).catch(function(e) {
            //getToken()
            resolve()
          })
        })
      } else {
        resolve()
      }
    })
  }

  function updateRecording(id,data) {
    return new Promise(function(resolve,reject) {
      console.log('trigger rec update ', id,data, accessToken, access_token)
      var useToken = accessToken ? accessToken : access_token
      if (id && data && useToken) {
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
          headers: {'Authorization': 'Bearer '+useToken},
          data: data,
        }).then(function(postRes) {
          console.log('updated',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
          if (localStorage.getItem('abc2book_lastuser')) getToken()
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
  
  function deleteRecording(id) {
    return new Promise(function(resolve,reject) {
      console.log('trigger sheet delete ', id, accessToken, access_token)
      var useToken = accessToken ? accessToken : access_token
      if (id && useToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v2/files/'+id,
          headers: {'Authorization': 'Bearer '+useToken},
        }).then(function(postRes) {
          console.log('deleted',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
          if (localStorage.getItem('abc2book_lastuser')) getToken()
          resolve()
        })
      }
    })
  }
  

  function updateSheetById(id,data,callback, accessToken) {
    console.log('trigger sheet update ', id, accessToken)
    if (id && accessToken) {
      axios({
        method: 'patch',
        url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
        headers: {'Authorization': 'Bearer '+accessToken},
        data: data,
      }).then(function(postRes) {
        console.log('sheet updated',postRes.data  )
        if (callback) callback(postRes)
      }).catch(function(e) {
        if (localStorage.getItem('abc2book_lastuser')) getToken()
      })
    }
  }
 
    
  var updateSheetTimer = useRef(null)
  
  function updateSheet(delay=1000, callback) {
      var useToken = accessToken ? accessToken : access_token
      console.log('trigger sheet update',googleSheetId.current,useToken, recurseLoadSheetTimeout.current )
      //if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
      
      if (googleSheetId.current) { 
        if (updateSheetTimer.current) clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          console.log('do sheet update', tunes)
          var nowTunes = utils.loadLocalObject('bookstorage_tunes')
          updateSheetById(googleSheetId.current , abcTools.tunesToAbc(nowTunes), function() {
              //loadSheet()
              callback()
          }, useToken)
        },delay)
      }
  }
    
    function getGoogleSheetDataById(id,callback) {
      //console.log('get da',id ,accessToken, access_token)
      var useToken = accessToken ? accessToken : access_token
      if (id && useToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
          headers: {'Authorization': 'Bearer '+useToken},
        }).then(function(postRes) {
          callback(postRes.data)
          //console.log(postRes)
        }).catch(function(e) {
          if (localStorage.getItem('abc2book_lastuser')) getToken()
        })
      }
    }
    
   
    function createTuneSheet() {
      var  data = {
        "description": "Document for ABC Tune Book data",
        "kind": "drive#file",
        "name": "ABC Tune Book",
        "mimeType": "application/vnd.google-apps.document" //"vnd.google-apps.spreadsheet"
      }
      axios({
        method: 'post',
        url: 'https://www.googleapis.com/drive/v3/files',
        data: data,
        headers: {'Authorization': 'Bearer '+access_token},
      }).then(function(postRes) {
        googleSheetId.current = postRes.data.id
        updateSheetById(postRes.data.id, abcTools.tunesToAbc(tunes), function(updated) {
          onLogin("")
          //console.log('CREATED')
        }, accessToken ? accessToken : access_token).catch(function(e) {
          //getToken()
        })
      })
    }
    
    
    function doLoad() {
        getGoogleSheetDataById(googleSheetId.current, function(fullSheet) {
          //console.log('load sheet dotimeout got sheet',fullSheet.length)
          //if (recurseDelay > 0) loadSheet( recurseDelay)
          //if (forceSheet) {
            //onLogin(fullSheet)
          //} else {
            onMerge(fullSheet)
          //}
        })
    }
    
    function setupInterval() {
      //console.log('setup interval')
      if (recurseLoadSheetTimeout.current) clearInterval(recurseLoadSheetTimeout.current)
      recurseLoadSheetTimeout.current = setInterval(function() {
         //console.log('load sheet dotimeout')  
         if (!props.pauseSheetUpdates.current) doLoad()
      },props.pollingInterval > 1000 ? props.pollingInterval : 20000)
    }
    function loadSheet() {
      //console.log('load sheet')
      doLoad()
      setupInterval()
    }
    function findTuneBookInDrive() {
        var xhr = new XMLHttpRequest();
        xhr.onload = function (res) {
          if (res.target.responseText) {
            var response = JSON.parse(res.target.responseText)
            if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
              // load whole file
              googleSheetId.current = response.files[0].id
              // start polling for changes
              loadSheet(0, true)
            } else {
              // create file
              createTuneSheet()
              setupInterval()
            }
          }
        };
        //mimeType = 'application/vnd.google-apps.spreadsheet' and 
        var filter = "?q="+ encodeURIComponent("name='ABC Tune Book'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
        xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter);
        xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
        xhr.send();
    }
      
  function handleCredentialResponse(response) {
    var decoded = jwt_decode(response.credential)
    console.log('CREDS',decoded.email,decoded.family_name, decoded.given_name, decoded.name, decoded.picture, decoded)
    setLoginUser({email: decoded.email,family_name: decoded.family_name, given_name: decoded.given_name, name: decoded.name, picture: decoded.picture})
    //localStorage.setItem('abc2book_lastuser',decoded.email)
     // google login
    initClient()
    //getToken()
   
  }
  
    function initClient() {
      if (global.window.google && checkOnlineStatus()) { 
        //console.log('initclient')
        client = global.window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          prompt: '',
          // https://www.googleapis.com/auth/spreadsheets
          scope: 'https://www.googleapis.com/auth/drive.metadata.readonly \
          https://www.googleapis.com/auth/drive.file',
          callback: (tokenResponse) => {
            console.log('init', tokenResponse)
            access_token = tokenResponse.access_token
            setAccessToken(tokenResponse.access_token)
            localStorage.setItem('abc2book_lastuser',tokenResponse.scope)
            //console.log('init set token', tokenResponse.access_token)
            //client.requestAccessToken();
            
            findTuneBookInDrive()
          },
        });
        client.requestAccessToken();
      }
    } 

    function getToken() {
      //console.log('get token',client)
      //return
      if (checkOnlineStatus()) { 
        //console.log('get token real',client)
        if (client) {
          var token = client.requestAccessToken();
          
        } else {
           initClient()
        }
      }
    }
    function revokeToken() {
      clearTimeout(recurseLoadSheetTimeout)
      localStorage.setItem('abc2book_lastuser','')
      setLoginUser(null)
      setAccessToken(null)
      access_token = null;
      global.window.google.accounts.oauth2.revoke(accessToken, () => {console.log('access token revoked')});
      
    }
    
    function applyGoogleWindowInit() {
        
      global.window.onload = function () {
        global.window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: true
        });
        //window.google.accounts.id.renderButton(
          //document.getElementById("loginbuttondiv"),
          //{ theme: "outline", size: "small" }  // customization attributes
        //);
        global.window.google.accounts.id.prompt(); // also display the One Tap dialog
      }
      
      
    }
   
    
    return { applyGoogleWindowInit, updateSheet, loadSheet, initClient, getToken, revokeToken, loginUser, accessToken, setupInterval, getRecording, createRecording, updateRecording,updateRecordingTitle, deleteRecording}
    
    //mergeLoadedSheet, getGoogleSheetDataById, createTuneSheet, loadSheet, findTuneBookInDrive, handleCredentialResponse, initClient, getToken, revokeToken, googleSheetId, loginUser, access_token, accessToken,updateSheetById, 
    
}
