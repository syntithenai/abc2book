import axios from 'axios'
import {useState, useRef} from 'react';
import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

    
export default function useGoogleSheet(props) {
  const {tunes, pollingInterval, onLogin, onMerge} = props
  console.log('useGoogleSheet',props)
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

  function updateSheetById(id,data,callback, accessToken) {
    //console.log('trigger sheet update ', id,data, accessToken)
    if (id && data) {
      axios({
        method: 'patch',
        url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
        headers: {'Authorization': 'Bearer '+accessToken},
        data: data,
      }).then(function(postRes) {
        //console.log('updated',postRes.data  )
        if (callback) callback(postRes)
      }).catch(function(e) {
        getToken()
      })
    }
  }
 
    
  var updateSheetTimer = useRef(null)
  
  function updateSheet(delay=1000, callback) {
      //console.log('trigger sheet update',recurseLoadSheetTimeout.current )
      //if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
      
      if (googleSheetId.current) { 
        if (updateSheetTimer.current) clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          //console.log('do sheet update', tunebook)
          updateSheetById(googleSheetId.current , abcTools.tunesToAbc(tunes), function() {
              //loadSheet()
              callback()
          }, accessToken ? accessToken : access_token)
        },delay)
      }
  }
    
    function getGoogleSheetDataById(id,callback) {
      //console.log('get da',id ,accessToken, access_token)
      var useToken = accessToken ? accessToken : access_token
      if (id) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
          headers: {'Authorization': 'Bearer '+useToken},
        }).then(function(postRes) {
          callback(postRes.data)
          //console.log(postRes)
        }).catch(function(e) {
          getToken()
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
        updateSheetById(postRes.data.id, {abc: abcTools.tunesToAbc(tunes)}, function(updated) {
          onLogin("")
          //console.log('CREATED')
        }).catch(function(e) {
          getToken()
        })
      })
    }
    
    
    function doLoad() {
        getGoogleSheetDataById(googleSheetId.current, function(fullSheet) {
          console.log('load sheet dotimeout got sheet',fullSheet.length)
          //if (recurseDelay > 0) loadSheet( recurseDelay)
          //if (forceSheet) {
            //onLogin(fullSheet)
          //} else {
            onMerge(fullSheet)
          //}
        })
    }
    
    function setupInterval() {
      console.log('setup interval')
      if (recurseLoadSheetTimeout.current) clearInterval(recurseLoadSheetTimeout.current)
      recurseLoadSheetTimeout.current = setInterval(function() {
         console.log('load sheet dotimeout')  
         if (!props.pauseSheetUpdates.current) doLoad()
      },props.pollingInterval > 1000 ? props.pollingInterval : 10000)
    }
    function loadSheet() {
      console.log('load sheet')
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
    //console.log(decoded.email,decoded.family_name, decoded.given_name, decoded.name, decoded.picture, decoded)
    setLoginUser({email: decoded.email,family_name: decoded.family_name, given_name: decoded.given_name, name: decoded.name, picture: decoded.picture})
     // google login
    initClient()
    getToken()
   
  }
  
    function initClient() {
      //console.log('initclient')
      client = global.window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        prompt: '',
        // https://www.googleapis.com/auth/spreadsheets
        scope: 'https://www.googleapis.com/auth/drive.metadata.readonly \
        https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
          //console.log('init', tokenResponse)
          access_token = tokenResponse.access_token
          setAccessToken(tokenResponse.access_token)
          //console.log('init set token', tokenResponse.access_token)
          findTuneBookInDrive()
        },
      });
    } 

    function getToken() {
      console.log('get token',client)
      if (client) {
        client.requestAccessToken();
      } else {
         initClient()
      }
    }
    function revokeToken() {
      clearTimeout(recurseLoadSheetTimeout)
      setLoginUser(null)
      global.window.google.accounts.oauth2.revoke(accessToken, () => {console.log('access token revoked')});
      setAccessToken(null)
      access_token = null;
      
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
   
    
    return { applyGoogleWindowInit, updateSheet, loadSheet, initClient, getToken, revokeToken, loginUser, accessToken, setupInterval}
    
    //mergeLoadedSheet, getGoogleSheetDataById, createTuneSheet, loadSheet, findTuneBookInDrive, handleCredentialResponse, initClient, getToken, revokeToken, googleSheetId, loginUser, access_token, accessToken,updateSheetById, 
    
}
