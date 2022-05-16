import axios from 'axios'
import {useState, useRef} from 'react';
import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

    
export default function useGoogleSheet({tunes, setTunes, timeout, setSheetUpdateResults, forceRefresh, recurseLoadSheetTimeout}) {
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
  
  function updateSheet(delay=1000) {
      console.log('trigger sheet update',recurseLoadSheetTimeout.current )
      if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
      
      if (googleSheetId.current) { 
        if (updateSheetTimer.current) clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          //console.log('do sheet update', tunebook)
          updateSheetById(googleSheetId.current , abcTools.tunesToAbc(tunes), function() {
              //loadSheet()
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
          //console.log('CREATED')
        }).catch(function(e) {
          getToken()
        })
      })
    }
    
    
    function loadSheet(recurseDelay = 0) {
      if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
      //console.log('load sheet',recurseDelay)
      getGoogleSheetDataById(googleSheetId.current, function(fullSheet) {
          var trialResults = mergeTuneBook(fullSheet)
          //setSheetUpdateResults({inserts, updates, deletes, localUpdates})
      //forceRefresh()
      
        //console.log('load sheet loaded',trialResults, trialResults.deletes, Object.keys(trialResults.deletes).length)
          if (Object.keys(trialResults.deletes).length > 0 ) { //|| Object.keys(trialResults.updates).length > 0) {
            setSheetUpdateResults(trialResults)
            forceRefresh()
          } else { 
            applyMergeChanges(trialResults)
            forceRefresh()
            //console.log('load sheet settimeout')
          }
          if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
          recurseLoadSheetTimeout.current = setTimeout(function() {
              //console.log('load sheet dotimeout',recurseDelay)
              if (recurseDelay > 0) loadSheet( recurseDelay)
          },recurseDelay)
      })
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
              loadSheet(timeout)
            } else {
              // create file
              createTuneSheet()
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
        scope: 'https://www.googleapis.com/auth/drive.metadata.readonly \
        https://www.googleapis.com/auth/drive.file \
        https://www.googleapis.com/auth/spreadsheets',
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
      if (client) {
        client.requestAccessToken();
      } else {
         initClient()
      }
    }
    function revokeToken() {
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
   
   
  function applyMergeChanges(changes) {
    var {inserts, updates, deletes, localUpdates} = changes
    //console.log('apply',changes)
    // save all inserts and updates, delete all deletes
    Object.keys(deletes).forEach(function(d) {
       delete tunes[d]
    })
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u].id) {
        tunes[updates[u].id] = updates[u]
      }
    })
    Object.values(inserts).forEach(function(tune) {
      tunes[tune.id] = tune
    })
    setTunes(tunes)
    //console.log('after apply tunes',tunes)
    // save locally updated tunes
    if (Object.keys(localUpdates).length > 0) {
      updateSheet(0, accessToken)
    }
    forceRefresh()
  }
  
   /** 
   * import songs to a tunebook from an abc file 
   */
  function mergeTuneBook(tunebookText) {
      //console.log('merge')
      var inserts={}
      var updates={}
      var deletes={}
      var localUpdates={}
      if (tunebookText) {
        //console.log('haveabc')
        var intunes = abcTools.abc2Tunebook(tunebookText)
        //console.log('havetunes', intunes, "NOW",  tunes, tunesHash)
        var ids = []
        Object.values(intunes).forEach(function(tune) {
          // existing tunes are updated
          //console.log('tune in',tune.id, tune)
          if (tune.id && tunes[tune.id]) {
            // preserve boost
            tune.boost = tunes[tune.id].boost
            if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
              updates[tune.id] = tune
              //console.log('update MORE RECENT')
            } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
              localUpdates[tune.id] = tune
              //console.log('local update MORE RECENT')
            } else {
              //console.log('skip update NOT MORE RECENT')
            }
            ids.push(tune.id)
          // new tunes 
          } else {
             //console.log('insert')
             if (!tune.id) tune.id = utils.generateObjectId()
             inserts[tune.id] = tune
          }
        })
        //console.log(ids)
        //console.log(Object.keys(tunes))
        Object.keys(tunes).forEach(function(tuneId) {
          if (ids.indexOf(tuneId) === -1) {
            deletes[tuneId] = tunes[tuneId]
          }
        })
      }
      //console.log('merge done' ,tunes, intunes,"INS", inserts, "UPD",updates,"DEL", deletes, "LL",localUpdates)
      return {inserts, updates, deletes, localUpdates}
  }
  
    
    return { applyGoogleWindowInit, updateSheet, loadSheet, initClient, getToken, revokeToken, loginUser, accessToken, mergeTuneBook, applyMergeChanges}
    
    //mergeLoadedSheet, getGoogleSheetDataById, createTuneSheet, loadSheet, findTuneBookInDrive, handleCredentialResponse, initClient, getToken, revokeToken, googleSheetId, loginUser, access_token, accessToken,updateSheetById, 
    
}
