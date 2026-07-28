import axios from 'axios'
import { toast } from 'react-toastify'
//import {useRef, useEffect} from 'react'

export const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'

export function parseYouTubePlaylistId(input) {
  if (!input || !String(input).trim()) return ''
  var trimmed = String(input).trim()
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      var url = new URL(trimmed)
      var listParam = url.searchParams.get('list')
      if (listParam) return listParam
    }
  } catch (e) {}
  var match = trimmed.match(/[?&]list=([^&/#]+)/i)
  if (match && match[1]) return match[1]
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed
  return ''
}

export default function useYouTubePlaylist() {
  const MAX_EXPORT_ITEMS = 20
  const DEFAULT_INSERT_DELAY_MS = 300
  // export toast countdown state
  var _exportToastId = null
  var _exportCountdownTimer = null
  var _exportStartTime = null
  var _exportEstimatedMs = 0

  function _startExportCountdown(itemCount) {
    try {
      var count = Number(itemCount) || 0
      _exportEstimatedMs = Math.max(1000, count * DEFAULT_INSERT_DELAY_MS + 1000)
      _exportStartTime = Date.now()
      _exportToastId = toast.info('Export started — estimating ' + Math.ceil(_exportEstimatedMs/1000) + 's', {autoClose: false})
      if (_exportCountdownTimer) clearInterval(_exportCountdownTimer)
      _exportCountdownTimer = setInterval(function() {
        try {
          var elapsed = Date.now() - _exportStartTime
          var remaining = Math.max(0, Math.ceil((_exportEstimatedMs - elapsed) / 1000))
          if (_exportToastId != null) {
            toast.update(_exportToastId, { render: 'Export in progress — approx ' + remaining + 's remaining', autoClose: false })
          }
        } catch (e) {}
      }, 1000)
    } catch (e) {}
  }

  function _stopExportCountdown(finalMsg, success) {
    try {
      if (_exportCountdownTimer) {
        clearInterval(_exportCountdownTimer)
        _exportCountdownTimer = null
      }
      if (_exportToastId != null) {
        try { toast.dismiss(_exportToastId) } catch (e) {}
        _exportToastId = null
      }
      // show final toast
      if (success) toast.success(finalMsg || 'Export complete')
      else toast.error(finalMsg || 'Export failed')
    } catch (e) {}
  }
  //var accessToken = token ? token.access_token : null
  function _extractAjaxError(e) {
    try {
      if (!e) return 'Unknown error'
      if (e.response && e.response.data) {
        if (e.response.data.error && e.response.data.error.message) return e.response.data.error.message
        if (typeof e.response.data === 'string') return e.response.data
      }
      if (e.message) return e.message
      return String(e)
    } catch (ex) {
      return 'Unknown error'
    }
  }
  
  function getMyPlaylists(accessToken) {
    return new Promise(function(resolve,reject) {
      //var useToken = accessToken ? accessToken : access_token
  if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlists?part=snippet%2CcontentDetails&maxResults=50&mine=true&key='+process.env.REACT_APP_GOOGLE_API_KEY
        axios({
          method: 'get',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json'},
        }).then(function(postRes) {
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
          console.error('getMyPlaylists axios error', e)
          if (e && e.response) console.error('getMyPlaylists response data', e.response.data)
          if (e && e.stack) console.error('getMyPlaylists stack', e.stack)
          reject(e)
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        // clearly signal missing token
        reject(new Error('Missing access token'))
      }
    })
  }
  
  function getPlaylistItemsRecursive(playlistId, accessToken, nextPageToken='') {
      return new Promise(function(resolve,reject) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails&maxResults=50&playlistId='+playlistId + '&key=' + process.env.REACT_APP_GOOGLE_API_KEY
            if (nextPageToken) {
                url = url+ '&pageToken='+nextPageToken
            }
            var headers = {'Accept': 'application/json'}
            if (accessToken) {
              headers.Authorization = 'Bearer ' + accessToken
            }
            axios({
              method: 'get',
              url: url,
              headers: headers,
            }).then(function(postRes) {
                if (postRes && postRes.data  && Array.isArray(postRes.data.items)) {
                    
                  var final = []
                  postRes.data.items.forEach(function(item) {
                    if (item && item.id && item.snippet && item.snippet.title && item.snippet.resourceId && item.snippet.resourceId.videoId) {
                        final.push({id: item.id, title: item.snippet.title, youtubeId: item.snippet.resourceId.videoId})
                    }
                  })
          if (postRes.data.nextPageToken) {
            getPlaylistItemsRecursive(playlistId, accessToken, postRes.data.nextPageToken).then(function(extraResults) {
              if (Array.isArray(extraResults)) {
                extraResults.forEach(function(item) {
                  if (item && item.id) {
                    final.push(item)
                  }
                })
              }
              resolve(final)
            }).catch(function() {
              resolve(final)
            })
                  } else {
                    resolve(final)
                  }
                } else {
                    resolve([])
                }
            }).catch(function(e) {
              resolve([])
            })
        })
  }
  
  function getPlaylistItems(playlistId, accessToken) {
    return getPlaylistItemsRecursive(playlistId, accessToken, null)
  }
  
  function insertPlaylist(title, accessToken) {
      return new Promise(function(resolve,reject) {
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
      if (postRes && postRes.data  && postRes.data.id) {
        resolve(postRes.data.id)
      } else {
        reject(new Error('No playlist id in response'))
      }
    }).catch(function(e) {
      reject(e)
    })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve(null)
      }
    })
  }
 
  // Insert a single playlist item (returns created playlistItem id or null if non-fatal conflict)
  function insertPlaylistItem(position, playlistId, item, accessToken, note) {
    var youtubeId = null
    if (!item) {
      youtubeId = null
    } else if (typeof item === 'string') {
      youtubeId = item
    } else if (item.id) {
      youtubeId = item.id
    } else if (item.youtubeId) {
      youtubeId = item.youtubeId
    }
    return new Promise(function(resolve, reject) {
      if (!(accessToken && youtubeId)) return resolve(null)
      // basic YouTube video id validation (most ids are 11 chars of A-Za-z0-9_-)
      try {
        var idOk = typeof youtubeId === 'string' && /^[A-Za-z0-9_-]{6,}$/.test(youtubeId)
        if (!idOk) {
          console.warn('insertPlaylistItem skipping invalid youtubeId', youtubeId, 'for playlist', playlistId)
          return resolve({error: 'invalid youtube id: ' + String(youtubeId)})
        }
      } catch (vex) {}
        var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&key=' + process.env.REACT_APP_GOOGLE_API_KEY
        // Only include position when it's a valid non-negative integer. Omitting invalid position avoids
        // the YouTube API "invalid argument" errors when NaN or unexpected types are sent.
        // Do not send snippet.position. The YouTube API returns "Request contains an invalid argument"
        // when position is out-of-range. We perform sequential inserts (one-by-one) and rely on appending
        // to build correct order, so omit position entirely to avoid INVALID_ARGUMENT errors.
        var snippet = {
          playlistId: playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: youtubeId
          }
        }
  var body = { snippet }

      // attempt with retries for transient errors (429, 5xx)
      var maxAttempts = 5
      var attempt = 0
      function tryPost() {
        attempt++
        axios({
          method: 'post',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json', 'Content-Type': 'application/json'},
          data: body
        }).then(function(postRes) {
          if (postRes && postRes.data && postRes.data.id) {
            return resolve(postRes.data.id)
          }
          // unexpected shape
          console.error('insertPlaylistItem unexpected response', postRes)
          return reject(new Error('No id returned when inserting playlist item'))
        }).catch(function(e) {
          var status = e && e.response && e.response.status
          var data = e && e.response && e.response.data
          // log detailed error to help debugging 400 responses
          try { console.error('insertPlaylistItem failed attempt', attempt, 'status', status, 'video', youtubeId, 'playlistId', playlistId) } catch (er) {}
          try { console.error('insertPlaylistItem request body', body) } catch (er) {}
          try { console.error('insertPlaylistItem response data', data || e && e.message) } catch (er) {}

          if (status === 409) {
            // non-fatal: already exists or aborted
            console.warn('insertPlaylistItem non-fatal 409/ABORTED for video', youtubeId, 'playlistId', playlistId, data || e && e.message)
            return resolve(null)
          }

          // retry on rate limit or server errors
          if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
            var backoff = Math.pow(2, attempt) * 250
            setTimeout(tryPost, backoff)
            return
          }

          // otherwise fail with a friendly message
          var friendly = _extractAjaxError(e)
          // Resolve with an error object instead of rejecting so callers that `then` the
          // promise receive a structured result and we avoid uncaught runtime rejections
          // which were bubbling as "Request contains an invalid argument." in the UI.
          try { console.warn('insertPlaylistItem non-retriable error for', youtubeId, '=>', friendly) } catch (er) {}
          return resolve({ error: friendly, status: status, data: data })
        })
      }
      tryPost()
    })
  }

  // Insert or update items for a playlist: insert missing items and remove any that are no longer present
  function insertOrUpdatePlaylistItems(playlistId, items, accessToken) {
    return new Promise(function(resolve, reject) {
      if (!Array.isArray(items)) return resolve([])
      getPlaylistItems(playlistId, accessToken).then(function(currentItems) {
        var lookups = {}
        var cleanups = {}
        if (Array.isArray(currentItems)) {
          currentItems.forEach(function(ci) {
            if (ci && ci.id && ci.youtubeId) {
              lookups[ci.youtubeId] = ci
              cleanups[ci.id] = ci.youtubeId
            }
          })
        }
  var insertPromises = []
  var position = 0
  // limit exported items to MAX_EXPORT_ITEMS
  var limitedItems = Array.isArray(items) ? items.slice(0, MAX_EXPORT_ITEMS) : []
  limitedItems.forEach(function(item) {
          var yid = (typeof item === 'string') ? item : (item && (item.id || item.youtubeId) ? (item.id || item.youtubeId) : null)
          if (yid && lookups.hasOwnProperty(yid)) {
            var existing = lookups[yid]
            if (existing && existing.id) cleanups[existing.id] = null
          } else {
            insertPromises.push(insertPlaylistItem(position, playlistId, item, accessToken))
            position++
          }
        })
        // Insert sequentially with a small delay to avoid rate limits; record per-item results and continue on error
        var insertResults = []
        var insertList = []
        Object.keys(insertPromises).forEach(function(k) { /* no-op, legacy */ })
        // Build explicit list of items to insert with positions
        var pos = 0
        limitedItems.forEach(function(item) {
          var yid = (typeof item === 'string') ? item : (item && (item.id || item.youtubeId) ? (item.id || item.youtubeId) : null)
          if (!(yid && lookups.hasOwnProperty(yid))) {
            insertList.push({item: item, position: pos})
            pos++
          }
        })

        var delayMs = 300
        var idx = 0
        function runNextInsert() {
          if (idx >= insertList.length) {
            // now run deletes
            var deletePromises = []
            Object.keys(cleanups).forEach(function(pid) {
              if (cleanups[pid]) {
                deletePromises.push(deletePlaylistItem(pid, accessToken))
              }
            })
            Promise.all(deletePromises).then(function(deleteResults) {
              resolve((insertResults || []).concat(deleteResults || []))
            }).catch(function() {
              resolve(insertResults || [])
            })
            return
          }
          var it = insertList[idx]
          insertPlaylistItem(it.position, playlistId, it.item, accessToken).then(function(res) {
            insertResults.push(res)
            idx++
            setTimeout(runNextInsert, delayMs)
          }).catch(function(err) {
            // record failure but continue
            try { console.error('insertOrUpdatePlaylistItems insert error', _extractAjaxError(err)) } catch (er) {}
            insertResults.push({error: _extractAjaxError(err)})
            idx++
            setTimeout(runNextInsert, delayMs)
          })
        }
        runNextInsert()
      }).catch(function(e) {
        reject(e)
      })
    })
  }
  
   
  function deletePlaylistItem(playlistItemId, accessToken) {
      return new Promise(function(resolve,reject) {
      //var useToken = accessToken ? accessToken : access_token
      if (accessToken) {
        var url = 'https://youtube.googleapis.com/youtube/v3/playlistItems?id=' + playlistItemId
        axios({
          method: 'delete',
          url: url,
          headers: {'Authorization': 'Bearer '+accessToken, 'Accept': 'application/json', 'Content-Type': 'application/json'},
        }).then(function(postRes) {
            resolve(postRes && postRes.data ? postRes.data : {})
        }).catch(function(e) {
          reject(e)
        })
      } else {
        //if (!accessToken && localStorage.getItem('abc2book_lastuser')) refresh() 
        resolve([])
      }
    })
  }
  
  function insertPlaylistItems(playlistId, items, accessToken) {
      return new Promise(function(resolve,reject) {
        var promises = []
        if (Array.isArray(items)) {
            var count = 0
            items.forEach(function(item) {
                var yid = (typeof item === 'string') ? item : (item.id || item.youtubeId || null)
                promises.push(insertPlaylistItem(count, playlistId, yid ? yid : item, accessToken))
                count++
            })
        }
        // Use allSettled so single failures don't reject the whole batch
        Promise.allSettled(promises).then(function(results) {
          var normalized = results.map(function(r) {
            if (r.status === 'fulfilled') return r.value
            return {error: (r.reason && r.reason.message) ? r.reason.message : String(r.reason)}
          })
          resolve(normalized)
        }).catch(function(e) {
          // fallback
          reject(e)
        })
      })
  }
    
  function insertOrUpdatePlaylist(title, items, accessToken) {
  return new Promise(function(resolve) {
          try {
            // short-lived toast to indicate export has started (will be followed by the countdown)
            try { toast.info('Export starting...', {autoClose: 3000}) } catch (er) {}
            // start export countdown estimating based on number of items
            try { _startExportCountdown(Array.isArray(items) ? Math.min(items.length, MAX_EXPORT_ITEMS) : 0) } catch (er) {}
            var p = null
            try {
              p = getMyPlaylists(accessToken)
            } catch (syncErr) {
              console.error('getMyPlaylists threw synchronously', syncErr)
              resolve({action:'list_failed', error: _extractAjaxError(syncErr)})
              return
            }
            if (!p || typeof p.then !== 'function') {
              resolve({action:'list_failed', error: 'getMyPlaylists did not return a promise'})
              return
            }
            p.then(function(playlists) {
              var found = null
              try {
                if (Array.isArray(playlists)) {
                  for (var pi = 0; pi < playlists.length; pi++) {
                    var playlist = playlists[pi]
                    var ptitle = playlist && playlist.title
                    if (ptitle && typeof ptitle.trim === 'function' && title && typeof title.trim === 'function') {
                      if (ptitle.trim() === title.trim()) {
                        found = playlist
                        break
                      }
                    }
                  }
                }
              } catch (iterErr) {
                console.error('Error iterating playlists', iterErr)
              }
              // found playlist or null
                  if (found) {
                  // update existing
                  insertOrUpdatePlaylistItems(found.id, items, accessToken).then(function(results) {
                      // read results to determine success/failure
                      var created = 0, deleted = 0, failed = 0
                      if (Array.isArray(results)) {
                        results.forEach(function(r) {
                          if (r === null) { /* insert returned null */ }
                          else if (typeof r === 'string') created++
                        })
                      }
                      _stopExportCountdown('YouTube playlist updated: ' + title, true)
                      resolve({action:'updated', playlistId: found.id, created, deleted, failed})
                  }).catch(function(e) {
                      var msg = _extractAjaxError(e)
                      _stopExportCountdown('Failed to update playlist: ' + msg, false)
                      resolve({action:'update_failed', error: msg})
                  })
              } else {
                  // create new playlist then add items
                  insertPlaylist(title, accessToken).then(function(playlistId) {
                     if (!playlistId) {
                        try { _stopExportCountdown('Failed to create YouTube playlist', false) } catch (er) {}
                        resolve({action:'create_failed'})
                        return
                     }
                     // Use the sequential inserter (with delay and retries) so newly created playlists
                     // receive items one-by-one. The previous concurrent batch was dropping items
                     // under rate limiting; insertOrUpdatePlaylistItems handles retries, 409s, and delays.
                     insertOrUpdatePlaylistItems(playlistId, items, accessToken).then(function(results) {
                        var created = 0, failed = 0
                        if (Array.isArray(results)) {
                          results.forEach(function(r) {
                            if (r === null) failed++
                            else if (typeof r === 'string') created++
                          })
                        }
            _stopExportCountdown('YouTube playlist created: ' + title + ' (' + created + ' items added)', true)
            resolve({action:'created', playlistId: playlistId, created, failed})
                     }).catch(function(e) {
                        var msg = _extractAjaxError(e)
            _stopExportCountdown('Playlist created but adding items failed: ' + msg, false)
            resolve({action:'items_failed', playlistId: playlistId, error: msg})
                     })
                  }).catch(function(e) {
                    var msg = _extractAjaxError(e)
                    _stopExportCountdown('Failed to create playlist: ' + msg, false)
          resolve({action:'create_failed', error: msg})
                  })
              }
              
            }).catch(function(e) {
              console.error('insertOrUpdatePlaylist getMyPlaylists error', e)
              if (e && e.stack) console.error('stack', e.stack)
              var msg = _extractAjaxError(e)
              toast.error('Failed to fetch your playlists: ' + msg)
              try { _stopExportCountdown('Failed to fetch your playlists: ' + msg, false) } catch (er) {}
              resolve({action:'list_failed', error: msg})
            })
          } catch (ex) {
            console.error('insertOrUpdatePlaylist unexpected error', ex)
            var msg = _extractAjaxError(ex)
            toast.error('Unexpected error: ' + msg)
            try { _stopExportCountdown('Unexpected error: ' + msg, false) } catch (er) {}
            resolve({action:'error', error: msg})
          }
      })
  }
  
  
  return {getMyPlaylists, insertOrUpdatePlaylist, getPlaylistItems}
  
}
