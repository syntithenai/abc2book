import axios from 'axios'
import {useRef, useEffect} from 'react'
import isOnline from 'is-online';
import useUtils from './useUtils'
import * as localForage from "localforage";
//console.log(await isOnline());
export default function useGoogleDocument(token, logout, refresh, onChanges, pausePolling, pollInterval) {
//console.log('use g doc',token)
  var accessToken = token ? token.access_token : null
  var pollChangesTimeout = useRef(null)
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
    //console.log('use doc tok change',onChanges, token)
    if (token && token.access_token && onChanges) {
      //console.log('START POLL')
      pollChanges(pollInterval, onChanges)
    }
    return function() {
      //console.log('STOP POLL')
      stopPollChanges()
    }
  },[token])
	 
	//function indexFiles() {
		//console.log('create index')
		//return new Promise(function(resolve,reject) {
			//var final = {}
			//filestore.iterate(function(value, key, iterationNumber) {
				//if (value && value.tuneId) {
					 //if (!Array.isArray(final[value.tuneId])) final[value.tuneId] = []
					 //final[value.tuneId].push({id: value.id, googleDocumentId: value.googleId, data: value.data ? true : false, name: value.name})
				//}
			//}).catch(function(err) {
				//console.log(err);
				//resolve([])
			//}).finally(function() {
				////console.log('finaly', final)
				//resolve(final)
			//})
		//})
	//} 
	
	//function indexRecordings() {
		//console.log('create r index')
		//return new Promise(function(resolve,reject) {
			//var final = {}
			//recordingsstore.iterate(function(value, key, iterationNumber) {
				//if (value && value.tuneId) {
					 //if (!Array.isArray(final[value.tuneId])) final[value.tuneId] = []
					 //final[value.tuneId].push({id: value.id, googleDocumentId: value.googleId, data: value.data ? true : false, name: value.name})
				//}
			//}).catch(function(err) {
				//console.log(err);
				//resolve([])
			//}).finally(function() {
				////console.log('finaly', final)
				//resolve(final)
			//})
		//})
	//}
	 
	 
	//function syncAttachedFiles(tunes, force_token = null) {
		//return
		 //// load missing
		 //var final = {}
		 //var useToken = force_token ? force_token : (token ? token.access_token : null)
		 //console.log('sync', useToken, tunes)
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
									////console.log('sync load tune ',tune, file, useToken)
									//promises.push(new Promise(function(iresolve,ireject) {
										////console.log('start prom ')
											
										//getDocumentBlob(file.googleId, useToken).then(function(blob) {
										 ////console.log('got blob ')
											////TODO convert base64
											//utils.blobToBase64(blob).then(function(cbData) {
												////console.log('set final loaded',tune.id, fileKey)
												////final[tune.id].files[fileKey].data = cbData
												//iresolve([tune.id,fileKey,cbData])
												////console.log('sync loaded tune ',cbData, final[tune.id].files)
											//})
										//})
									//}))
								//} else {
									//if (file && !file.googleDocumentId && file.data && file.name) { 
										////console.log('sync save tune ',tune, file, useToken)
										////console.log('have tune data ',tunes[tuneId].files[fileKey])
										//findTuneBookFolderInDrive().then(function(folderId) {
											//createDocument(file.name, utils.dataURItoBlob(file.data),'application/vnd.google-apps.document','',folderId,useToken).then(function(res) {
												////console.log('created', res)
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
									////console.log('sync load tune ',tune, file, useToken)
									//promises.push(new Promise(function(iresolve,ireject) {
										////console.log('start prom ')
											
										//getDocumentBlob(file.googleDocumentId, useToken).then(function(blob) {
										 ////console.log('got blob ')
											////TODO convert base64
											//utils.blobToBase64(blob).then(function(cbData) {
												////console.log('set final loaded',tune.id, fileKey)
												////final[tune.id].files[fileKey].data = cbData
												//iresolve([tune.id,fileKey,cbData])
												////console.log('sync loaded tune ',cbData, final[tune.id].files)
											//})
										//})
									//}))
								//} else {
									//if (file && !file.googleDocumentId && file.data && file.name) { 
										////console.log('sync save tune ',tune, file, useToken)
										////console.log('have tune data ',tunes[tuneId].files[fileKey])
										//findTuneBookFolderInDrive().then(function(folderId) {
											//createDocument(file.name, utils.dataURItoBlob(file.data),'application/vnd.google-apps.document','',folderId,useToken).then(function(res) {
												////console.log('created', res)
												//if (!res.error) final[tune.id].files[fileKey].googleDocumentId = res
											//})
										//})
									//}
								//}
							//})
						//}
					//}) 
					////Object.keys(tunes).forEach(function(tune) {
						////console.log('sync save file ',tune)
						////if (tunes[tuneId]) {
							////console.log('have tune ',filesToSave[tuneId],tunes[tuneId].files)
							////var fileKey = filesToSave[tuneId]
							
						////}
					////})
					//Promise.all(promises).then(function(f) {
						////console.log('FINAL LOAD PROMISES',f, "FFF",final)
						//f.forEach(function(fileData) {
							////console.log('SET FILE ',fileData)
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
			//console.log('find folder in drive')
				var xhr = new XMLHttpRequest();
				xhr.onload = function (res) {
					if (res.target.responseText) {
						var response = JSON.parse(res.target.responseText)
						//console.log('find tunebook folder',response)
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
						//console.log('FOUND tunebook folder',found)
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
	
  function _pollChanges(interval, onChanges, multiplier = 1) {
      //console.log('_DO POLL',multiplier, localStorage.getItem('google_last_page_token'))
      if (!localStorage.getItem('google_last_page_token')) {
        getStartPageToken().then(function() {
          doPollChanges().then(function(res) {
            if (onChanges && Array.isArray(res)) {
				if (res.length > 0) {
					onChanges(res).then(function() {
						pollChanges(interval, onChanges)  
					})
				} else {
					pollChanges(interval, onChanges, (multiplier < 6 ? multiplier + 1 : multiplier))  
				}
            }
            
          })
          //.finally(function() {
            //pollChanges(interval, onChanges)  
          //})
        })
      } else {
        doPollChanges().then(function(res) {
          //console.log('onChanges',onChanges)
          if (onChanges && Array.isArray(res)) {
				if (res.length > 0) {
					onChanges(res).then(function() {
						pollChanges(interval, onChanges)  
					})
				} else {
					pollChanges(interval, onChanges, (multiplier < 6 ? multiplier + 1 : multiplier))  
				}
			}
        })
        //.finally(function() {
            //pollChanges(interval, onChanges)  
        //})
      }
    }
  
  function pollChanges(interval, onChanges, multiplier = 1) {
    // min 4 sec
    var useInterval = interval > 4000 ? interval : 15000
    //console.log('POLL',useInterval , interval, multiplier)
    clearTimeout(pollChangesTimeout.current) 
    pollChangesTimeout.current = setTimeout(function() {_pollChanges(interval,onChanges, multiplier)}, useInterval) // * multiplier/3)
    return 
  }
  
  function stopPollChanges() {
    clearTimeout(pollChangesTimeout.current)  
  }
  
  function getStartPageToken() {
    return new Promise(function(resolve,reject) {
      //console.log('get rec' ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      var online = isOnline()
      //console.log('get start token' ,accessToken, online)
      if (accessToken && online) {
        var url = 'https://www.googleapis.com/drive/v3/changes/startPageToken'
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          if (postRes.data && postRes.data.startPageToken) localStorage.setItem('google_last_page_token',postRes.data.startPageToken)
          //console.log(postRes)
          resolve(postRes.data)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  //console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
			//console.log('DO POLL' ,accessToken, localStorage.getItem('google_last_page_token'))
			if (pausePolling && pausePolling.current) {
				resolve()
			} else {
				if (localStorage.getItem('google_last_page_token') && accessToken) {
					//console.log('REALLY DO POLL token ',accessToken)
					var url = 'https://www.googleapis.com/drive/v3/changes?pageToken=' + localStorage.getItem('google_last_page_token')
					axios({
						method: 'get',
						url: url,
						headers: {'Authorization': 'Bearer '+accessToken},
					}).then(function(postRes) {
						//console.log('CHANGES',postRes)
						if (postRes && postRes.data && postRes.data.newStartPageToken) {
						  localStorage.setItem('google_last_page_token',postRes.data.newStartPageToken)
						}
						if (postRes && postRes.data && Array.isArray(postRes.data.changes) && postRes.data.changes.length > 0) {
						  resolve(postRes.data.changes)
						} else {
							//console.log('no data')
							//stopPollChanges()
							//refresh()
							resolve([])
						} 
					}).catch(function(e) {
						console.log('axios err', e)
						if (e && e.response && e.response.status == '401') {
							  console.log('LOGOUT ON AUTH TOKEN FAIL')
							  logout()
						}
						resolve()
					})
				} else {
					console.log('no token or last page token')
					//stopPollChanges()
					resolve()
				}
			}
		})
	}

  function findDocument(title) {
    return new Promise(function(resolve,reject) {
      //console.log('find rec',title ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (title && accessToken) {
        var filter = "?q="+ encodeURIComponent("name='"+title+"'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
        var url = 'https://www.googleapis.com/drive/v3/files' + filter
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //console.log(postRes)
          resolve(postRes.data)
        }).catch(function(e) {
          //getToken()
          //refresh()
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('get public rec',id ,accessToken)
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
          console.log("USE GOT public DOC",postRes)
        }).catch(function(e) {
          console.log(e)
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('get rec',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          console.log("USE GOT DOC",postRes)
          resolve(postRes.data)
          
        }).catch(function(e) {
          console.log(e)
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('export rec',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //console.log("export GOT DOC",postRes)
          resolve(postRes.data)
          
        }).catch(function(e) {
          console.log(e)
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('get g bloib',id ,accessToken)
      var useToken = force_token ? force_token : (token ? token.access_token : null)
      if (id && useToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+useToken},
          responseType: 'blob'
        }).then(function(postRes) {
          console.log("USE GOT DOC blob",postRes)
          resolve(postRes.data)
          
        }).catch(function(e) {
          console.log(e)
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
		  }
          //getToken()
          //refresh()
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve({error: 'missing token'})
      }
    })
  }
  
  function getDocumentMeta(id) {
    return new Promise(function(resolve,reject) {
      //console.log('get rec meta',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id  + '?fields=modifiedTime,name,kind,fileExtension,mimeType,exportLinks,thumbnailLink,size,id,description,trashed,explicitlyTrashed', //&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
          console.log("DOCUMENT META",postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
  
   function createDocument(title, documentData, documentType='application/vnd.google-apps.document', documentDescription='', documentFolderId = null, force_token = null) {
    return new Promise(function(resolve,reject) {
		var useToken = force_token ? force_token : (token ? token.access_token : null)
      console.log('create google doc' ,token,useToken, 'T:',title, 'Y:',documentType, 'D:',documentDescription, 'F:',documentFolderId)
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
          console.log('created',postRes)
			if (postRes && postRes.data && postRes.data.id) {
				if (documentData ) {
				  updateDocumentData(postRes.data.id, documentData, useToken).then(function(updated) {
					//onLogin("")
					console.log('created updated',updated)
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
            console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('update',id,metaData)
      if (id && accessToken) {
          axios({
            method: 'patch',
            url: 'https://www.googleapis.com/drive/v3/files/'+id+"?alt=json",
            data: metaData,
            headers: {'Authorization': 'Bearer '+accessToken},
          }).then(function(postRes) {
            //googleSheetId.current = postRes.data.id
            //console.log('updated title',postRes)
            localStorage.setItem('google_last_page_token','')
            resolve()
          }).catch(function(e) {
            console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('trigger  update data ', id,data, "L",accessToken,"K", token)
      if (id && useToken) {
        
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
          headers: {'Authorization': 'Bearer '+useToken},
          data: data,
        }).then(function(postRes) {
          //console.log('updated',postRes.data  )
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
          console.log(e)
          if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      console.log('trigger delete ', id, accessToken)
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v2/files/'+id,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          console.log('deleted',postRes.data  )
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
		  }
          resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
      }
    })
  }
  
  function addPermission(id,permissionData) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger rec update ', id,data, accessToken)
      if (id && accessToken) {
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions",
          headers: {'Authorization': 'Bearer '+accessToken},
          data: permissionData,
        }).then(function(postRes) {
          //console.log('add perm',postRes  )
          resolve(postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('trigger rec update ', id,data, accessToken)
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions",
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //console.log('get perm',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('trigger rec update ', id,data, accessToken)
      if (id && accessToken) {
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions/"+permissionId,
          headers: {'Authorization': 'Bearer '+accessToken},
          data: permissionData,
        }).then(function(postRes) {
          //console.log('update perm',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
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
      //console.log('trigger rec update ', id,data, accessToken)
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+"/permissions/"+permissionId,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //console.log('del perm',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
			console.log(e)
			if (e && e.response && e.response.status == '401') {
			  console.log('LOGOUT ON AUTH TOKEN FAIL')
			  logout()
			}
			resolve({error: e})
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  return {findTuneBookFolderInDrive, getPublicDocument, findDocument, getDocument,getDocumentBlob,  getDocumentMeta, updateDocument,updateDocumentData, createDocument, deleteDocument, pollChanges, stopPollChanges, addPermission, listPermissions, updatePermission, deletePermission, exportDocument}
  
}
