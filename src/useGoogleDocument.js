import axios from 'axios'
import {useRef, useEffect} from 'react'
import useUtils from './useUtils'
import * as localForage from "localforage";
import { tryRefreshAccessToken } from './googleLoginRefreshRegistry'
import { normalizeDriveFileId } from './googleDrivePickerClient'
import { normalizeAccessToken } from './mediaProxyClient'
import { tokenHasFreshAccess } from './googleLoginTokenAdapter'
import { isNavigatorOffline } from './offlineNetwork'

var unauthorizedRefreshInFlight = null

function handleDriveUnauthorized(logout, currentToken) {
  if (!unauthorizedRefreshInFlight) {
    unauthorizedRefreshInFlight = tryRefreshAccessToken().finally(function() {
      unauthorizedRefreshInFlight = null
    })
  }
  return unauthorizedRefreshInFlight.then(function(refreshed) {
    if (refreshed && refreshed.access_token) {
      return refreshed
    }
    // A failed silent refresh must not wipe an otherwise usable bearer. Media
    // proxy 401 retries used to force refresh (missing expires_at) and then
    // Drive's 401 handler logged the user out mid audio-generation.
    if (tokenHasFreshAccess(currentToken, 5000)) {
      return currentToken
    }
    if (typeof logout === 'function') logout()
    return null
  }).catch(function() {
    if (tokenHasFreshAccess(currentToken, 5000)) {
      return currentToken
    }
    if (typeof logout === 'function') logout()
    return null
  })
}

function driveId(input) {
  return normalizeDriveFileId(input)
}

