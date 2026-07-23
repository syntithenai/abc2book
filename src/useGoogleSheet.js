import axios from 'axios'
import {useState, useRef, useEffect, useCallback} from 'react';
//import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

//import useCheckOnlineStatus from './useCheckOnlineStatus'

import useGoogleDocument from './useGoogleDocument'
import { appendTuneBookSyncSectionsToAbc } from './tuneBookAbc'
import {
  normalizeDriveFileId,
  tokenHasDriveAccess,
} from './googleDrivePickerClient'
import {
  readPerformanceSetsMap,
  readDeletedPerformanceSets,
} from './performanceSetStore'
import {
  readPlaylistsMap,
  readDeletedPlaylists,
} from './savedPlaylistsStore'
    
export default function useGoogleSheet(props) {
  const {token, logout, refresh, tunes, pollingInterval, onMerge, pausePolling, setGoogleDocumentId, googleDocumentId} = props
  var tuneBookName="ABC Tune Book"

  var googleSheetId = useRef(null)
  var accessToken = token ? token.access_token : null
  let abcTools = useAbcTools();
  var utils = useUtils()
  var updateSheetTimer = useRef(null)
  var onMergeRef = useRef(onMerge)
  var tunesRef = useRef(tunes)
  var docsRef = useRef(null)

  useEffect(function() {
    onMergeRef.current = onMerge
  }, [onMerge])

  useEffect(function() {
    tunesRef.current = tunes
  }, [tunes])

  var docs = useGoogleDocument(token, logout, refresh,function(changes) {
      return new Promise(function(resolve,reject) {
          var matchingChanges = changes.filter(function(change) {
            if (change.fileId === googleSheetId.current) {
              return true
            } else {
              return false
            }
          })
          if (matchingChanges && matchingChanges.length >= 1) {
            docsRef.current.getDocument(googleSheetId.current).then(function(fullSheet) {
              if (typeof onMergeRef.current === 'function') {
                onMergeRef.current(fullSheet)
              }
              resolve()
            })
          } else {
              resolve()
          }
      })
  }, pausePolling, pollingInterval)

  docsRef.current = docs
  
  // save current tunes database online
  function updateSheet(delay=3000) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger sheet update',delay, googleSheetId.current )
      pausePolling.current = true
      if (googleSheetId.current) { 
        clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          Promise.all([
            utils.loadLocalforageObject('bookstorage_tunes'),
            utils.loadLocalforageObject('bookstorage_deleted_tunes'),
          ]).then(function(results) {
              var nowTunes = results[0] || {}
              var deletedTunes = results[1] || {}
              var performanceSets = readPerformanceSetsMap()
              var deletedPerformanceSets = readDeletedPerformanceSets()
              var playlists = readPlaylistsMap()
              var deletedPlaylists = readDeletedPlaylists()
              var abc = appendTuneBookSyncSectionsToAbc(
                abcTools.tunesToAbc(nowTunes, deletedTunes),
                performanceSets,
                deletedPerformanceSets,
                playlists,
                deletedPlaylists
              )
              //console.log('do sheet update NOWTUNES', nowTunes, abc.split('abcbook-file'))
              docsRef.current.updateDocumentData(googleSheetId.current , abc).then(function() {
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


	const findTuneBookInDrive = useCallback(function() {
		if (!token || !token.access_token) return
		if (googleSheetId.current) return

		function runSearch(useToken) {
			if (!useToken) return
			var xhr = new XMLHttpRequest();
			xhr.onload = function (res) {
				if (res.target.responseText) {
					var response = JSON.parse(res.target.responseText)
					var found = false
					if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
						if (Array.isArray(response.files)) {
							response.files.forEach(function(file) {
								if (file && file.name === tuneBookName) {
									found = file.id
								}
							})
						}
					}
					if (found) {
						googleSheetId.current = found
						setGoogleDocumentId(found)
						docsRef.current.getDocument(found).then(function(fullSheet) {
							if (typeof onMergeRef.current === 'function') {
								onMergeRef.current(fullSheet)
							}
						})
					} else {
						docsRef.current.findTuneBookFolderInDrive().then(function(folderId) {
							if (folderId) {
								utils.loadLocalforageObject('bookstorage_deleted_tunes').then(function(deletedTunes) {
								var initialAbc = appendTuneBookSyncSectionsToAbc(
	                abcTools.tunesToAbc(tunesRef.current, deletedTunes || {}),
	                readPerformanceSetsMap(),
	                readDeletedPerformanceSets(),
	                readPlaylistsMap(),
	                readDeletedPlaylists()
	              )
								docsRef.current.createDocument(tuneBookName, initialAbc, 'application/vnd.google-apps.document','Document for '+tuneBookName+' data', folderId).then(function(newId) {
									var fileId = normalizeDriveFileId(newId)
									if (!fileId) return
									googleSheetId.current = fileId
									setGoogleDocumentId(fileId)
									docsRef.current.getDocument(fileId).then(function(fullSheet) {
										if (typeof onMergeRef.current === 'function') {
											onMergeRef.current(fullSheet)
										}
									})
								})
								})
							}
						})
					}
				}
			};
			var filter = "?q="+ encodeURIComponent("name='"+tuneBookName+"' and mimeType != 'application/vnd.google-apps.folder' and trashed = false")
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter+'&nocache='+String(parseInt(Math.random()*1000000000)));
			xhr.setRequestHeader('Authorization', 'Bearer ' + useToken);
			xhr.send();
		}

		if (!tokenHasDriveAccess(token)) return
		runSearch(token.access_token)
	}, [token, setGoogleDocumentId, abcTools, tuneBookName, utils])

  useEffect(function() {
      if (token && token.access_token) {
        findTuneBookInDrive()
      } else {
        googleSheetId.current = null
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Drive lookup once per login token; callbacks read from refs
    },[accessToken])
    
    
    
    return {  updateSheet}
        
}
