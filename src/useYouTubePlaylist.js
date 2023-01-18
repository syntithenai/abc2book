import axios from 'axios'
//import {useRef, useEffect} from 'react'

export default function useYouTubePlaylist({token}) {
  //console.log('use yt pl',token)
  var accessToken = token ? token.access_token : null
  
  function getMyPlaylists() {
    return new Promise(function(resolve,reject) {
      console.log('get playlists' ,accessToken)
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlists?part=snippet%2CcontentDetails&maxResults=50&mine=true&key='+process.env.REACT_APP_GOOGLE_API_KEY
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json'},
        }).then(function(postRes) {
          console.log(postRes)
          //resolve(postRes.data)
          if (postRes && postRes.data  && Array.isArray(postRes.data.items)) {
              var final = []
              postRes.data.items.forEach(function(item) {
                if (item && item.id && item.snippet && item.snippet.title) {
                    final.push({id: item.id, title: item.snippet.title})
                }
              })
              resolve(final)
          } else {
              resolve([])
          }
        }).catch(function(e) {
          resolve()
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve()
      }
    })
  }
  
  function getPlaylistItems(playlistId) {
    return new Promise(function(resolve,reject) {
      console.log('get playlis items' ,playlistId)
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails&maxResults=300&playlistId='+playlistId + '&key=' + process.env.REACT_APP_GOOGLE_API_KEY
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json'},
        }).then(function(postRes) {
            console.log(postRes)
            if (postRes && postRes.data  && Array.isArray(postRes.data.items)) {
              var final = []
              postRes.data.items.forEach(function(item) {
                if (item && item.id && item.snippet && item.snippet.title && item.snippet.resourceId && item.snippet.resourceId.videoId) {
                    final.push({id: item.id, title: item.snippet.title, youtubeId: item.snippet.resourceId.videoId})
                }
              })
              resolve(final)
            } else {
                resolve([])
            }
        }).catch(function(e) {
          resolve([])
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve([])
      }
    })
  }
  
  function insertPlaylist(title) {
      return new Promise(function(resolve,reject) {
      console.log('create playlist')
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlists?part=snippet%2Cstatus&key=' + process.env.REACT_APP_GOOGLE_API_KEY
        axios({
          method: 'post',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json', 'Content-Type': 'application/json'},
          data: {
              "snippet": {
                "title": title,
                "description": "Exported from tunebook.net",
                "tags": [
                  "tunebook playlist"
                ],
                "defaultLanguage": "en"
              },
              "status": {
                "privacyStatus": "private"
              }
            }

        }).then(function(postRes) {
            console.log(postRes)
            if (postRes && postRes.data  && postRes.data.id) {
                resolve(postRes.data.id)
            } else {
                reject()
            }
        }).catch(function(e) {
          reject(null)
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve(null)
      }
    })
  }
 
  function insertOrUpdatePlaylistItems(playlistId,  items) {
      return new Promise(function(resolve,reject) {
          console.log('insertOrUpdatePlaylistItems' ,playlistId, items)
          //var useToken = accessToken ? accessToken : access_token
          if (Array.isArray(items)) {
              getPlaylistItems(playlistId).then(function(currentItems) {
                  console.log('insertOrUpdatePlaylistItems got current' ,currentItems)
                  var cleanups = {}
                  var lookups = {}
                  currentItems.forEach(function(item) { 
                      if (item && item.id && item.youtubeId) {
                          lookups[item.youtubeId] = item
                          cleanups[item.id] = item.youtubeId
                      }
                  })
                  console.log('s',JSON.stringify(lookups),JSON.stringify(cleanups))
                  var promises = []
                  var count = 0
                  items.forEach(function(item) {
                    if (item && lookups.hasOwnProperty(item)) {
                        // already exists
                        console.log('skip',item)
                        var lookup = lookups[item]
                        if (lookup && lookup.id) {
                            cleanups[lookup.id] = null
                        }
                    } else {
                        console.log('create',item)
                        promises.push(insertPlaylistItem(count,playlistId, item))
                        count ++
                    }
                  })
                  console.log('delete',JSON.stringify(Object.values(cleanups)))
                  //// clear out old playlist items not on new items list
                  Object.keys(cleanups).forEach(function(item) {
                      if (item && cleanups[item]) {
                          console.log('delete',item, cleanups[item])
                          //promises.push(deletePlaylistItem(playlistId, id))
                      }
                  })
                  Promise.all(promises).then(function() {
                       console.log('insertOrUpdatePlaylistItems done')
                    resolve()  
                  })
                  //resolve()
              }).catch(function() {
                resolve()  
              })
          } else {
              resolve()
          }
      })
      
  }
  
  function insertPlaylistItem(position, playlistId, youtubeId, note = '') {
      return new Promise(function(resolve,reject) {
          console.log('insertPlaylistItem',playlistId, youtubeId, note)
          //var useToken = accessToken ? accessToken : access_token
          if (accessToken) {
            var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&key=' + process.env.REACT_APP_GOOGLE_API_KEY
            axios({
              method: 'post',
              url: url,
              headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json', 'Content-Type': 'application/json'},
              data: {
                  "snippet": {
                    "playlistId": playlistId,
                    "position": String(position),
                    "resourceId": {
                      "kind": "youtube#video",
                      "videoId": youtubeId
                    }
                  }
                }
            }).then(function(postRes) {
                console.log(postRes)
                if (postRes && postRes.data  && postRes.data.id) {
                    resolve(postRes.data.id)
                } else {
                    reject()
                }
            }).catch(function(e) {
              reject(null)
            })
          } else {
            //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
            resolve(null)
          }
      })
  }
  
   
  function deletePlaylistItem(playlistItemId) {
      return new Promise(function(resolve,reject) {
      console.log('deletePlaylistItem',playlistItemId)
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?id=' + playlistItemId
        axios({
          method: 'delete',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json', 'Content-Type': 'application/json'},
        }).then(function(postRes) {
            resolve([])
        }).catch(function(e) {
          reject([])
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve([])
      }
    })
  }
  
  function insertPlaylistItems(playlistId, items) {
      console.log('insertPlaylistItems', playlistId, items)
      return new Promise(function(resolve,reject) {
        var promises = []
        if (Array.isArray(items)) {
            var count = 0
            items.forEach(function(item) {
                promises.push(insertPlaylistItem(count, playlistId, item))
                count++
            })
        }
        Promise.all(promises).then(function() {
          resolve()  
        })
      })
  }
    
  function insertOrUpdatePlaylist(title, items) {
      console.log('insertOrUpdatePlaylist',title, items)
      getMyPlaylists().then(function(playlists) {
          console.log('got pl',playlists)
          var found = null
          playlists.forEach(function(playlist) {
            if (playlist.title && playlist.title.trim() && title.trim() && playlist.title.trim() === title.trim()) {
                found = playlist
            }
          })
          if (found) {
              insertOrUpdatePlaylistItems(found.id, items)  
          } else {
              insertPlaylist(title).then(function(playlistId) {
                 insertPlaylistItems(playlistId, items)  
              })
          }
          
      })
  }
  
  return {getMyPlaylists, insertOrUpdatePlaylist}
  
}
