import * as localForage from "localforage";
import {useState, useEffect, useRef} from 'react'
import useGoogleDocument from './useGoogleDocument'
import useUtils from './useUtils'
import MP3Converter from './MP3Converter'

export default function useFileManager(storeName = 'files', token, logout, tune = null, allowMimeTypes=null, loadData = false, filterByTuneId = true) {
  //console.log(storeName, allowMimeTypes)
	var [files, setFiles] = useState([])
	var [filter, setFilter] = useState('')
	var [filtered, setFiltered] = useState([])
	var tuneId = tune ? tune.id : null
	var tuneName = tune ? tune.name : null
	var store = localForage.createInstance({
		name: storeName
	});
	var docs = useGoogleDocument(token, logout)
	var utils = useUtils()
	var [warning, setWarning] = useState('')

	

	function allowMime(mimeFragment) {
		//console.log('allowMime',mimeFragment)
		const mimeFragmentParts = mimeFragment.trim().split("/")
		var found = false;
		if (Array.isArray(allowMimeTypes)) {
			if (mimeFragment && mimeFragment.trim().length > 0 ) {
				allowMimeTypes.forEach(function(allowedMime) {
					const allowedMimeParts = allowedMime.trim().split("/")
					if (allowedMimeParts.length == 2) {
						if (allowedMimeParts[1] === '*') {
							if (mimeFragmentParts[0] == allowedMimeParts[0]) {
								found = true
							}
						} else {
							if (mimeFragment.trim() === allowedMime.trim()) {
								found = true
							}
						}
					}
				})
				//console.log('allowMime',found)
				return found
			} else {
				//console.log('allowMime',false)
				return false
			}
			
		}
		//console.log('allowMime',true)
		return true
	}
	async function refresh() {
		console.log('refresh',tuneId)
		//if (tuneId) {
			search(null, tuneId).then(function(res) {
				return updateFiles(res)
			})
		//}
	}
	useEffect(function() {
		console.log('INIT',tuneId, filterByTuneId)
		if (tuneId || !filterByTuneId) {
			search(null, tuneId).then(function(res) {
				console.log('INIT ff',tuneId, res)
				updateFiles(res)
				//setFiltered(res.filter(function(file) {
					//return (file && file.name && file.name.toLowerCase().indexOf(filter.toLowerCase) !== -1) ? true : false
				//}))
			})
		}
	},[tuneId])
	
		
	var [filterTimeout, setFilterTimeout] = useState(null)
	useEffect(function() {
		console.log('filter change')
		if (files) {
			//clearTimeout(filterTimeout)
			//setFilterTimeout(setTimeout(function() {
				runFilter(filter, files)
			//}, 500))
		}
	},[filter])
	
	
	
	function runFilter(filter, files) {
		//console.log('FILTER',filter, files)
		if (files) {
			var nf = files.filter(function(file) {
				return (!filter || (file && file.name && file.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1)) ? true : false
			}).sort(function(a,b) {
				return (a.updatedTimestamp > b.updatedTimestamp) ? -1 : 1
			})
			console.log('FILTERED',nf)
			setFiltered(nf)
		}
	}
	

	
	function addFiles(filesToAdd, resetFilter = true) {
		console.log('add', filesToAdd, resetFilter)
		if (Array.isArray(filesToAdd)) {
			var newFiles = files
			filesToAdd.forEach(function(file) {
				if (file) newFiles.push(file)
			})
			setFiles(newFiles)
			if (resetFilter) {
				setFilter('')
				console.log()
				runFilter('', newFiles) 
			} else {
				runFilter(filter, newFiles)
			}
		}
		return files
	}
	
	function updateFiles(files, resetFilter = true) {
		console.log('updatefiles',files,resetFilter)
		setFiles(files)
		if (resetFilter) {
			setFilter('')
			runFilter('', files)
		} else {
			runFilter(filter, files)
		}
		return files
	}
	
	
	function scrapeUrl(url) {
		return new Promise(function(resolve,reject) {
			console.log('scrape',url)
			if (url) {
				var xhr = new XMLHttpRequest();
				xhr.responseType = 'blob';

				xhr.onload = function (res) {
					
					console.log("SCRAPED",res)
					const type = res && res.target && res.target.response ? res.target.response.type : ''
					console.log("SCRAPED TYPE",type)
					if (xhr.response && type)  {
						utils.blobToBase64(xhr.response).then(function(b64) {
							resolve({b64,type})
						})
					} else {
						resolve(null)
					}
					//setWaiting(null)
				};
				xhr.onerror = function(err) {
					console.log(err)
					resolve(null)
				}
				//setWaiting(true)
				xhr.open('GET', url);
				xhr.send();
			}
		})
  }  
  
	function pasteFiles() {
		console.log('paste',token)
		return new Promise(function(resolve,reject) {
			var files = []
			var promises = []
			setWarning('')
			navigator.clipboard
			  .read()
			  .then(
				(clipItems) => {
					if (clipItems) {
						clipItems.forEach(function(item, i) {
							promises.push(new Promise(function(resolve2,reject2) {
								item.types.forEach(function(type) {
									item.getType(type).then(function(t) {
										// TODO currently ignored  || type === 'text/html'
										if (type === 'text/plain' ) {
											utils.blobToText(t).then(function(a) {
												var foundLink = false
												a.split("/n").forEach(function(line) {
													if (line.trim().startsWith('http://') || line.trim().startsWith('https://')) {
														foundLink = true
														console.log("FFFFFFFFFFFFF PRE",line)
														scrapeUrl(line.trim()).then(function(f) {
															console.log("FFFFFFFFFFFFF",f)
															if (f) {
																resolve2({id: utils.generateObjectId(), name: line, type: f.type, data: f.b64, tuneId: tuneId, tuneName: tuneName})
															} else {
																setWarning("Failed to load")
																resolve(null)
															}
														})
													
													}
												})
												if (!foundLink && allowMime('text/plain')) {
													const id = utils.generateObjectId()
													resolve2({id: id, name: 'pasted text ' + id , type: type, data: a, tuneId: tuneId, tuneName: tuneName})
												}
											})
													
										} else if (type.indexOf('image/') === 0 && allowMime('image/')) {
											utils.blobToBase64(t).then(function(a) {
												const id = utils.generateObjectId()
												resolve2({id: id, name: 'pasted image ' + id , type: type, data: a, tuneId: tuneId, tuneName: tuneName})
											})
										
										} else if (type !== 'text/html' && allowMime(type)) {
											utils.blobToBase64(t).then(function(a) {
												const id = utils.generateObjectId()
												resolve2({id: id, name: 'pasted file ' + id , type: type, data: a, tuneId: tuneId, tuneName: tuneName})
											})
										}
										//console.log(t, type, item)
									})
								})
							}))
						})
						console.log("PPP",promises)
						Promise.all(promises).then(function(newFiles) {
							if (Array.isArray(newFiles)) {
								var savePromises = []
								newFiles.forEach(function(file) {
									savePromises.push(new Promise(function(resolve,reject) {
										save(file).then(function(newFile) {
											resolve(newFile)
										})
									}))
								})
								Promise.all(savePromises).then(function(newFiles) {
									console.log("NdF", newFiles)
									resolve(addFiles(newFiles))
								})
							}
						}) 
					}
				},
			);
		})
		
	}

	
	function filesSelected(e) {
		//console.log('ssss files selected', e.target.files)
		if (e.target.files) {
			var files = []
			var promises = []
			Array.from(e.target.files).forEach(function(file) {
				console.log(file)
				// UNZIP MUSIC XML FILE
				if (file && file.name && file.name.trim().toLowerCase().endsWith(".mxl")) {
					if (allowMime('application/musicxml')) {
						//console.log('file selected')
						promises.push(new Promise(function(resolve,reject) {
							utils.readFileAsArrayBuffer(file).then(function(b) {
								//console.log(b)
								utils.unzipBlob(b).then(function(entries) {
									//console.log(entries)
									entries['score.xml'].blob('application/xml').then(function (blob) {
										//console.log('read score',blob)
										utils.blobToText(blob).then(function(text) {
											//console.log('read score',text)
											resolve({id: utils.generateObjectId(), name: file.name + ".musicxml", type: 'application/musicxml', data: text, tuneId: tuneId, tuneName: tuneName})
										})
									})
								})
							})
						}))
					} else {
						setWarning("File type application/musicxml is not allowed")
					}
				
				}  else if (file && file.type && file.type === "text/plain") {
					if (allowMime(file.type) ) {
						console.log('file selected read b64')
						promises.push(new Promise(function(resolve,reject) {
							utils.readFileAsText(file).then(function (res) {
								resolve({id: utils.generateObjectId(), name: file.name, type: file.type, data: res, tuneId: tuneId, tuneName: tuneName})
							})
						}))
					} else {
						setWarning("File type text/plain is not allowed")
					}
				// READ FILE AS BASE64
				} else {
					console.log('file selected read b64')
					if (file && allowMime(file.type)) {
						promises.push(new Promise(function(resolve,reject) {
							utils.readFileAsBase64(file).then(function (res) {
								//var file = res[0]
								//var data = res //[1]
								resolve({id: utils.generateObjectId(), name: file.name, type: file.type, data: res, tuneId: tuneId, tuneName: tuneName})
							})
						}))
					} else {
						setWarning("File type "+file.type+" is not allowed")
					}
				}
			})
			Promise.all(promises).then(function(data) {
				var savePromises = []
				data.forEach(function(newFile) { 
					// TODO SAVE AND CLEAR DATA FIELD
					// two element array 	
					//if (Array.isArray(dataPair) && dataPair.length === 2) {
						//files.push({id: utils.generateObjectId(), tuneId: tune && tune.id ? tune.id : null, name: dataPair[0].name, type: dataPair[0].type, data: dataPair[1]})
					//// full file record from mxl
					//} else if (typeof dataPair === 'object' ) {
					//files.push(newFile)
					//}
					savePromises.push(new Promise(function(resolve,reject) {
						save(newFile).then(function(f) {
							resolve(f)
						})
					}))
				})
				Promise.all(savePromises).then(function(finalFiles) {
					console.log("add selected files", finalFiles)
					addFiles(finalFiles)
				})
			})
		}
	}
	async function doDeleteFile(file) {
		//console.log("DOdelete", file)
		if (file && file.id) {
			file.deleted = true
			file.data  = null
			await store.setItem(file.id, file)
			
			//.then(function (item) {
				//console.log("DOdelete removed")
			    //if (token) {
					//docs.deleteDocument(file.googleId).then(function() {
						////console.log("DOdelete removed google")
						//search(null, tuneId).then(function(res) {
							//console.log('REFRESH AFTER DELETE',res)
							//updateFiles(res)
							//return null;
						//})
					//})
					
				//} else {
					search(null, tuneId).then(function(res) {
						console.log('REFRESH AFTER DELETE',res)
						updateFiles(res)
						return null;
					})
					return null;
				//}
			//})
		} else {
			return null;
		}
	}
	
	async function deleteFile(file, fileKey){
		//console.log("delete", file,fileKey,JSON.parse(JSON.stringify(files)))
		var m = file.name ? "Really delete the file " + file.name : 'Really delete this file?'
		if (window.confirm(m)) {
			doDeleteFile(file).then(function() {
				//console.log("done delete", fileKey) //, 'l',files[fileKey])
				//var newFiles = JSON.parse(JSON.stringify(files))
				//if (newFiles[fileKey]) {
					//newFiles.splice(fileKey,1)
					//console.log("done delete", JSON.parse(JSON.stringify(newFiles)))
					//updateFiles(newFiles, false)
				//}
				//console.log("done delete u")
				// update filemanager base files
				updateFiles(files.filter(function(f) {
					if (f & f.id & file.id && file.id == f.id)  {
						return false
					} else {
						return true
					}
				}))
			})
		}
	}
	
	
	
	
 
  async function load(fileId) {
    return new Promise(function(resolve,reject) {
      store.getItem(fileId).then(function (value) {
        resolve(value)
      }).catch(function (err) {
        console.log('err',err)
        resolve({error:err})
      })
    })
  }
  
  function updateFileName(file) {
    return new Promise(function(resolve,reject) {
      if (file && file.id && file.name) {
        file.updatedTimestamp = new Date()
        store.setItem(file.id, file).then(function (item) {
          if (file.googleId && token) {
            docs.updateDocument(file.googleId,{name: file.name}).then(function(newId) {
				// update filemanager base files
				updateFiles(files.map(function(f) {
					if (f & f.id & file.id && file.id == f.id)  {
						return file
					} else {
						return f
					}
				}))
				resolve()
						
            })
          } else {
			 // update filemanager base files
			updateFiles(files.map(function(f) {
				if (f & f.id & file.id && file.id == f.id)  {
					return file
				} else {
					return f
				}
			}))
			resolve()
          }
        }).catch(function (err) {
          console.log('serr',err)
          resolve({error:err})
        });
      } else {
        resolve({error:'Missing id or name'})
      }
    })
  }
  
  
  
function save(file, filteredKey = null) {
	console.log("save",file, token)
	return new Promise(function(resolve,reject) {
		if (file) {
			if (!file.id)  {
				file.id = utils.generateObjectId() 
				file.createdTimestamp = new Date()
			}
			if (tuneId) {
				file.tuneId = tuneId
				file.tuneName = tune ? tune.name : ''
			}
			file.updatedTimestamp = new Date()
			store.setItem(file.id, file).then(function (item) {
				console.log("save set item",item)
				if (token) {
					if (!file.googleId && file.data) {
						console.log("save create gdoc", file.data)
						// plain text and musicxml files hold file data decoded, otherwise convert from b64
						var d = (file.type !== 'text/plain' && file.type !== 'application/musicxml')  ? 
							utils.dataURItoBlob(file.data,file.type) 
							: new Blob([file.data],file.type)
							
						docs.findTuneBookFolderInDrive().then(function(folderId) {
							docs.createDocument(file.name, d ,file.type,'File from TuneBook', folderId).then(function(newId) {
								docs.getDocumentMeta(newId).then(function(meta) {
									console.log('META',meta)
									// update store with googleId
									file.googleId = newId
									file.googleModifiedTime = meta.modifiedTime
									console.log("save create gdoc", newId)
									store.setItem(file.id, file).then(function (item) {
										//delete file.data
										console.log("resolve", file, files, filtered)
										// update filemanager base files
										updateFiles(files.map(function(f) {
											if (f & f.id & file.id && file.id == f.id)  {
												return file
											} else {
												return f
											}
										}))
										
										//search(null, tuneId).then(function(res) {
											//console.log('REFRESH AFTER  SAVE',res)
											//updateFiles(res)
											//resolve(file)
										//})
										
									})
								})
							}).catch(function(err) {
							})
						})
					} else {
						console.log('have gid', file.googleId)
						//docs.updateDocumentData(file.googleId, file.data).then(function(result) {
						//delete file.data
						// update filemanager base files
						updateFiles(files.map(function(f) {
							if (f & f.id & file.id && file.id == f.id)  {
								return file
							} else {
								return f
							}
						}))
						resolve(file)
						//search(null, tuneId).then(function(res) {
								//console.log('REFRESH AFTER  SAVE',res)
								//updateFiles(res)
							//})
							
						//})
					}
				} else {
					//delete file.data
					// update filemanager base files
					updateFiles(files.map(function(f) {
						if (f & f.id & file.id && file.id == f.id)  {
							return file
						} else {
							return f
						}
					}))
					resolve(file)
					
				}
			})
		} else {
			reject('missing file')
		}
	})
}



	function search(titleFilter = null, tuneId = null, noData = true) {
		console.log('search', titleFilter, tuneId)
		return new Promise(function(resolve,reject) {
			var final = []
			store.iterate(function(value, key, iterationNumber) {
				var passedFilters = value.deleted ? false : true
				if (titleFilter && titleFilter.trim().length > 0 && value.name.toLowerCase().indexOf(titleFilter.trim()) === -1) {
				  passedFilters = false
				}
				if (tuneId && filterByTuneId) {
					if (!(value && value.tuneId && value.tuneId === tuneId)) {
						passedFilters = false
					}
				}
				//console.log('searchFF', passedFilters, value, key, iterationNumber)
				if (passedFilters && value) {
					value.bitLength = value.data ? value.data.size : 0
					if (noData && !loadData) delete value.data  // don't return data with list
					final.push(value)
				}
			}).catch(function(err) {
				console.log(err);
				resolve([])
			}).finally(function() {
				//console.log('finaly', final)
				resolve(final)
			})
		})
	}

  
  return {load, updateFileName, deleteFile, save, search, scrapeUrl, pasteFiles, filtered, filesSelected, filter, setFilter, allowMime, addFiles, updateFiles, runFilter, refresh, allowMimeTypes, warning, setWarning, allowMimeTypes}
  
}