export default function useGoogleDocument(token, logout, refresh, onChanges, pausePolling, pollInterval) {
  var accessToken = token ? token.access_token : null

  function bearerToken(forceToken) {
    if (forceToken) return normalizeAccessToken(forceToken)
    return token && token.access_token ? token.access_token : null
  }
  var pollChangesTimeout = useRef(null)
  var onChangesRef = useRef(onChanges)
  var pollIntervalRef = useRef(pollInterval)
  var utils = useUtils()
  var tuneBookName="ABC Tune Book"
 
 
  var allowedImageMimeTypes = [] //application/musicxml
	
	var filestore = localForage.createInstance({
		name: 'files'
	});
	var recordingsstore = localForage.createInstance({
		name: 'recordings'
	});

  useEffect(function() {
    onChangesRef.current = onChanges
    pollIntervalRef.current = pollInterval
  }, [onChanges, pollInterval])

  useEffect(function() {
    if (token && token.access_token && onChangesRef.current) {
      pollChanges(pollIntervalRef.current, onChangesRef.current)
    }
    return function() {
      stopPollChanges()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- poll when token changes; callbacks read from refs
  },[token])
	 
	//function indexFiles() {
		//return new Promise(function(resolve,reject) {
			//var final = {}
			//filestore.iterate(function(value, key, iterationNumber) {
				//if (value && value.tuneId) {
					 //if (!Array.isArray(final[value.tuneId])) final[value.tuneId] = []
					 //final[value.tuneId].push({id: value.id, googleDocumentId: value.googleId, data: value.data ? true : false, name: value.name})
				//}
			//}).catch(function(err) {
				//resolve([])
			//}).finally(function() {
				//resolve(final)
			//})
		//})
	//} 
	
	//function indexRecordings() {
		//return new Promise(function(resolve,reject) {
			//var final = {}
			//recordingsstore.iterate(function(value, key, iterationNumber) {
				//if (value && value.tuneId) {
					 //if (!Array.isArray(final[value.tuneId])) final[value.tuneId] = []
					 //final[value.tuneId].push({id: value.id, googleDocumentId: value.googleId, data: value.data ? true : false, name: value.name})
				//}
			//}).catch(function(err) {
				//resolve([])
			//}).finally(function() {
				//resolve(final)
			//})
		//})
	//}
	 
	 
	//function syncAttachedFiles(tunes, force_token = null) {
		//return
		 //// load missing
		 //var final = {}
		 //var useToken = force_token ? force_token : (token ? token.access_token : null)
		 //return new Promise(function(resolve,reject) { 
			 //var promises = []
			 //indexFiles().then(function(fileIndex) {
				//indexRecordings().then(function(recordingsIndex) {
					 //Object.values(tunes).forEach(function(tune, tuneKey) {
						//final[tune.id] = tune
						//if (tune && tune.id && Array.isArray(fileIndex[tune.id])) {
							
							//fileIndex[tune.id].forEach(function(file, fileKey) {
								//// have doc but not data so load 
								//if (file && file.googleDocumentId && !file.data) { 
									//promises.push(new Promise(function(iresolve,ireject) {
											
										//getDocumentBlob(file.googleId, useToken).then(function(blob) {
											////TODO convert base64
											//utils.blobToBase64(blob).then(function(cbData) {
												////final[tune.id].files[fileKey].data = cbData
												//iresolve([tune.id,fileKey,cbData])
											//})
										//})
									//}))
								//} else {
									//if (file && !file.googleDocumentId && file.data && file.name) { 
										//findTuneBookFolderInDrive().then(function(folderId) {
											//createDocument(file.name, utils.dataURItoBlob(file.data),'application/vnd.google-apps.document','',folderId,useToken).then(function(res) {
												//if (!res.error) final[tune.id].files[fileKey].googleDocumentId = res
											//})
										//})
									//}
								//}
							//})
						//}
						//if (tune && tune.id && Array.isArray(recordingsIndex[tune.id])) {
							//recordingsIndex[tune.id].forEach(function(file, fileKey) {
								//// have doc but not data so load 
								//if (file && file.googleDocumentId && !file.data) { 
									//promises.push(new Promise(function(iresolve,ireject) {
											
										//getDocumentBlob(file.googleDocumentId, useToken).then(function(blob) {
											////TODO convert base64
											//utils.blobToBase64(blob).then(function(cbData) {
												////final[tune.id].files[fileKey].data = cbData
												//iresolve([tune.id,fileKey,cbData])
											//})
										//})
									//}))
								//} else {
									//if (file && !file.googleDocumentId && file.data && file.name) { 
										//findTuneBookFolderInDrive().then(function(folderId) {
											//createDocument(file.name, utils.dataURItoBlob(file.data),'application/vnd.google-apps.document','',folderId,useToken).then(function(res) {
												//if (!res.error) final[tune.id].files[fileKey].googleDocumentId = res
											//})
										//})
									//}
								//}
							//})
						//}
					//}) 
					////Object.keys(tunes).forEach(function(tune) {
						////if (tunes[tuneId]) {
							////var fileKey = filesToSave[tuneId]
							
						////}
					////})
					//Promise.all(promises).then(function(f) {
						//f.forEach(function(fileData) {
							//final[fileData[0]].files[fileData[1]].data = fileData[2]
						//})
						//resolve(final)
						
					//})
				//})
			//})
		//})
		
	//}		
			
	
    function findTuneBookFolderInDrive() {
		return new Promise(function(resolve,reject) {
				if (!accessToken) {
					resolve(null)
					return
				}
				var xhr = new XMLHttpRequest();
				xhr.onload = function (res) {
					if (res.target.responseText) {
						var response = JSON.parse(res.target.responseText)
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
						if (found) {
							resolve(found)
						} else {
							createDocument(tuneBookName,null, 'application/vnd.google-apps.folder','Folder for '+tuneBookName+' data').then(function(newId) {
								resolve(newId)
							})
						}
					}
				};
				var filter = "?q="+ encodeURIComponent("name='"+tuneBookName+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
				xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter+'&nocache='+String(parseInt(Math.random()*1000000000)));
				xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
				xhr.send();
		})
	}

    function findOrCreateRecordingsFolderInDrive(parentFolderId) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !accessToken) {
				resolve(null)
				return
			}
			var recordingsFolderName = 'Recordings'
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files)) {
					response.files.forEach(function(file) {
						if (file && file.name === recordingsFolderName) {
							found = file.id
						}
					})
				}
				if (found) {
					resolve(found)
				} else {
					createDocument(
						recordingsFolderName,
						null,
						'application/vnd.google-apps.folder',
						'Recordings from TuneBook',
						parentFolderId
					).then(function(newId) {
						resolve(newId && !newId.error ? newId : null)
					})
				}
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + recordingsFolderName + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parentFolderId + "' in parents and trashed = false"
			)
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}

    function findOrCreateFilesFolderInDrive(parentFolderId) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !accessToken) {
				resolve(null)
				return
			}
			var filesFolderName = 'Files'
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files)) {
					response.files.forEach(function(file) {
						if (file && file.name === filesFolderName) {
							found = file.id
						}
					})
				}
				if (found) {
					resolve(found)
				} else {
					createDocument(
						filesFolderName,
						null,
						'application/vnd.google-apps.folder',
						'Files from TuneBook',
						parentFolderId
					).then(function(newId) {
						resolve(newId && !newId.error ? newId : null)
					})
				}
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + filesFolderName + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parentFolderId + "' in parents and trashed = false"
			)
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}

    function findOrCreateAudioAnalysisFolderInDrive(parentFolderId) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !accessToken) {
				resolve(null)
				return
			}
			var folderName = 'AudioAnalysis'
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files)) {
					response.files.forEach(function(file) {
						if (file && file.name === folderName) {
							found = file.id
						}
					})
				}
				if (found) {
					resolve(found)
				} else {
					createDocument(
						folderName,
						null,
						'application/vnd.google-apps.folder',
						'Audio Analysis recording sets from TuneBook',
						parentFolderId
					).then(function(newId) {
						resolve(newId && !newId.error ? newId : null)
					})
				}
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + folderName + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parentFolderId + "' in parents and trashed = false"
			)
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}

    function findOrCreateScratchpadFolderInDrive(parentFolderId) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !accessToken) {
				resolve(null)
				return
			}
			var folderName = 'Scratchpad'
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files)) {
					response.files.forEach(function(file) {
						if (file && file.name === folderName) {
							found = file.id
						}
					})
				}
				if (found) {
					resolve(found)
				} else {
					createDocument(
						folderName,
						null,
						'application/vnd.google-apps.folder',
						'Scratchpad items from TuneBook',
						parentFolderId
					).then(function(newId) {
						resolve(newId && !newId.error ? newId : null)
					})
				}
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + folderName + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parentFolderId + "' in parents and trashed = false"
			)
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}

    function findOrCreateCachedMediaFolderInDrive(parentFolderId) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !accessToken) {
				resolve(null)
				return
			}
			var folderName = 'CachedMedia'
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files)) {
					response.files.forEach(function(file) {
						if (file && file.name === folderName) {
							found = file.id
						}
					})
				}
				if (found) {
					resolve(found)
				} else {
					createDocument(
						folderName,
						null,
						'application/vnd.google-apps.folder',
						'Cached media backup from TuneBook',
						parentFolderId
					).then(function(newId) {
						resolve(newId && !newId.error ? newId : null)
					})
				}
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + folderName + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parentFolderId + "' in parents and trashed = false"
			)
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}

    function findFileInFolder(parentFolderId, fileName) {
		return new Promise(function(resolve) {
			if (!parentFolderId || !fileName || !accessToken) {
				resolve(null)
				return
			}
			var xhr = new XMLHttpRequest()
			xhr.onload = function(res) {
				if (!res.target.responseText) {
					resolve(null)
					return
				}
				var response = JSON.parse(res.target.responseText)
				var found = null
				if (response && Array.isArray(response.files) && response.files.length) {
					found = response.files[0].id
				}
				resolve(found)
			}
			xhr.onerror = function() { resolve(null) }
			var filter = '?q=' + encodeURIComponent(
				"name='" + String(fileName).replace(/'/g, "\\'") + "' and '" + parentFolderId + "' in parents and trashed = false"
			) + '&fields=files(id,name)&pageSize=1'
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken)
			xhr.send()
		})
	}
	
  function _pollChanges(interval, onChanges, multiplier = 1) {
      // Always re-arm the next poll, even when this poll was paused, errored, or
      // returned no changes. Otherwise the recursive polling chain dies after the
      // first paused/failed poll and cross-device changes are never seen again
      // until the next login (token change).
      function scheduleNext(res) {
        if (onChanges && Array.isArray(res) && res.length > 0) {
          onChanges(res).then(function() {
            pollChanges(interval, onChanges)
          }).catch(function() {
            pollChanges(interval, onChanges)
          })
        } else {
          pollChanges(interval, onChanges, (multiplier < 6 ? multiplier + 1 : multiplier))
        }
      }
      if (!localStorage.getItem('google_last_page_token')) {
        getStartPageToken().then(function() {
          doPollChanges().then(scheduleNext)
        })
      } else {
        doPollChanges().then(scheduleNext)
      }
    }
  
  function pollChanges(interval, onChanges, multiplier = 1) {
    // min 4 sec
    var useInterval = interval > 4000 ? interval : 15000
    clearTimeout(pollChangesTimeout.current) 
    pollChangesTimeout.current = setTimeout(function() {_pollChanges(interval,onChanges, multiplier)}, useInterval) // * multiplier/3)
    return 
  }
  
  function stopPollChanges() {
    clearTimeout(pollChangesTimeout.current)  
  }
  
  function getStartPageToken() {
    return new Promise(function(resolve,reject) {
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken && !isNavigatorOffline()) {
        var url = 'https://www.googleapis.com/drive/v3/changes/startPageToken'
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          if (postRes.data && postRes.data.startPageToken) localStorage.setItem('google_last_page_token',postRes.data.startPageToken)
          resolve(postRes.data)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve()
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
	function doPollChanges() {
		return new Promise(function(resolve,reject) {
			if (isNavigatorOffline()) {
				resolve()
			} else if (pausePolling && pausePolling.current) {
				resolve()
			} else {
				if (localStorage.getItem('google_last_page_token') && accessToken) {
					var url = 'https://www.googleapis.com/drive/v3/changes?pageToken=' + localStorage.getItem('google_last_page_token')
					axios({
						method: 'get',
						url: url,
						headers: {'Authorization': 'Bearer '+accessToken},
					}).then(function(postRes) {
						if (postRes && postRes.data && postRes.data.newStartPageToken) {
						  localStorage.setItem('google_last_page_token',postRes.data.newStartPageToken)
						}
						if (postRes && postRes.data && Array.isArray(postRes.data.changes) && postRes.data.changes.length > 0) {
						  resolve(postRes.data.changes)
						} else {
							//stopPollChanges()
							//refresh()
							resolve([])
						} 
					}).catch(function(e) {
						if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
						}
						resolve()
					})
				} else {
					//stopPollChanges()
					resolve()
				}
			}
		})
	}

  function findDocument(title) {
    return new Promise(function(resolve,reject) {
      //var useToken = accessToken ? accessToken : access_token
      if (title && accessToken) {
        var filter = "?q="+ encodeURIComponent("name='"+title+"'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
        var url = 'https://www.googleapis.com/drive/v3/files' + filter
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
          //getToken()
          //refresh()
          if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve()
        })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
    
        //var xhr = new XMLHttpRequest();
        //xhr.onload = function (res) {
          //if (res.target.responseText) {
            //var response = JSON.parse(res.target.responseText)
            //if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
              //// load whole file
              //googleSheetId.current = response.files[0].id
              //// start polling for changes
              //loadSheet(0, true)
            //} else {
              //// create file
              //createTuneSheet()
              //setupInterval()
            //}
          //}
        //};
        ////mimeType = 'application/vnd.google-apps.spreadsheet' and 
        //var filter = "?q="+ encodeURIComponent("name='ABC Tune Book'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
        //xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter);
        //xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
        //xhr.send();
    }
    
  function getPublicDocument(id, mimeType='text') {
    return new Promise(function(resolve,reject) {
      //var useToken = accessToken ? accessToken : access_token
      if (id ) {
        axios({
          method: 'get',
          url: 'https://drive.google.com/u/0/uc?id='+id+'&export=download',
          //url: 'https://www.googleapis.com/drive/v3/files/'+id+'/export?mimeType='+mimeType+'&nocache='+String(parseInt(Math.random()*1000000000))
          //url: 'https://drive.google.com/file/d/'+id+'/view?usp=sharing',
          //headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          //getToken()
          //refresh()
          resolve()
        })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function getDocument(id) {
    return new Promise(function(resolve,reject) {
      var fileId = driveId(id)
      if (fileId && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
          
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          //getToken()
          //refresh()
          resolve()
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function exportDocument(id) {
    return new Promise(function(resolve,reject) {
      var fileId = driveId(id)
      if (fileId && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media',
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
          
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          //getToken()
          //refresh()
          resolve()
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function getDocumentBlob(id, force_token = null) {
    return new Promise(function(resolve,reject) {
      var fileId = driveId(id)
      function attempt(useToken, allowRetry) {
        if (!fileId || !useToken) {
          if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh()
          resolve({error: 'missing token'})
          return
        }
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+useToken},
          responseType: 'blob'
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401' && allowRetry) {
            handleDriveUnauthorized(logout, token).then(function(refreshed) {
              var nextToken = refreshed && refreshed.access_token
                ? refreshed.access_token
                : bearerToken(force_token)
              if (nextToken && nextToken !== useToken) {
                attempt(nextToken, false)
                return
              }
              resolve({error: e})
            }).catch(function() {
              resolve({error: e})
            })
            return
          }
          if (e && e.response && e.response.status == '401') {
            handleDriveUnauthorized(logout, token)
          }
          resolve({error: e})
        })
      }
      attempt(bearerToken(force_token), true)
    })
  }
  
  function getDocumentMeta(id) {
    return new Promise(function(resolve,reject) {
      var fileId = driveId(id)
      if (fileId && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+fileId  + '?fields=modifiedTime,name,kind,fileExtension,mimeType,exportLinks,thumbnailLink,size,id,description,trashed,explicitlyTrashed,ownedByMe,owners', //&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          //getToken()
          //refresh()
          resolve()
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function listRevisions(id) {
    return new Promise(function(resolve,reject) {
      if (!id || !accessToken) {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh()
        resolve()
        return
      }
      var revisions = []
      function fetchPage(pageToken) {
        var url = 'https://www.googleapis.com/drive/v3/files/'+id+'/revisions?fields='
          + encodeURIComponent('nextPageToken,revisions(id,modifiedTime,size,lastModifyingUser(displayName),exportLinks)')
          + '&pageSize=200'
        if (pageToken) url += '&pageToken='+encodeURIComponent(pageToken)
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          if (postRes.data && postRes.data.revisions) revisions = revisions.concat(postRes.data.revisions)
          if (postRes.data && postRes.data.nextPageToken) {
            fetchPage(postRes.data.nextPageToken)
          } else {
            resolve(revisions)
          }
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
            handleDriveUnauthorized(logout, token)
          }
          resolve()
        })
      }
      fetchPage(null)
    })
  }

  function getRevisionData(id, revisionId, exportLinks) {
    return new Promise(function(resolve,reject) {
      if (!id || !revisionId || !accessToken) {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh()
        resolve()
        return
      }
      function fetchExportFallback() {
        // Google-native docs don't support alt=media on revisions; use the revision's export link
        var exportUrl = exportLinks && (exportLinks['text/plain'] || exportLinks['text/csv'])
        if (!exportUrl) {
          resolve()
          return
        }
        axios({
          method: 'get',
          url: exportUrl,
          headers: {'Authorization': 'Bearer '+accessToken},
          responseType: 'text',
          transformResponse: [function(data) { return data }],
        }).then(function(postRes) {
          resolve(postRes.data)
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
            handleDriveUnauthorized(logout, token)
          }
          resolve()
        })
      }
      axios({
        method: 'get',
        url: 'https://www.googleapis.com/drive/v3/files/'+id+'/revisions/'+revisionId+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
        headers: {'Authorization': 'Bearer '+accessToken},
        responseType: 'text',
        transformResponse: [function(data) { return data }],
      }).then(function(postRes) {
        resolve(postRes.data)
      }).catch(function(e) {
        if (e && e.response && e.response.status == '401') {
          handleDriveUnauthorized(logout, token)
          resolve()
        } else {
          fetchExportFallback()
        }
      })
    })
  }

   function createDocument(title, documentData, documentType='application/vnd.google-apps.document', documentDescription='', documentFolderId = null, force_token = null) {
    return new Promise(function(resolve,reject) {
		if (isNavigatorOffline()) {
			resolve()
			return
		}
		var useToken = force_token ? force_token : (token ? token.access_token : null)
      if (documentType && title && useToken) {
        var  data = {
          "description": documentDescription,
          "kind": "drive#file",
          "name": title,
          "mimeType": documentType //"vnd.google-apps.spreadsheet"
        }
        if (documentFolderId) data.parents = [documentFolderId]
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files',
          data: data,
          headers: {'Authorization': 'Bearer '+useToken},
        }).then(function(postRes) {
          //googleSheetId.current = postRes.data.id
			if (postRes && postRes.data && postRes.data.id) {
				if (documentData ) {
				  updateDocumentData(postRes.data.id, documentData, useToken).then(function(updated) {
					//onLogin("")
					localStorage.setItem('google_last_page_token','')
					resolve(postRes.data.id)
				  })
				} else {
					resolve(postRes.data.id)
				}
			} else {
				resolve({error:'failed to get created document id	'})
			}
        }).catch(function(e) {
            //getToken()
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
            resolve({error:e})
          })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve({error:["Invalid request missing document title or access token",title,'TTT',accessToken,'TTT']})
      }
    })
  }
  
  function updateDocument(id,metaData) {
    return new Promise(function(resolve,reject) {  
      if (id && accessToken) {
          axios({
            method: 'patch',
            url: 'https://www.googleapis.com/drive/v3/files/'+id+"?alt=json",
            data: metaData,
            headers: {'Authorization': 'Bearer '+accessToken},
          }).then(function(postRes) {
            //googleSheetId.current = postRes.data.id
            localStorage.setItem('google_last_page_token','')
            resolve()
          }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
			}
			resolve({error: e})
          })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  

  function updateDocumentData(id,data, force_token = null) {
    return new Promise(function(resolve,reject) {
		var useToken = force_token ? force_token : (token ? token.access_token : null)
      if (id && useToken) {
        
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
          headers: {'Authorization': 'Bearer '+useToken},
          data: data,
        }).then(function(postRes) {
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
          if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function deleteDocument(id) {
    return new Promise(function(resolve,reject) {
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v2/files/'+id,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh()
        // Always settle — otherwise callers (e.g. file delete) hang forever when signed out.
        resolve()
      }
    })
  }
  
  function addPermission(id,permissionData) {
    return new Promise(function(resolve,reject) {
      if (id && accessToken) {
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions",
          headers: {'Authorization': 'Bearer '+accessToken},
          data: permissionData,
        }).then(function(postRes) {
          resolve(postRes)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function listPermissions(id) {
    return new Promise(function(resolve,reject) {
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions",
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function updatePermission(id, permissionId, permissionData) {
    return new Promise(function(resolve,reject) {
      if (id && accessToken) {
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions/"+permissionId,
          headers: {'Authorization': 'Bearer '+accessToken},
          data: permissionData,
        }).then(function(postRes) {
          resolve(postRes)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  function deletePermission(id,permissionId) {
    return new Promise(function(resolve,reject) {
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions/"+permissionId,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes)
        }).catch(function(e) {
			if (e && e.response && e.response.status == '401') {
			  handleDriveUnauthorized(logout, token)
			}
			resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function getPublicDocumentBlob(id) {
    return new Promise(function(resolve) {
      if (!id) {
        resolve({ error: 'missing id' })
        return
      }
      axios({
        method: 'get',
        url: 'https://drive.google.com/u/0/uc?id=' + encodeURIComponent(id) + '&export=download',
        responseType: 'blob',
      }).then(function(postRes) {
        const blob = postRes.data
        if (!blob || blob.error) {
          resolve({ error: blob && blob.error ? blob.error : 'empty blob' })
          return
        }
        if (blob.type && String(blob.type).indexOf('text/html') !== -1) {
          resolve({ error: 'unexpected html response' })
          return
        }
        resolve(blob)
      }).catch(function(e) {
        resolve({ error: e })
      })
    })
  }

  return {findTuneBookFolderInDrive, findOrCreateRecordingsFolderInDrive, findOrCreateFilesFolderInDrive, findOrCreateAudioAnalysisFolderInDrive, findOrCreateScratchpadFolderInDrive, findOrCreateCachedMediaFolderInDrive, findFileInFolder, getPublicDocument, getPublicDocumentBlob, findDocument, getDocument,getDocumentBlob,  getDocumentMeta, updateDocument,updateDocumentData, createDocument, deleteDocument, pollChanges, stopPollChanges, addPermission, listPermissions, updatePermission, deletePermission, exportDocument, listRevisions, getRevisionData}
  
}
