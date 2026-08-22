import axios from 'axios'
import {useState, useRef, useEffect, useCallback} from 'react';
//import jwt_decode from "jwt-decode";
import useAbcTools from "./useAbcTools"
import useUtils from './useUtils'

//import useCheckOnlineStatus from './useCheckOnlineStatus'

import useGoogleDocument from './useGoogleDocument'
import { appendTuneBookSyncSectionsToAbc } from './tuneBookAbc'
import { isShardedSyncEnabled } from './tuneStorageFlags'
import { buildShardedTuneAbc } from './tuneShardSync'
import { SYNC_SHARD_SIZE } from './tuneScaleConstants'
import {
  normalizeDriveFileId,
  tokenHasDriveAccess,
} from './googleDrivePickerClient'
import { isNavigatorOffline } from './offlineNetwork'
import {
  persistableTuneWithoutDisplaySettings,
} from './tuneDisplaySettings'
import {
  readPerformanceSetsMap,
  readDeletedPerformanceSets,
} from './performanceSetStore'
import {
  readPlaylistsMap,
  readDeletedPlaylists,
} from './savedPlaylistsStore'
import {
  readPracticeListsMap,
  readDeletedPracticeLists,
} from './practiceListStore'
import {
  buildDriveUploadShrinkWarning,
  createDrivePollPauseController,
  hashDriveAbc,
  readLastDriveUploadSnapshot,
  writeLastDriveUploadSnapshot,
} from './driveUploadShrinkGuard'
import { shouldRefuseTunesPersist } from './tunesPersistenceGuard'
import {
  markDriveSongbookSyncCancelled,
  markDriveSongbookSyncError,
  markDriveSongbookSyncPending,
  markDriveSongbookSyncRunning,
  markDriveSongbookSyncSuccess,
} from './driveSongbookSyncStatus'
    
