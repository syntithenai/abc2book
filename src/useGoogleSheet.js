import axios from 'axios'
import {useState, useRef, useEffect} from 'react';
import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

import useCheckOnlineStatus from './useCheckOnlineStatus'

import useGoogleDocument from './useGoogleDocument'
    
export default function useGoogleSheet(props) {
  const {token, refresh, tunes, pollingInterval, onMerge, pausePolling, setGoogleDocumentId, googleDocumentId} = props
  var checkOnlineStatus = useCheckOnlineStatus()
  //console.log('useGoogleSheet',props)
  //var client;
  // google login
  var docs = useGoogleDocument(token,refresh,pollingInterval,pausePolling,function(changes) {
      //console.log('DOCCHANGE',changes)
      var matchingChanges = changes.filter(function(change) {
        if (change.fileId === googleSheetId.current) {
          return true
        } else {
          return false
        }
      })
      //console.log('DOCCHANGE match',matchingChanges)
      if (matchingChanges && matchingChanges.length === 1) {
        getGoogleSheetDataById(googleSheetId.current).then(function(fullSheet) {
          //console.log('DOCCHANGE got sheet')
          onMerge(fullSheet)
        })
      }
  })
  var googleSheetId = useRef(null)
  //var [loginUser, setLoginUser] = useState(null)
  //var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID 
  //var [access_token, setAccess_token] = useState(null)
  var accessToken = token ? token.access_token : null
  let abcTools = useAbcTools();
  var utils = useUtils()
  

  function updateSheetById(id,data) {
    return docs.updateDocumentData(id,data)
  }
 
    
  var updateSheetTimer = useRef(null)
  
  function updateSheet(delay=1000) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger sheet update',googleSheetId.current )
      //if (recurseLoadSheetTimeout.current) clearTimeout(recurseLoadSheetTimeout.current)
      pausePolling.current = true
      if (googleSheetId.current) { 
        clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          //console.log('do sheet update', tunes)
          var nowTunes = utils.loadLocalObject('bookstorage_tunes')
          //console.log('do sheet update NOWTUNES', nowTunes)
          updateSheetById(googleSheetId.current , abcTools.tunesToAbc(nowTunes)).then(function() {
              //loadSheet()
              pausePolling.current = false
              //console.log('done sheet update')
          })
          resolve()
        },delay)
      } else {
          resolve()
      }
    })
  }
    
    
   
    function createTuneSheet() {
      return docs.createDocument('ABC Tune Book',abcTools.tunesToAbc(tunes), 'vnd.google-apps.document','Document for ABC Tune Book data')
    }
    
    
    function getGoogleSheetDataById(id) {
      return docs.getDocument(id)
    }
    
     function getGoogleSheetMetaById(id) {
      return docs.getDocumentMeta(id)
      }
    
    function doLoad() {
      //getGoogleSheetMetaById(googleSheetId.current).then(function(sheetMeta) {
        //console.log('META',sheetMeta)
        getGoogleSheetDataById(googleSheetId.current).then(function(fullSheet) {
            onMerge(fullSheet)
        })
      //})
    }
    
    //function setupInterval() {
      ////console.log('setup interval')
      //if (recurseLoadSheetTimeout.current) clearInterval(recurseLoadSheetTimeout.current)
      //recurseLoadSheetTimeout.current = setInterval(function() {
         ////console.log('load sheet dotimeout')  
         //if (!props.pauseSheetUpdates.current) doLoad()
      //},props.pollingInterval > 1000 ? props.pollingInterval : 20000)
    //}
    function loadSheet() {
      //console.log('load sheet')
      doLoad()
      //setupInterval()
    }
    function findTuneBookInDrive() {
      console.log('find book in drive')
      var tuneBookName="ABC Tune Book"
        var xhr = new XMLHttpRequest();
        xhr.onload = function (res) {
          if (res.target.responseText) {
            var response = JSON.parse(res.target.responseText)
            if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
              // load whole file
              console.log("found",response.files)
              var found = false
              if (Array.isArray(response.files)) {
                response.files.forEach(function(file) {
                  if (file && file.name === tuneBookName) {
                    found = file.id
                  }
                })
              }
              console.log("FFF",found)
              if (found) {
                googleSheetId.current = found
                setGoogleDocumentId(found)
                loadSheet()
              } else {
                console.log('create no name match')
                createTuneSheet().then(function(newId) {
                  googleSheetId.current = newId
                  setGoogleDocumentId(newId)
                  loadSheet()
                })
              }
            } else {
              // create file
              console.log('create')
              createTuneSheet().then(function(newId) {
                googleSheetId.current = newId
                setGoogleDocumentId(newId)
                loadSheet()
              })
              //setupInterval()
            }
          }
        };
        //mimeType = 'application/vnd.google-apps.spreadsheet' and 
        var filter = "?q="+ encodeURIComponent("name='"+tuneBookName+"'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
        xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter);
        xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
        xhr.send();
    }
    useEffect(function() {
      //console.log('sheet effect',token)
      if (token && token.access_token) {
        findTuneBookInDrive()
      }
    },[token])
    
    return {  updateSheet}
    
    //mergeLoadedSheet, getGoogleSheetDataById, createTuneSheet, loadSheet, findTuneBookInDrive, handleCredentialResponse, initClient, getToken, revokeToken, googleSheetId, loginUser, access_token, accessToken,updateSheetById, 
    
}
