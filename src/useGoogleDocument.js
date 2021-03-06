import axios from 'axios'
import {useRef, useEffect} from 'react'

export default function useGoogleDocument(token, refresh, onChanges, pausePolling, pollInterval) {
//console.log('use g doc',token)
  var accessToken = token ? token.access_token : null
  var pollChangesInterval = useRef(null)
     
  useEffect(function() {
    //console.log('use doc tok change',onChanges, token)
    if (token && token.access_token && onChanges) {
      //console.log('use doc tok change have changes fn start poll')
      pollChanges(pollInterval, onChanges)
    }
    return function() {
      //console.log('use doc unload')
      stopPollChanges()
    }
  },[token])
  
  function pollChanges(interval, onChanges) {
    var useInterval = interval > 4000 ? interval : 15000
    //console.log('POLL',useInterval , interval, pollInterval)
    clearInterval(pollChangesInterval.current) 
    pollChangesInterval.current = setInterval(function() {
      //console.log('DO POLL',localStorage.getItem('google_last_page_token'))
      if (!localStorage.getItem('google_last_page_token')) {
        getStartPageToken().then(function() {
          doPollChanges().then(function(res) {
            if (onChanges && Array.isArray(res) && res.length > 0) onChanges(res)
          })
        })
      } else {
        doPollChanges().then(function(res) {
          //console.log('onChanges',onChanges)
          if (onChanges && Array.isArray(res) && res.length > 0) onChanges(res)
        })
      }
    }, useInterval)
    return 
  }
  
  function stopPollChanges() {
    clearInterval(pollChangesInterval.current) 
  }
  
  function getStartPageToken() {
    return new Promise(function(resolve,reject) {
      //console.log('get rec' ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
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
        //console.log('REALLY DO POLL')
        if (localStorage.getItem('google_last_page_token') && accessToken) {
          var url = 'https://www.googleapis.com/drive/v3/changes?pageToken=' + localStorage.getItem('google_last_page_token')
          axios({
            method: 'get',
            url: url,
            headers: {'Authorization': 'Bearer '+accessToken},
          }).then(function(postRes) {
            //console.log(postRes)
            if (postRes.data && postRes.data.newStartPageToken) {
              localStorage.setItem('google_last_page_token',postRes.data.newStartPageToken)
            }
            if (postRes.data) {
              resolve(postRes.data.changes)
            } else {
               resolve()
            } 
          }).catch(function(e) {
            resolve()
          })
        } else {
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
        var filter = "?q="+ encodeURIComponent("name='ABC Tune Book'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
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
          //https://drive.google.com/u/0/uc?id=1ob9DTfROfBzIzON2cnIceQtmynt14Gnl&export=download
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'/export?mimeType='+mimeType+'&nocache='+String(parseInt(Math.random()*1000000000))
          //url: 'https://drive.google.com/file/d/'+id+'/view?usp=sharing',
          //headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
          //console.log("USE GOT public DOC",postRes)
        }).catch(function(e) {
          console.log(e)
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
          //console.log("USE GOT DOC",postRes)
          resolve(postRes.data)
          
        }).catch(function(e) {
          console.log(e)
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
  
  function getDocumentBlob(id) {
    return new Promise(function(resolve,reject) {
      //console.log('get rec',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media'+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
          responseType: 'blob'
        }).then(function(postRes) {
          //console.log("USE GOT DOC blob",postRes)
          resolve(postRes.data)
          
        }).catch(function(e) {
          console.log(e)
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
  
  function getDocumentMeta(id) {
    return new Promise(function(resolve,reject) {
      //console.log('get rec meta',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'&nocache='+String(parseInt(Math.random()*1000000000)),
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          resolve(postRes.data)
          //console.log(postRes)
        }).catch(function(e) {
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
  
  function createDocument(title, documentData, documentType='vnd.google-apps.document', documentDescription='') {
    return new Promise(function(resolve,reject) {
      //console.log('create google doc' ,token,accessToken, documentType, title)
      if (documentType && title && accessToken) {
        var  data = {
          "description": documentDescription,
          "kind": "drive#file",
          "name": title,
          "mimeType": documentType //"vnd.google-apps.spreadsheet"
        }
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files',
          data: data,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //googleSheetId.current = postRes.data.id
          //console.log('created',postRes)
          updateDocumentData(postRes.data.id, documentData).then(function(updated) {
            //onLogin("")
            //console.log('created',updated)
            localStorage.setItem('google_last_page_token','')
            resolve(postRes.data.id)
          }).catch(function(e) {
            //getToken()
            resolve()
          })
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
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
            resolve()
          })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  

  function updateDocumentData(id,data) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger  update data ', id,data, "L",accessToken,"K", token)
      if (id && accessToken) {
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
          headers: {'Authorization': 'Bearer '+accessToken},
          data: data,
        }).then(function(postRes) {
          //console.log('updated',postRes.data  )
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
          console.log(e)  
          resolve()
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function deleteDocument(id) {
    return new Promise(function(resolve,reject) {
      //console.log('trigger sheet delete ', id, accessToken)
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v2/files/'+id,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          //console.log('deleted',postRes.data  )
          localStorage.setItem('google_last_page_token','')
          resolve(postRes)
        }).catch(function(e) {
          resolve()
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
          resolve()
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
          resolve()
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
          resolve()
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
          resolve()
        })
      } else {
        if (refresh && !accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  return {getPublicDocument, findDocument, getDocument,getDocumentBlob,  getDocumentMeta, updateDocument,updateDocumentData, createDocument, deleteDocument, pollChanges, stopPollChanges, addPermission, listPermissions, updatePermission, deletePermission}
  
}
