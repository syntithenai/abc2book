import {useRef, useState, useEffect} from 'react'
//import axios from 'axios'
import useUtils from './useUtils'

export default function useSyncWorker(tokenT, logout, tuneBookName) {

	
	var myWorker = useRef(null)
	var [isRunning, setIsRunning] = useState(false)
  
	var token = tokenT ? tokenT.access_token : null
  
    function createWorker(fn) {
	  var blob = new Blob(['var tuneBookName=' + (tuneBookName ? '"'+tuneBookName+'"' : '') + '; var token=null; self.onmessage = ',fn.toString()], { type: 'text/javascript' });
	  var url = URL.createObjectURL(blob);
	  var w = new Worker(url);
	  w.onmessage = function onmessage(e) {
		  if (e.data && e.data === 'running=false') {
			  setIsRunning(false)
		  } else if (e.data && e.data === 'running=true') {
			  setIsRunning(true)
		  } 
		}
	  return w
	}
		
	
	
	var workerFunction = function (e) {
		var isRunning = false; 
		var db = null
		
		function dataURItoBlob(dataURI, mime = 'image/jpeg') {
			var binary = null
			try {
				binary = atob(dataURI.split(',')[1]);
				var array = [];
				for(var i = 0; i < binary.length; i++) {
					array.push(binary.charCodeAt(i));
				}
				return new Blob([new Uint8Array(array)], {type: mime});
			} catch (e) {
				console.log(e)
				return new Blob([], {type: mime});
			}
		}
		
		async function saveFile(doc) {
			if (db && doc.id) {
				var transaction = db.transaction(["keyvaluepairs"], "readwrite");
				// Get the object store
				var objectStore = transaction.objectStore("keyvaluepairs");
				const getRequest = objectStore.get(doc.id);
				getRequest.onerror = (event) => {
				  // Handle errors!
				  console.log('ERROR GET',event)
				};
				getRequest.onsuccess = (event) => {
				  // Get the old value that we want to update
				    const data = event.target.result;
					console.log('SUCCESS GET',event, data)
					if (data && data.id) {
						const requestUpdate = objectStore.put(doc, doc.id);
						requestUpdate.onerror = (event) => {
							// Do something with the error
							console.log('ERROR PUT',event, doc)
						};
					} else {
						const requestInsert = objectStore.add(doc);
						requestInsert.onerror = (event) => {
							// Do something with the error
							console.log('ERROR ADD',event, doc)
						};
					}
				}
			}
		}
		
		async function deleteFile(doc) {
			if (db && doc.id) {
				var transaction = db.transaction(["keyvaluepairs"], "readwrite");
				// Get the object store
				var objectStore = transaction.objectStore("keyvaluepairs");
				const deleteRequest = objectStore.delete(doc.id);
				deleteRequest.onerror = (event) => {
				  // Handle errors!
				  console.log('ERROR GET',event)
				};
			}
		}
		
		function syncDocument(doc) {
			
			if (token) {
				if (doc && doc.id) {
					if (doc.deleted) {
						if (doc.googleId) {
							gDelete(doc.googleId).then(function(docData) {
								deleteFile(doc)
							})
						}
					} else {
						if (doc.googleId) {
							// load missing from google
							if (!doc.data) {
								console.log('LOAD',doc)
								gGetBlob(doc.googleId).then(function(docData) {
									doc.data = docData
									saveFile(doc).then(function() {
											console.log('SAVED blob')
										})
								})
							} else {
								// load out of date from google
								console.log('OK check dates',doc)
								gGetMeta(doc.googleId).then(function(meta) {
									console.log('meta',meta)
									if (meta) {
										var localDate = new Date(doc.googleModifedTime)
										var remoteDate = new Date(meta.modifedTime)
										// date compare
										if (remoteDate > localDate) {
											//load document
											gGetBlob(doc.googleId).then(function(docData) {
												doc.data = docData
												saveFile(doc).then(function() {
													console.log('SAVED blob')
												})
											})
										}
									// not found trashed
									} else {
										console.log('Delete remotely trashed file locally',doc)
										deleteFile(doc).then(function() {
											console.log('deleted local file')
										})
									}
								})
							}
						} else {
							if (doc.data) {
								gCreateFile(doc).then(function(created) {
									gGetMeta(created).then(function(meta) {
										if (created && meta) {
											doc.googleId = created
											doc.googleModifedTime = meta.modifiedTime
											saveFile(doc)
										}
									})
								}) 
							}
						}	
					}
				}
			}
		}
		
		
		function findAllDocumentsInFolder(googleFolderId) {
				return new Promise(function(resolve,reject) {
					if (!token) resolve(null)
					console.log('find folder in drive',googleFolderId)
						var xhr = new XMLHttpRequest();
						xhr.onload = function (res) {
							if (res.target.responseText) {
								var response = JSON.parse(res.target.responseText)
								console.log('search tunebook folder', googleFolderId, response)
								var promises = []
								if (response && response.files) {
									 response.files.filter(function(d) { return d && d.id }).forEach(function(d) {
										 promises.push(new Promise(function(resolve, reject) {
											 gGetMeta(d.id).then(function(meta) {
												resolve(meta) 
											 }) 
										 }))
									 })
								}
								Promise.all(promises).then(function(final) {
									console.log("final",final)
								})
								//console.log(ids)
								
							}
						};
						//and trashed=false and 
						var filter = "?q="+ encodeURIComponent("'"+googleFolderId+"' in parents") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
						xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter) //+'&nocache='+String(parseInt(Math.random()*1000000000)));
						xhr.setRequestHeader('Authorization', 'Bearer ' + token);
						xhr.send();
				})
			}	
		
		
			function findTuneBookFolderInDrive(tuneBookName) {
				return new Promise(function(resolve,reject) {
					if (!token) resolve(null)
					//console.log('find folder in drive')
						var xhr = new XMLHttpRequest();
						xhr.onload = function (res) {
							if (res.target.responseText) {
								var response = JSON.parse(res.target.responseText)
								console.log('find tunebook folder',tuneBookName, token, response)
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
								console.log('FOUND tunebook folder',found)
								if (found) {
									resolve(found)
								} else {
									createDocument(tuneBookName,null, 'application/vnd.google-apps.folder','Folder for '+tuneBookName+' data').then(function(newId) {
										resolve(newId)
									})
								}
							}
						};
						var filter = "?q="+ encodeURIComponent("name='"+tuneBookName+"' and mimeType = 'application/vnd.google-apps.folder' and trashed=false") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
						xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter+'&nocache='+String(parseInt(Math.random()*1000000000)));
						xhr.setRequestHeader('Authorization', 'Bearer ' + token);
						xhr.send();
				})
			}			
						
		   function createDocument(title, documentData, documentType='', documentDescription='', documentFolderId = null) {
			   // application/vnd.google-apps.document
			return new Promise(function(resolve,reject) {
				//var useToken = force_token ? force_token : (token ? token.access_token : null)
				var persistToken = token + ''
			  console.log('create google doc' ,token, 'T:',title, 'Y:',documentType, 'D:',documentDescription, 'F:',documentFolderId)
			  //if (documentType && title && useToken) {
				var  data = {
				  "description": documentDescription,
				  "kind": "drive#file",
				  "name": title,
				  "mimeType": documentType //"vnd.google-apps.spreadsheet"
				}
				if (documentFolderId) data.parents = [documentFolderId]
				
				if (token) {
					var xhr = new XMLHttpRequest();
					xhr.open('POST', 'https://www.googleapis.com/drive/v3/files', true);
					xhr.setRequestHeader('Authorization', 'Bearer '+token);
					xhr.onload = function() {
						if (xhr.status >= 200 && xhr.status < 300) {
							var newFile = JSON.parse(xhr.response)
							console.log("AAA",newFile)
							if (documentData ) {
								updateDocumentData(persistToken, newFile.id, documentData).then(function(updated) {
									// Request was successful, send the response data back to the main thread
									e.target.postMessage('Create request successful');
									resolve(newFile.id)
								})
							} else {
								// Request was successful, send the response data back to the main thread
								e.target.postMessage('Create request with no data successful');
								resolve(newFile.id)
							}
						} else {
							// Request failed
							e.target.postMessage('Create request failed with status: ' + xhr.status);
							resolve({error:xhr.error})
						}
						//localStorage.setItem('google_last_page_token','')
					};
					xhr.onerror = function() {
						// Request failed
						e.target.postMessage('Create request failed');
						resolve({error:xhr.error})
					};
					xhr.send(JSON.stringify(data));
				} else {
					resolve({error:'No token'})
				}
			})
		  }
		  
		function updateDocumentData(token, id, data) {
			return new Promise(function(resolve, reject) {
				if (id && token) {
					var xhr = new XMLHttpRequest();
					xhr.open('PATCH', 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media');
					xhr.setRequestHeader('Authorization', 'Bearer ' + token);
					xhr.setRequestHeader('Content-Type', 'application/json');
					xhr.onload = function() {
						if (xhr.status === 200) {
							resolve(JSON.parse(xhr.responseText));
						} else {
							resolve({ error: 'Error updating document' });
						}
					};
					xhr.onerror = function() {
						reject(xhr.statusText);
					};
					xhr.send(dataURItoBlob(data));
				} else {
					resolve();
				}
			});
		}
		  
						
		function gCreateFile(doc,accessToken) {
			return new Promise(function(resolve,reject) {
				findTuneBookFolderInDrive(tuneBookName).then(function(tunebookFolderId) {
						createDocument(doc.name, doc.data, doc.type, doc.tuneId , tunebookFolderId).then(function(newDocId) {
							console.log('created dome ',newDocId)
							resolve(newDocId)
						})
				})
			})
		}
		
		async function gDelete(id) {
			if (id && token) {
				var xhr = new XMLHttpRequest();
				xhr.open('DELETE', 'https://www.googleapis.com/drive/v2/files/'+id, true);
				xhr.setRequestHeader('Authorization', 'Bearer ' + token);
				
				xhr.onload = function() {
					if (xhr.status >= 200 && xhr.status < 300) {
						// Request was successful, send the response data back to the main thread
						e.target.postMessage('Delete request successful');
						return true
					} else {
						// Request failed
						e.target.postMessage('Delete request failed with status: ' + xhr.status);
						return false
					}
					localStorage.setItem('google_last_page_token','')
				};
				
				xhr.onerror = function() {
					// Request failed
					e.target.postMessage('Delete request failed');
					return false
				};
				
				xhr.send();
		  }
		}
		
		async function gGetBlob(id) {
			if (id && token) {
				var xhr = new XMLHttpRequest();
				xhr.open('GET', 'https://www.googleapis.com/drive/v3/files/'+id  + '?alt=media', true);
				xhr.setRequestHeader('Authorization', 'Bearer ' + token);
				xhr.responseType = 'blob';
				
				xhr.onload = function() {
					if (xhr.status >= 200 && xhr.status < 300) {
						// Request was successful, send the response data back to the main thread
						return xhr.response
						e.target.postMessage('Get request successful');
					} else {
						// Request failed
						e.target.postMessage('Get request failed with status: ' + xhr.status);
					}
				};
				
				xhr.onerror = function() {
					// Request failed
					e.target.postMessage('Get request failed');
				};
				
				xhr.send();
		  }
		}
		
		function gGetMeta(id) {
			console.log("get meta",id, token)
			return new Promise(function(resolve,reject) {
				if (id && token) {
					var xhr = new XMLHttpRequest();
					xhr.open('GET', 'https://www.googleapis.com/drive/v3/files/'+id  + '?fields=modifiedTime,name,kind,fileExtension,mimeType,exportLinks,thumbnailLink,size,id,description,trashed,explicitlyTrashed', true);
					xhr.setRequestHeader('Authorization', 'Bearer ' + token);
					xhr.responseType = 'json';
					
					xhr.onload = function() {
						if (xhr.status >= 200 && xhr.status < 300) {
							// Request was successful, send the response data back to the main thread
							e.target.postMessage('Get meta request successful');
							if (xhr.response && !xhr.response.explicitlyTrashed) {
								console.log("meta success", xhr.response, xhr)
								resolve(xhr.response)
							} else {
								console.log("meta trashed", xhr.response, xhr)
								resolve()
							}
								
						} else {
							// Request failed
							console.log("meta fail")
							e.target.postMessage('Get meta request failed with status: ' + xhr.status);
							resolve()
						}
					};
					
					xhr.onerror = function() {
						// Request failed
						console.log("meta fail2")
						e.target.postMessage('Get meta request failed');
						resolve()
					};
					
					xhr.send();
				}
			})
		}
		
		//console.log("|"+token+"|")
		if (e.data.startsWith('token=')) {
			token = e.data.slice(6)
		} else if (token && token !== 'null' && e.data === 'start' && !isRunning) { // accessToken
			findTuneBookFolderInDrive(tuneBookName).then(function(tunebookFolderId) {
				findAllDocumentsInFolder(tunebookFolderId).then(function(googleDocsInFolder) {
					console.log("Loaded folder docs:", googleDocsInFolder);
					isRunning = true
					e.currentTarget.postMessage('running=true');
					var request = e.target.indexedDB.open("files", 2);

					request.onerror = function(event) {
						console.log("Error opening database:", event, event.target.errorCode);
					};

					request.onsuccess = function(event) {
						db = event.target.result;
						var transaction = db.transaction(["keyvaluepairs"], "readonly");
						// Get the object store
						var objectStore = transaction.objectStore("keyvaluepairs");
						// Open a cursor to iterate through the records
						var cursorRequest = objectStore.openCursor();

						cursorRequest.onsuccess = function(event) {
							var cursor = event.target.result;

							if (cursor) {
								console.log('CURSOR',cursor)
								syncDocument(cursor.value)
								cursor.continue();
							} else {
								// No more records, now download missing files
								// TODO FINAL SWEEP OF ALL FILES STORE IN GOOGLE IN CORRECT FOLDER
								isRunning = false
								e.currentTarget.postMessage('running=false');
							}
						};

						cursorRequest.onerror = function(event) {
							console.log("Error retrieving data:", event.target.errorCode);
							isRunning = false
							e.currentTarget.postMessage('running=false');
						};
					};

					request.onupgradeneeded = function(event) {
						// If the database hasn't been created yet, create it and define the object store
						var db = event.target.result;
						var objectStore = db.createObjectStore("keyvaluepairs", { keyPath: "id" });
						console.log("Database and object store created.");
					};
					
				})
			})
		} else {
			//console.log(!token ? "Missing token" : (isRunning ? "Already running" : "Invalid request") , isRunning, token, e.data)
		}
	}
	
	
	
	
	//useEffect(function() {
		//if (!myWorker.current) {
			//myWorker.current = createWorker(workerFunction);
			//setInterval(function() {
				//myWorker.current.postMessage('start')
			//},10000)
		//}
	//},[])
	
	//useEffect(function() {
		//if (myWorker.current) {
			//myWorker.current.postMessage('token='+token)
		//}
	//},[token])
	
	return {createWorker, isRunning}
}





		//function gGet(id, cb) {
			//if (id && token) {
				//var xhr = new XMLHttpRequest();
				//xhr.open('GET', 'https://www.googleapis.com/drive/v3/files/'+id  + '?alt=media', true);
				//xhr.setRequestHeader('Authorization', token);
				//xhr.onload = function() {
					//if (xhr.status >= 200 && xhr.status < 300) {
						//// Request was successful, send the response data back to the main thread
						//cb(xhr.responseText)
						//e.target.postMessage('Get request successful');
					//} else {
						//// Request failed
						//e.target.postMessage('Get request failed with status: ' + xhr.status);
					//}
				//};
				//xhr.onerror = function() {
					//// Request failed
					//e.target.postMessage('Get request failed');
				//};
				//xhr.send();
		  //}
		//}
		
