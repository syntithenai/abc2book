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
  isDismissedDriveUploadShrink,
  rememberDismissedDriveUploadShrink,
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
import {
  parseDriveFilesListResponse,
  pickBestTuneBookFile,
  readStoredSongbookDocId,
  writeStoredSongbookDocId,
  clearStoredSongbookDocId,
} from './driveSongbookLookup'
import { toast } from 'react-toastify'
    
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
    onShrinkUploadCancelled,
  } = props
  var tuneBookName="ABC Tune Book"

  var googleSheetId = useRef(null)
  var accessToken = token ? token.access_token : null
  let abcTools = useAbcTools();
  var utils = useUtils()
  var updateSheetTimer = useRef(null)
  var onMergeRef = useRef(onMerge)
  var onUploadShrinkWarningRef = useRef(onUploadShrinkWarning)
  var onShrinkUploadCancelledRef = useRef(onShrinkUploadCancelled)
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
    onShrinkUploadCancelledRef.current = onShrinkUploadCancelled
  }, [onShrinkUploadCancelled])

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
  
  function notifyShrinkCancelled(warning) {
    // Backup pull if user cancels after a pre-sync still left local small.
    pullSongbookFromDrive()
  }

  function pullSongbookFromDrive() {
    if (isNavigatorOffline()) return Promise.resolve()
    if (!googleSheetId.current || !docsRef.current || typeof docsRef.current.getDocument !== 'function') {
      return Promise.resolve()
    }
    return docsRef.current.getDocument(googleSheetId.current).then(function(fullSheet) {
      if (fullSheet && typeof onMergeRef.current === 'function') {
        return onMergeRef.current(fullSheet)
      }
    }).catch(function() {})
  }
  
  // save current tunes database online
  function updateSheet(delay=3000, options) {
    const opts = options || {}
    const forceShrinkUpload = !!opts.forceShrinkUpload
    const afterPreShrinkSync = !!opts.afterPreShrinkSync
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

              function finishUploadOrWarn(uploadTunes, uploadDeleted) {
                var warning = forceShrinkUpload
                  ? null
                  : buildDriveUploadShrinkWarning(readLastDriveUploadSnapshot(), uploadTunes)
                if (warning && isDismissedDriveUploadShrink(warning)) {
                  pollPause.resumeNow()
                  markDriveSongbookSyncCancelled()
                  notifyShrinkCancelled(warning)
                  resolve({ cancelled: true, warning: warning, suppressed: true })
                  return
                }
                if (warning && typeof onUploadShrinkWarningRef.current === 'function') {
                  return Promise.resolve(onUploadShrinkWarningRef.current(warning)).then(function(confirmed) {
                    if (!confirmed) {
                      rememberDismissedDriveUploadShrink(warning)
                      pollPause.resumeNow()
                      markDriveSongbookSyncCancelled()
                      notifyShrinkCancelled(warning)
                      resolve({ cancelled: true, warning: warning })
                      return
                    }
                    return runSongbookUpload(uploadTunes, uploadDeleted).then(function() {
                      resolve({ uploaded: true })
                    })
                  }).catch(function() {
                    rememberDismissedDriveUploadShrink(warning)
                    pollPause.resumeNow()
                    markDriveSongbookSyncCancelled()
                    notifyShrinkCancelled(warning)
                    resolve({ cancelled: true })
                  })
                }
                return runSongbookUpload(uploadTunes, uploadDeleted).then(function() {
                  resolve({ uploaded: true })
                })
              }

              var pendingWarning = forceShrinkUpload
                ? null
                : buildDriveUploadShrinkWarning(readLastDriveUploadSnapshot(), nowTunes)

              // Before warning about wiping Drive, pull online songbook and heal local.
              if (pendingWarning && !afterPreShrinkSync) {
                return pullSongbookFromDrive().then(function(mergeResult) {
                  var healedMemory = (mergeResult && mergeResult.tunes) || tunesRef.current || {}
                  if (Object.keys(healedMemory).length > 0) {
                    tunesRef.current = healedMemory
                  }
                  if (Object.keys(healedMemory).length > Object.keys(nowTunes).length) {
                    nowTunes = healedMemory
                    var strippedHeal = {}
                    Object.keys(nowTunes).forEach(function(id) {
                      if (nowTunes[id]) strippedHeal[id] = persistableTuneWithoutDisplaySettings(nowTunes[id])
                    })
                    utils.saveLocalforageObject('bookstorage_tunes', strippedHeal)
                  }
                  var stillWarn = forceShrinkUpload
                    ? null
                    : buildDriveUploadShrinkWarning(readLastDriveUploadSnapshot(), nowTunes)
                  if (!stillWarn) {
                    // Synced back from Drive — nothing dangerous to upload.
                    pollPause.resumeNow()
                    markDriveSongbookSyncCancelled()
                    resolve({ healed: true, cancelled: true })
                    return
                  }
                  return utils.loadLocalforageObject('bookstorage_deleted_tunes').then(function(afterDeleted) {
                    return finishUploadOrWarn(nowTunes, afterDeleted || deletedTunes)
                  })
                }).catch(function() {
                  return finishUploadOrWarn(nowTunes, deletedTunes)
                })
              }

              return finishUploadOrWarn(nowTunes, deletedTunes)
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
		if (!tokenHasDriveAccess(token)) return

		function bindAndMerge(fileId) {
			var id = normalizeDriveFileId(fileId)
			if (!id || !docsRef.current) return
			googleSheetId.current = id
			setGoogleDocumentId(id)
			writeStoredSongbookDocId(id)
			docsRef.current.getDocument(id).then(function(fullSheet) {
				if (fullSheet && typeof onMergeRef.current === 'function') {
					onMergeRef.current(fullSheet)
				}
			})
		}

		function createNewSongbook(useToken) {
			docsRef.current.findTuneBookFolderInDrive().then(function(folderId) {
				if (!folderId) return
				utils.loadLocalforageObject('bookstorage_deleted_tunes').then(function(deletedTunes) {
					var localTunes = tunesRef.current || {}
					var localCount = Object.keys(localTunes).length
					var initialAbc = appendTuneBookSyncSectionsToAbc(
						abcTools.tunesToAbc(localTunes, deletedTunes || {}),
						readPerformanceSetsMap(),
						readDeletedPerformanceSets(),
						readPlaylistsMap(),
						readDeletedPlaylists(),
						readPracticeListsMap(),
						readDeletedPracticeLists()
					)
					if (localCount === 0) {
						toast.info('Creating a new Google Drive songbook on this device. If your tunes are already on another device, open Settings → Sources → Check for updates, or remove extra “ABC Tune Book” files in Drive.')
					}
					docsRef.current.createDocument(
						tuneBookName,
						initialAbc,
						'application/vnd.google-apps.document',
						'Document for ' + tuneBookName + ' data',
						folderId
					).then(function(newId) {
						var fileId = normalizeDriveFileId(newId)
						if (!fileId) return
						bindAndMerge(fileId)
					})
				})
			})
		}

		function runSearch(useToken) {
			if (!useToken) return
			var xhr = new XMLHttpRequest()
			xhr.onload = function() {
				var response = null
				try {
					response = xhr.responseText ? JSON.parse(xhr.responseText) : null
				} catch (e) {
					toast.warning('Could not read your Google Drive songbook list. Sync will retry when you are online.')
					return
				}
				var parsed = parseDriveFilesListResponse(response, xhr.status)
				if (!parsed.ok) {
					toast.warning('Could not find your songbook in Google Drive: ' + (parsed.error || 'unknown error'))
					return
				}
				var best = pickBestTuneBookFile(parsed.files, tuneBookName)
				if (best && best.id) {
					bindAndMerge(best.id)
					return
				}
				createNewSongbook(useToken)
			}
			xhr.onerror = function() {
				toast.warning('Could not reach Google Drive to sync your songbook.')
			}
			var filter = '?q=' + encodeURIComponent(
				"name='" + tuneBookName + "' and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
			) + '&fields=files(id,name,size,modifiedTime,mimeType)&orderBy=modifiedTime desc&pageSize=25'
			xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
			xhr.setRequestHeader('Authorization', 'Bearer ' + useToken)
			xhr.send()
		}

		function tryStoredThenSearch(useToken) {
			var storedId = readStoredSongbookDocId()
			if (!storedId || !docsRef.current || typeof docsRef.current.getDocumentMeta !== 'function') {
				runSearch(useToken)
				return
			}
			docsRef.current.getDocumentMeta(storedId).then(function(meta) {
				if (!meta || !meta.id) {
					clearStoredSongbookDocId()
					runSearch(useToken)
					return
				}
				// If the remembered file looks empty/tiny, still search — a prior
				// Android bug could have bound this device to a stub while the
				// full songbook exists under the same name.
				var size = meta.size != null ? Number(meta.size) : NaN
				var looksTiny = !Number.isFinite(size) || size < 2048
				if (!looksTiny) {
					bindAndMerge(meta.id || storedId)
					return
				}
				var xhr = new XMLHttpRequest()
				xhr.onload = function() {
					var response = null
					try {
						response = xhr.responseText ? JSON.parse(xhr.responseText) : null
					} catch (e) {
						bindAndMerge(meta.id || storedId)
						return
					}
					var parsed = parseDriveFilesListResponse(response, xhr.status)
					if (!parsed.ok) {
						bindAndMerge(meta.id || storedId)
						return
					}
					var best = pickBestTuneBookFile(parsed.files, tuneBookName)
					if (best && best.id && best.id !== (meta.id || storedId)) {
						var bestSize = best.size != null ? Number(best.size) : -1
						if (Number.isFinite(bestSize) && bestSize > (Number.isFinite(size) ? size : 0)) {
							bindAndMerge(best.id)
							toast.success('Connected to your full Google Drive songbook')
							return
						}
					}
					bindAndMerge(meta.id || storedId)
				}
				xhr.onerror = function() {
					bindAndMerge(meta.id || storedId)
				}
				var filter = '?q=' + encodeURIComponent(
					"name='" + tuneBookName + "' and mimeType != 'application/vnd.google-apps.folder' and trashed = false"
				) + '&fields=files(id,name,size,modifiedTime,mimeType)&orderBy=modifiedTime desc&pageSize=25'
				xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter + '&nocache=' + String(parseInt(Math.random() * 1000000000)))
				xhr.setRequestHeader('Authorization', 'Bearer ' + useToken)
				xhr.send()
			}).catch(function() {
				clearStoredSongbookDocId()
				runSearch(useToken)
			})
		}

		tryStoredThenSearch(token.access_token)
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
    
    
    
    return { updateSheet, pullSongbookFromDrive }
        
}