export default function useGoogleSheet(props) {
  const {
    token,
    logout,
    refresh,
    tunes,
    pollingInterval,
    onMerge,
    pausePolling,
    setGoogleDocumentId,
    googleDocumentId,
    onUploadShrinkWarning,
  } = props
  var tuneBookName="ABC Tune Book"

  var googleSheetId = useRef(null)
  var accessToken = token ? token.access_token : null
  let abcTools = useAbcTools();
  var utils = useUtils()
  var updateSheetTimer = useRef(null)
  var onMergeRef = useRef(onMerge)
  var onUploadShrinkWarningRef = useRef(onUploadShrinkWarning)
  var tunesRef = useRef(tunes)
  var docsRef = useRef(null)
  var pollPauseControllerRef = useRef(null)
  if (!pollPauseControllerRef.current) {
    pollPauseControllerRef.current = createDrivePollPauseController(pausePolling)
  }
  var pollPause = pollPauseControllerRef.current

  useEffect(function() {
    onMergeRef.current = onMerge
  }, [onMerge])

  useEffect(function() {
    onUploadShrinkWarningRef.current = onUploadShrinkWarning
  }, [onUploadShrinkWarning])

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

  function performUpload(nowTunes, deletedTunes) {
    var performanceSets = readPerformanceSetsMap()
    var deletedPerformanceSets = readDeletedPerformanceSets()
    var playlists = readPlaylistsMap()
    var deletedPlaylists = readDeletedPlaylists()
    var practiceLists = readPracticeListsMap()
    var deletedPracticeLists = readDeletedPracticeLists()
    var tuneCount = Object.keys(nowTunes || {}).length
    var tuneAbcBody
    if (isShardedSyncEnabled() && tuneCount > SYNC_SHARD_SIZE) {
      tuneAbcBody = buildShardedTuneAbc(nowTunes, function(chunkMap, del) {
        return abcTools.tunesToAbc(chunkMap, del)
      }, deletedTunes)
    } else {
      tuneAbcBody = abcTools.tunesToAbc(nowTunes, deletedTunes)
    }
    var abc = appendTuneBookSyncSectionsToAbc(
      tuneAbcBody,
      performanceSets,
      deletedPerformanceSets,
      playlists,
      deletedPlaylists,
      practiceLists,
      deletedPracticeLists
    )
    return docsRef.current.updateDocumentData(googleSheetId.current , abc).then(function() {
      writeLastDriveUploadSnapshot(nowTunes, {
        deletedTunes: deletedTunes,
        playlists: playlists,
        deletedPlaylists: deletedPlaylists,
        performanceSets: performanceSets,
        deletedPerformanceSets: deletedPerformanceSets,
        practiceLists: practiceLists,
        deletedPracticeLists: deletedPracticeLists,
        abcHash: hashDriveAbc(abc),
      })
      pollPause.resumeAfterEcho()
    })
  }

  function runSongbookUpload(nowTunes, deletedTunes) {
    markDriveSongbookSyncRunning()
    return performUpload(nowTunes, deletedTunes).then(function() {
      markDriveSongbookSyncSuccess()
    }).catch(function(err) {
      markDriveSongbookSyncError(err)
      pollPause.resumeNow()
      throw err
    })
  }
  
  // save current tunes database online
  function updateSheet(delay=3000, options) {
    const opts = options || {}
    const forceShrinkUpload = !!opts.forceShrinkUpload
    return new Promise(function(resolve,reject) {
      if (isNavigatorOffline()) {
        resolve()
        return
      }
      pollPause.pause()
      if (googleSheetId.current) { 
        markDriveSongbookSyncPending()
        clearTimeout(updateSheetTimer.current)
        updateSheetTimer.current = setTimeout(function() {
          Promise.all([
            utils.loadLocalforageObject('bookstorage_tunes'),
            utils.loadLocalforageObject('bookstorage_deleted_tunes'),
          ]).then(function(results) {
              var nowTunes = results[0] || {}
              var deletedTunes = results[1] || {}
              // If IndexedDB looks wiped but memory still has the full book,
              // upload the in-memory copy and heal local storage.
              var memoryTunes = tunesRef.current || {}
              if (shouldRefuseTunesPersist(nowTunes, memoryTunes)) {
                console.warn(
                  'Local songbook storage is much smaller than in-memory library; uploading memory copy and healing storage.'
                )
                nowTunes = memoryTunes
                var stripped = {}
                Object.keys(nowTunes).forEach(function(id) {
                  if (nowTunes[id]) stripped[id] = persistableTuneWithoutDisplaySettings(nowTunes[id])
                })
                utils.saveLocalforageObject('bookstorage_tunes', stripped)
              }
              var warning = forceShrinkUpload
                ? null
                : buildDriveUploadShrinkWarning(readLastDriveUploadSnapshot(), nowTunes)
              if (warning && typeof onUploadShrinkWarningRef.current === 'function') {
                return Promise.resolve(onUploadShrinkWarningRef.current(warning)).then(function(confirmed) {
                  if (!confirmed) {
                    pollPause.resumeNow()
                    markDriveSongbookSyncCancelled()
                    resolve({ cancelled: true, warning: warning })
                    return
                  }
                  return runSongbookUpload(nowTunes, deletedTunes).then(function() {
                    resolve({ uploaded: true })
                  })
                }).catch(function() {
                  pollPause.resumeNow()
                  markDriveSongbookSyncCancelled()
                  resolve({ cancelled: true })
                })
              }
              return runSongbookUpload(nowTunes, deletedTunes).then(function() {
                resolve({ uploaded: true })
              })
            })
        },delay)
      } else {
          pollPause.resumeNow()
          resolve()
      }
    })
  }

	const findTuneBookInDrive = useCallback(function() {
		if (isNavigatorOffline()) return
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
	                readDeletedPlaylists(),
	                readPracticeListsMap(),
	                readDeletedPracticeLists()
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
      function tryFind() {
        if (token && token.access_token) {
          findTuneBookInDrive()
        } else {
          googleSheetId.current = null
        }
      }
      tryFind()
      if (typeof window === 'undefined') return
      window.addEventListener('online', tryFind)
      return function() {
        window.removeEventListener('online', tryFind)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Drive lookup once per login token; callbacks read from refs
    },[accessToken])
    
    
    
    return {  updateSheet}
        
}
