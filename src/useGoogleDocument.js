import axios from 'axios'
import {useRef} from 'react'

export default function useGoogleDocument({token, refresh}) {
//console.log('use g doc',token)
  var accessToken = token ? token.access_token : null
  var pollChangesInterval = useRef(null)
  
  function pollChanges(interval, onChanges) {
    //console.log('POLL',id,interval)
    var useInterval = interval > 5000 ? interval : 5000
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
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function doPollChanges() {
    return new Promise(function(resolve,reject) {
      //console.log('get rec' ,accessToken)
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
          //getToken()
          //refresh()
          resolve()
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }

  function findDocument(title) {
    return new Promise(function(resolve,reject) {
      //console.log('get rec',title ,accessToken)
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

 function getDocument(id) {
    return new Promise(function(resolve,reject) {
      console.log('get rec',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
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
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function getDocumentMeta(id) {
    return new Promise(function(resolve,reject) {
      console.log('get rec meta',id ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (id && accessToken) {
        axios({
          method: 'get',
          url: 'https://www.googleapis.com/drive/v3/files/'+id,
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
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function updateDocument(id,metaData) {
    return new Promise(function(resolve,reject) {  
      console.log('update',id,metaData)
      if (id && accessToken) {
          axios({
            method: 'patch',
            url: 'https://www.googleapis.com/drive/v3/files/'+id+"?alt=json",
            data: metaData,
            headers: {'Authorization': 'Bearer '+accessToken},
          }).then(function(postRes) {
            //googleSheetId.current = postRes.data.id
            console.log('updated title',postRes)
            resolve()
          }).catch(function(e) {
            resolve()
          })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function createDocument(title, documentData, documentType='vnd.google-apps.document', documentDescription='') {
    return new Promise(function(resolve,reject) {
      console.log('create rec' ,accessToken)
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
          console.log('created',postRes)
          updateDocument(postRes.data.id, documentData).then(function(updated) {
            //onLogin("")
            console.log('updated',updated)
            resolve(postRes.data.id)
          }).catch(function(e) {
            //getToken()
            resolve()
          })
        })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }

  function updateDocumentData(id,data) {
    return new Promise(function(resolve,reject) {
      console.log('trigger rec update ', id,data, accessToken)
      if (id && accessToken) {
        axios({
          method: 'patch',
          url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
          headers: {'Authorization': 'Bearer '+accessToken},
          data: data,
        }).then(function(postRes) {
          console.log('updated',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
          resolve()
        })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function deleteDocument(id) {
    return new Promise(function(resolve,reject) {
      console.log('trigger sheet delete ', id, accessToken)
      if (id && accessToken) {
        axios({
          method: 'delete',
          url: 'https://www.googleapis.com/drive/v2/files/'+id,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          console.log('deleted',postRes.data  )
          resolve(postRes)
        }).catch(function(e) {
          resolve()
        })
      } else {
        if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
      }
    })
  }
  
  return {findDocument, getDocument, getDocumentMeta, updateDocument, createDocument, deleteDocument, pollChanges, stopPollChanges}
  
}
