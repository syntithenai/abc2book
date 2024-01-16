import axios from 'axios'
import {useState, useRef, useEffect} from 'react';
//import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

//import useCheckOnlineStatus from './useCheckOnlineStatus'

import useGoogleDocument from './useGoogleDocument'
    
export default function useGoogleSheet(props) {
  const {token, logout, refresh, tunes, pollingInterval, onMerge, pausePolling, setGoogleDocumentId, googleDocumentId} = props
  var tuneBookName="ABC Tune Book"
  
  var docs = useGoogleDocument(token, logout, refresh,function(changes) {
      return new Promise(function(resolve,reject) {
          var matchingChanges = changes.filter(function(change) {
            if (change.fileId === googleSheetId.current) {
              return true
            } else {
              return false
            }
          },pausePolling,pollingInterval)
          if (matchingChanges && matchingChanges.length === 1) {
            docs.getDocument(googleSheetId.current).then(function(fullSheet) {
              onMerge(fullSheet)
              resolve()
            })
          } else {
              resolve()
          }
      })
  }, pausePolling, pollingInterval)
  		
  useEffect(function() {
      if (token && token.access_token) {
        findTuneBookInDrive()
      } else {
        googleSheetId.current = null
      }
    },[token])
    
  
  var googleSheetId = useRef(null)
  var accessToken = token ? token.access_token : null
  let abcTools = useAbcTools();
  var utils = useUtils()
  var updateSheetTimer = useRef(null)
  
  // save current tunes database online
  function updateSheet(delay=3000) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger sheet update',delay, googleSheetId.current )
      pausePolling.current = true
      if (googleSheetId.current) { 
        clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          utils.loadLocalforageObject('bookstorage_tunes').then(function(nowTunes) {
              var abc = abcTools.tunesToAbc(nowTunes, false)
              //console.log('do sheet update NOWTUNES', nowTunes, abc.split('abcbook-file'))
              docs.updateDocumentData(googleSheetId.current , abc).then(function() {
                  pausePolling.current = false
                  //console.log('done sheet update')
              })
              resolve()
            })
        },delay)
      } else {
          resolve()
      }
    })
  }


	function findTuneBookInDrive() {
		//console.log('find book in drive')
		var xhr = new XMLHttpRequest();
		xhr.onload = function (res) {
			if (res.target.responseText) {
				var response = JSON.parse(res.target.responseText)
				//console.log('find tunebook',response)
				var found = false
				if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
					// load whole file
					if (Array.isArray(response.files)) {
						response.files.forEach(function(file) {
							if (file && file.name === tuneBookName) {
								found = file.id
							}
						})
					}
				}
				//console.log('found tunebook',found)
				if (found) {
					googleSheetId.current = found
					setGoogleDocumentId(found)
					docs.getDocument(found).then(function(fullSheet) {
						onMerge(fullSheet)
					})
				} else {
					docs.findTuneBookFolderInDrive().then(function(folderId) {
						if (folderId) {
							//console.log('found folder creating doc',folderId)
							docs.createDocument(tuneBookName,abcTools.tunesToAbc(tunes), 'application/vnd.google-apps.document','Document for '+tuneBookName+' data', folderId).then(function(newId) {
								googleSheetId.current = newId
								setGoogleDocumentId(newId)
								docs.getDocument(newId).then(function(fullSheet) {
									onMerge(fullSheet)
								})
							})
						}
					})
				}
			}
		};
		var filter = "?q="+ encodeURIComponent("name='"+tuneBookName+"' and mimeType != 'application/vnd.google-apps.folder' and trashed = false") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
		xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter+'&nocache='+String(parseInt(Math.random()*1000000000)));
		xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
		xhr.send();
	}
    
    
    
    return {  updateSheet}
        
}
