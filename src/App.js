import './App.css';
import Header from './components/Header'
import Footer from './components/Footer'

import HomePage from './pages/HomePage'
import BooksPage from './pages/BooksPage'
import PrintPage from './pages/PrintPage'
import PianoPage from './pages/PianoPage'  
import BlankPage from './pages/BlankPage'
import TunerPage from './pages/TunerPage'
import MetronomePage from './pages/MetronomePage'
import LyricsPage from './pages/LyricsPage'
import CheatSheetPage from './pages/CheatSheetPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import ChordsPage from './pages/ChordsPage'
import SettingsPage from './pages/SettingsPage'
import SetsPage from './pages/SetsPage'
import PrivacyPage from './pages/PrivacyPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import FiltersPage from './pages/FiltersPage'
import ImportLinkPage from './pages/ImportLinkPage'
import ImportGoogleDocumentPage from './pages/ImportGoogleDocumentPage'
import ImportWarningDialog from './components/ImportWarningDialog'
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'
//import VideoPlayerTest from './components/VideoPlayerTest'
import IncomingMergeHost from './components/IncomingMergeHost'
import SourceUrlSyncHost from './components/SourceUrlSyncHost'
import { applySourceUrlMergeBatch } from './sourceUrlSync'
import { registerMergeCheckHandler, unregisterMergeCheckHandler, runMergeChecksNow } from './mergeCheckTrigger'
import MidiPlayer from './components/MidiPlayer'

import useTuneBook from './useTuneBook'
import { registerDevTunebookSeeder } from './devSeed/seedTunebook'
//import axios from 'axios'
import useAppData from './useAppData'
import useUtils from './useUtils'
import useIndexes from './useIndexes'
import useGoogleSheet from './useGoogleSheet'
import useGoogleDocument from './useGoogleDocument'
import useAbcTools from './useAbcTools'
import useTuneEditHistory from './useTuneEditHistory'
import useServiceWorker from './useServiceWorker'
import useTextSearchIndex from './useTextSearchIndex'
import useGoogleLogin from './useGoogleLogin' 
//import useGoogleDocument from './useGoogleDocument' 
//import GoogleLogin from './GoogleLogin'
import NowPlayingHost from './components/NowPlayingHost'
import NowPlayingTransportBar from './components/NowPlayingTransportBar'
import QueuePlayConfirmModal from './components/QueuePlayConfirmModal'
import { shouldShowPlaylistTransportBar } from './playbackNavigationUtils'
import { isQueueActive, suspendQueue, resumeQueue, startPreviewOnce, getCurrentItem, getCurrentTuneId } from './nowPlayingQueue'
import { isGigPlaylistActive } from './gigRouteUtils'
import { handleQueueAdvanceOnEnded, playCurrentQueueItem, playQueueItem, navigateToQueueTune } from './nowPlayingQueuePlayback'
import useTuneBookMediaController from './useTuneBookMediaController'
import usePracticeSession from './usePracticeSession'
import usePracticeRouteSync from './usePracticeRouteSync'
import ImportModalRoutePage from './pages/ImportModalRoutePage'
import AddPage from './pages/AddPage'
import LegacyShowParamRedirect from './LegacyShowParamRedirect'
import PracticeSessionModals from './components/PracticeSessionModals'
import { useInitMediaResolverHealth } from './useMediaResolverHealth'
import { TuneMediaAnalysisProvider } from './useTuneMediaAnalysis'
import { PlaybackRegionScanProvider } from './usePlaybackRegionScan'
import LongRunningJobNavigationGuard from './LongRunningJobNavigationGuard'
import BulkCheckYoutubeHost from './components/BulkCheckYoutubeHost'
import BulkCheckCompleteToastHost from './components/BulkCheckCompleteToastHost'
import BackgroundJobCompletionNotifications from './backgroundJobCompletionNotifications'
import BackgroundReviewNotifications from './backgroundReviewNotifications'
import ImportReviewBridge from './components/ImportReviewBridge'
import ReviewPage from './pages/ReviewPage'
import {
  restoreAndResume,
  setBulkBackgroundResearchQueueContext,
} from './bulkBackgroundResearchQueue'
import {
  restoreAndResume as restoreAndResumeComposerDiscoveryQueue,
  setBulkComposerDiscoveryQueueContext,
} from './bulkComposerDiscoveryQueue'
import { restoreAndResume as restoreAndResumeStemCreateQueue } from './stemCreateQueue'
import {
  restoreAndResume as restoreAndResumeFieldLookupQueue,
  setTuneFieldLookupQueueContext,
} from './tuneFieldLookupQueue'
import useSyncWorker from './useSyncWorker'	
import useRouteAnalytics from './useRouteAnalytics'
import { compareTuneBooks, mergeDeletedTuneMaps, parseDeletedTunesFromAbc } from './tuneBookSync'
import {
  setPerformanceSetsChangeHandler,
} from './performanceSetStore'
import {
  setPlaylistsChangeHandler,
} from './savedPlaylistsStore'
import {
  mergePerformanceSetsFromTuneBookAbc,
  applyPreparedPerformanceSetMerge,
  replacePerformanceSetsFromTuneBookAbc,
} from './performanceSetSyncClient'
import {
  mergePlaylistsFromTuneBookAbc,
  applyPreparedPlaylistMerge,
} from './playlistSyncClient'
import { PERFORMANCE_SETS_DRIVE_SOURCE_KEY, PLAYLISTS_DRIVE_SOURCE_KEY } from './incomingMergePrefs'
import { normalizeSourceUrlKey } from './sourceUrlSync'
import PerformanceSetMergeHost from './components/PerformanceSetMergeHost'
import PlaylistMergeHost from './components/PlaylistMergeHost'
import { syncPendingRecordingUploads } from './linkRecording'
import { applyDriveRecordStateToTunes } from './incomingMergeUtils'

import {useState, useEffect, useRef, useCallback} from 'react';
//import jwt_decode from "jwt-decode";
import {HashRouter as Router, Routes, Route, Link, useLocation, useParams, useNavigate, useSearchParams} from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import './theme.css';
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'
import {ToastContainer, toast}  from 'react-toastify'
import AppEmbedFrameBootstrap from './components/AppEmbedFrameBootstrap'
import { isEmbeddedAppFrame } from './embedFrameUtils'
import { scheduleMediaCacheStorageCheck } from './mediaCacheStorage'

function YouTubeGetID(url){
            url = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
            return undefined !== url[2]?url[2].split(/[^0-9a-z_\-]/i)[0]:url[0];
    }
    function isYoutubeLink(urlToParse){
        if (urlToParse) {
            var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
            if (urlToParse.match(regExp)) {
                return true;
            }
        }
        return false;
    }

function RouteAnalytics() {
  useRouteAnalytics()
  return null
}

function PracticeRouteSync({ practiceSession }) {
  usePracticeRouteSync(practiceSession)
  return null
}

function AppImportReviewBridge(props) {
  const navigate = useNavigate()
  return (
    <ImportReviewBridge
      tunebook={props.tunebook}
      tunes={props.tunes}
      tunesHash={props.tunesHash}
      token={props.token}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      forceRefresh={props.forceRefresh}
      currentTuneBook={props.currentTuneBook}
      login={props.login}
      onOpenTune={function(tune) {
        if (tune && tune.id) navigate('/editor/' + encodeURIComponent(tune.id))
      }}
      onComplete={function() {
        if (typeof props.forceRefresh === 'function') props.forceRefresh()
      }}
      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
    />
  )
}

function useIsEmbeddedAppFrame() {
  const [searchParams] = useSearchParams()
  return isEmbeddedAppFrame(searchParams)
}

/** Header + queue host; omitted when the app is loaded in an embed iframe (e.g. Lyrics Tools). */
function AppMainChrome(props) {
  const embedded = useIsEmbeddedAppFrame()
  if (embedded) return null
  return (
    <>
      <Header {...props.headerProps} />
      <AppQueueLayer {...props.queueProps} />
    </>
  )
}

/** Non-route chrome (modals, etc.) hidden in embed iframes. */
function AppOptionalChrome(props) {
  const embedded = useIsEmbeddedAppFrame()
  if (embedded) return null
  return props.children
}

function AppQueueLayer(props) {
  const location = useLocation()
  const navigate = useNavigate()
  const viewedTuneId = (function() {
    const match = location.pathname.match(/\/tunes\/([^/]+)/)
    return match ? decodeURIComponent(match[1]) : null
  })()
  const showPlaylistTransport = shouldShowPlaylistTransportBar(
    location.pathname,
    props.nowPlayingQueue,
    props.gigModeActive
  )

  useEffect(function() {
    if (typeof document === 'undefined') return undefined
    if (showPlaylistTransport) {
      document.body.classList.add('app-has-playlist-transport')
    } else {
      document.body.classList.remove('app-has-playlist-transport')
    }
    return function() {
      document.body.classList.remove('app-has-playlist-transport')
    }
  }, [showPlaylistTransport])

  function handleQueueConfirmPlayThisTune() {
    const request = props.queuePlayConfirm
    if (!request || !props.nowPlayingQueue || !props.setNowPlayingQueue) return
    const previewQueue = startPreviewOnce(props.nowPlayingQueue, request.tuneId)
    props.setNowPlayingQueue(previewQueue)
    if (request.onPlayThisTune) request.onPlayThisTune()
    else if (request.onPreviewOnce) request.onPreviewOnce()
    props.setQueuePlayConfirm(null)
  }

  function handleQueueConfirmResumePlaylist() {
    const request = props.queuePlayConfirm
    if (!request) return
    const queue = props.nowPlayingQueue
    const tuneId = getCurrentTuneId(queue)
    const item = getCurrentItem(queue)
    if (tuneId) {
      navigateToQueueTune(navigate, tuneId, item, props.tunebook, props.tunes)
    }
    if (request.onResumePlaylist) request.onResumePlaylist()
    props.setQueuePlayConfirm(null)
  }

  return (
    <>
      <NowPlayingHost
        nowPlayingQueue={props.nowPlayingQueue}
        tunes={props.tunes}
        mediaController={props.mediaController}
        tunebook={props.tunebook}
        viewedTuneId={viewedTuneId}
        pathname={location.pathname}
        practiceSessionActive={props.practiceSessionActive}
        gigModeActive={props.gigModeActive}
      />
      <QueuePlayConfirmModal
        request={props.queuePlayConfirm}
        onPlayThisTune={handleQueueConfirmPlayThisTune}
        onResumePlaylist={handleQueueConfirmResumePlaylist}
        onCancel={function() { props.setQueuePlayConfirm(null) }}
      />
      <NowPlayingTransportBar
        nowPlayingQueue={props.nowPlayingQueue}
        setNowPlayingQueue={props.setNowPlayingQueue}
        tunebook={props.tunebook}
        tunes={props.tunes}
        mediaController={props.mediaController}
        gigModeActive={props.gigModeActive}
      />
    </>
  )
}

function App(props) {
  const tuneBookName='ABC Tune Book'
  //console.log(window.location.href)
  //let mediaController = useTuneBookMediaController()
  let dbTunes = {}
  let utils = useUtils();
  let abcTools = useAbcTools();
  //window.onclick=function(e) {
    //console.log('clickdoc',e.y) //,e.screenY,e.x,e.screenX)
    ////window.scrollTo(0,e.y)
  //}
  var [showWaitingOverlay, setShowWaitingOverlay] = useState(false)
  var {user, token, login, logout, refresh, requestGoogleScopes, loadCurrentUser, loadUserImage, breakLoginToken} = useGoogleLogin({usePrompt: false, loginButtonId: 'google_login_button', scopes:['https://www.googleapis.com/auth/drive.file'] })
  useInitMediaResolverHealth(token && token.access_token ? token.access_token : null, requestGoogleScopes)
  const filesDocumentManager = useGoogleDocument(token, logout)
  //console.log('APP',token)
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, deletedTunes, setDeletedTunes, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, queuePlayConfirm, setQueuePlayConfirm, scrollOffset, setScrollOffset , filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, showPreviewInList, setShowPreviewInList, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport} = useAppData()
  useServiceWorker()
  
  
  
  const indexes = useIndexes()
  const [blockKeyboardShortcuts, setBlockKeyboardShortcuts] = useState(false)
  const [notationHelpActive, setNotationHelpActive] = useState(false)
  const [performanceSetMergePending, setPerformanceSetMergePending] = useState(null)
  const [performanceSetMergeSourceLabel, setPerformanceSetMergeSourceLabel] = useState('Remote tunebook')
  const [performanceSetMergeSourceKey, setPerformanceSetMergeSourceKey] = useState(PERFORMANCE_SETS_DRIVE_SOURCE_KEY)
  const [playlistMergePending, setPlaylistMergePending] = useState(null)
  const [playlistMergeSourceLabel, setPlaylistMergeSourceLabel] = useState('Remote tunebook')
  const [playlistMergeSourceKey, setPlaylistMergeSourceKey] = useState(PLAYLISTS_DRIVE_SOURCE_KEY)

  function offerPerformanceSetMerge(abcText, meta) {
    const opts = meta || {}
    return mergePerformanceSetsFromTuneBookAbc(abcText, {
      tunesById: tunes,
      interactive: !opts.silent,
      applySilently: !!opts.silent,
    }).then(function(result) {
      if (result.needsReview && result.prepared) {
        setPerformanceSetMergeSourceLabel(opts.sourceLabel || 'Remote tunebook')
        setPerformanceSetMergeSourceKey(opts.sourceKey || PERFORMANCE_SETS_DRIVE_SOURCE_KEY)
        setPerformanceSetMergePending(result.prepared)
        return result
      }
      if (result.needsUpload && token && token.access_token) {
        updateSheet(0)
      }
      return result
    })
  }

  function offerPlaylistMerge(abcText, meta) {
    const opts = meta || {}
    return mergePlaylistsFromTuneBookAbc(abcText, {
      tunesById: tunes,
      interactive: !opts.silent,
      applySilently: !!opts.silent,
    }).then(function(result) {
      if (result.needsReview && result.prepared) {
        setPlaylistMergeSourceLabel(opts.sourceLabel || 'Remote tunebook')
        setPlaylistMergeSourceKey(opts.sourceKey || PLAYLISTS_DRIVE_SOURCE_KEY)
        setPlaylistMergePending(result.prepared)
        return result
      }
      if (result.needsUpload && token && token.access_token) {
        updateSheet(0)
      }
      return result
    })
  }

  function applyPerformanceSetMergeHandler(prepared, recordState) {
    if (!prepared) return
    applyPreparedPerformanceSetMerge(prepared, recordState)
    setPerformanceSetMergePending(null)
    if (token && token.access_token) {
      updateSheet(0)
    }
  }

  function applyPlaylistMergeHandler(prepared, recordState) {
    if (!prepared) return
    applyPreparedPlaylistMerge(prepared, recordState)
    setPlaylistMergePending(null)
    if (token && token.access_token) {
      updateSheet(0)
    }
  }

  useEffect(function() {
    if (isMobile) {
      document.documentElement.classList.add('platform-mobile');
    }
    return function() {
      document.documentElement.classList.remove('platform-mobile');
    };
  }, []);

  useEffect(function() {
    scheduleMediaCacheStorageCheck(1500)
  }, [])
   
  function applySourceUrlMergeWithSelections(batch, recordState) {
    if (!batch) return
    var nextTunes = applySourceUrlMergeBatch(tunes, batch, recordState)
    setTunes(nextTunes)
    buildTunesHash()
    indexes.resetBookIndex()
    indexes.resetTagIndex()
    indexes.indexTunes(nextTunes)
    forceRefresh()
    updateSheet(0)
  }

  function applyDriveMergeWithSelections(sheetResults, recordState) {
    if (!sheetResults) return
    if (!recordState) {
      applyMergeChanges(sheetResults)
      return
    }
    var applied = applyDriveRecordStateToTunes(tunes, sheetResults, recordState)
    var remoteDeleted = parseDeletedTunesFromAbc(sheetResults.fullSheet || '')
    Object.keys(applied.deletes || {}).forEach(function(tuneId) {
      if (tunes[tuneId]) {
        indexes.removeTune(tunes[tuneId], indexes.bookIndex)
      }
    })
    var nextTunes = applied.tunes
    var nextDeleted = mergeDeletedTuneMaps(deletedTunes, remoteDeleted)
    Object.keys(applied.deletes || {}).forEach(function(tuneId) {
      if (!nextDeleted[tuneId]) {
        nextDeleted[tuneId] = {
          id: tuneId,
          deletedAt: Date.now(),
          name: applied.deletes[tuneId] && applied.deletes[tuneId].name,
        }
      }
    })
    Object.keys(sheetResults.inserts || {}).concat(Object.keys(sheetResults.updates || {})).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    setDeletedTunes(nextDeleted)
    setTunes(nextTunes)
    buildTunesHash()
    indexes.resetBookIndex()
    indexes.resetTagIndex()
    indexes.indexTunes(nextTunes)
    setSheetUpdateResults(null)
    updateSheet(0)
    offerPerformanceSetMerge(sheetResults.fullSheet, {
      sourceLabel: 'Google Drive set lists',
      sourceKey: PERFORMANCE_SETS_DRIVE_SOURCE_KEY,
    }).then(function(setResult) {
      if (setResult && setResult.needsUpload) {
        updateSheet(0)
      }
    })
    offerPlaylistMerge(sheetResults.fullSheet, {
      sourceLabel: 'Google Drive playlists',
      sourceKey: PLAYLISTS_DRIVE_SOURCE_KEY,
    }).then(function(playlistResult) {
      if (playlistResult && playlistResult.needsUpload) {
        updateSheet(0)
      }
    })
  }

  function applyMergeChanges(changes) {
    var {filesToLoad, filesToSave, inserts, updates, deletes, localUpdates, localInserts, fullSheet} = changes
    var remoteDeleted = parseDeletedTunesFromAbc(fullSheet || '')
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u][1].id) {
        tunes[updates[u][1].id] = updates[u][1]
      }
    })
    Object.values(inserts).forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    Object.keys(deletes || {}).forEach(function(tuneId) {
      if (tunes[tuneId]) {
        indexes.removeTune(tunes[tuneId], indexes.bookIndex)
        delete tunes[tuneId]
      }
    })
    var nextDeleted = mergeDeletedTuneMaps(deletedTunes, remoteDeleted)
    Object.keys(deletes || {}).forEach(function(tuneId) {
      if (!nextDeleted[tuneId]) {
        nextDeleted[tuneId] = {
          id: tuneId,
          deletedAt: Date.now(),
          name: deletes[tuneId] && deletes[tuneId].name,
        }
      }
    })
    Object.keys(inserts || {}).concat(Object.keys(updates || {})).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    Object.keys(localUpdates || {}).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    setDeletedTunes(nextDeleted)
    
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)|| (filesToLoad && Object.keys(filesToLoad).length > 0) || (filesToSave && Object.keys(filesToSave).length > 0)) {
      setTunes(tunes)
      updateSheet(0)
    }
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.resetTagIndex()
      indexes.indexTunes(tunes)
      setSheetUpdateResults(null)
    }
    offerPerformanceSetMerge(fullSheet, {
      sourceLabel: 'Google Drive set lists',
      sourceKey: PERFORMANCE_SETS_DRIVE_SOURCE_KEY,
    }).then(function(setResult) {
      if (setResult && setResult.needsUpload) {
        updateSheet(0)
      }
    })
    offerPlaylistMerge(fullSheet, {
      sourceLabel: 'Google Drive playlists',
      sourceKey: PLAYLISTS_DRIVE_SOURCE_KEY,
    }).then(function(playlistResult) {
      if (playlistResult && playlistResult.needsUpload) {
        updateSheet(0)
      }
    })
  }
  
   /** 
   * import songs to a tunebook from an abc file 
   */
  function mergeTuneBook(tunebookText) {
      return new Promise(function(resolve,reject) {
          setShowWaitingOverlay(true)
          Promise.all([
            utils.loadLocalforageObject('bookstorage_tunes'),
            utils.loadLocalforageObject('bookstorage_deleted_tunes'),
          ]).then(function(results) {
              var localTunes = results[0] || {}
              var localDeleted = results[1] || {}
              var remoteTunes = {}
              if (tunebookText) {
                abcTools.abc2Tunebook(tunebookText).forEach(function(tune) {
                  if (tune && tune.id) remoteTunes[tune.id] = tune
                })
              }
              var remoteDeleted = parseDeletedTunesFromAbc(tunebookText)
              var compared = compareTuneBooks({
                localTunes: localTunes,
                localDeleted: localDeleted,
                remoteTunes: remoteTunes,
                remoteDeleted: remoteDeleted,
              })
              var ret = Object.assign({}, compared, {
                fullSheet: tunebookText,
                remoteDeleted: remoteDeleted,
              })
              setShowWaitingOverlay(false)
              resolve(ret)
            })
    })
  }
  
  function overrideTuneBook(fullSheet) {
    setShowWaitingOverlay(true)
    pauseSheetUpdates.current = true
    var tunes = {}
    abcTools.abc2Tunebook(fullSheet).forEach(function(tune) {
        if (tune && tune.id) tunes[tune.id] = tune
    })
    var remoteDeleted = parseDeletedTunesFromAbc(fullSheet)
    setDeletedTunes(remoteDeleted)
    replacePerformanceSetsFromTuneBookAbc(fullSheet)
    setTunes(tunes)
    updateSheet(0).then(function() {
      pauseSheetUpdates.current = false
    }) 
    // update indexes....
    buildTunesHash()
    indexes.resetBookIndex()
    indexes.resetTagIndex()
    indexes.indexTunes(tunes)
    setSheetUpdateResults(null)
    setShowWaitingOverlay(false)
    forceRefresh()
  }
  

  var recurseLoadSheetTimeout = useRef(null)
  var pauseSheetUpdates = useRef(null)
  var pollingInterval = process.env.NODE_ENV === "development" ? 5000 : 6000 //16000
  var {updateSheet} = useGoogleSheet({token, logout, refresh, tunes, pollingInterval:pollingInterval, onMerge, pausePolling: pauseSheetUpdates, setGoogleDocumentId, googleDocumentId}) 
  
  	var syncWorker = useSyncWorker(token, logout, tuneBookName)
  
  var tunesRef = useRef(tunes)
  tunesRef.current = tunes
  const getValidTuneIds = useCallback(function() {
    return Object.keys(tunesRef.current || {})
  }, [])
  var editHistory = useTuneEditHistory({ getValidTuneIds })
  const practiceSessionActiveRef = useRef(false)
  const nowPlayingQueueRef = useRef(nowPlayingQueue)
  useEffect(function() {
    nowPlayingQueueRef.current = nowPlayingQueue
  }, [nowPlayingQueue])

  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, deletedTunes, setDeletedTunes, isLoggedIn: !!(token && token.access_token), currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, filter, setFilter, groupBy, setGroupBy, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, forceNav, setForceNav, editHistory, practiceSessionActiveRef})
  //var abcPlayerRef = useRef()
  let mediaController = useTuneBookMediaController({tunebook, tunes, forceRefresh, token, user, nowPlayingQueue, setNowPlayingQueue, setPlaylist, practiceSessionActiveRef})

  // Dev-only: expose window.seedTunebook()/clearTunebook() and honour ?seed=demo
  // so the app can be prepopulated with sample tunebook data for repro/tests.
  var tunebookRef = useRef(tunebook)
  tunebookRef.current = tunebook
  var mediaControllerRef = useRef(mediaController)
  mediaControllerRef.current = mediaController
  useEffect(function() {
    registerDevTunebookSeeder({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current },
    })
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      Object.defineProperty(window, '__mediaController', { configurable: true, get: function() { return mediaControllerRef.current } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- register once on mount; refs stay current
  }, [])

  const suspendNowPlayingQueue = useCallback(function() {
    const queue = nowPlayingQueueRef.current
    if (!isQueueActive(queue) || queue.suspendSnapshot) return
    const playbackResume = mediaController.captureSuspendedQueuePlayback
      ? mediaController.captureSuspendedQueuePlayback(queue)
      : null
    const suspended = suspendQueue(queue, playbackResume)
    if (suspended.queue) setNowPlayingQueue(suspended.queue)
    if (playbackResume && playbackResume.resumeMode === 'playing' && mediaController.pause) {
      mediaController.pause()
    }
  }, [mediaController, setNowPlayingQueue])

  const resumeNowPlayingQueue = useCallback(function() {
    const queue = nowPlayingQueueRef.current
    if (!queue || !queue.suspendSnapshot) return
    const restored = resumeQueue(queue)
    const playbackResume = restored.playbackResume || null
    const cleanQueue = Object.assign({}, restored)
    delete cleanQueue.playbackResume
    setNowPlayingQueue(cleanQueue)
    if (playbackResume && mediaController.restoreSuspendedQueuePlayback) {
      mediaController.restoreSuspendedQueuePlayback(playbackResume, tunes, tunebook)
    }
  }, [mediaController, tunes, tunebook, setNowPlayingQueue])

  useEffect(function() {
    setBulkBackgroundResearchQueueContext({
      getTune: function(tuneId) {
        return tunesRef.current && tunesRef.current[tuneId] ? tunesRef.current[tuneId] : null
      },
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
    })
    setBulkComposerDiscoveryQueueContext({
      getTune: function(tuneId) {
        return tunesRef.current && tunesRef.current[tuneId] ? tunesRef.current[tuneId] : null
      },
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
    })
    setTuneFieldLookupQueueContext({
      getTune: function(tuneId) {
        return tunesRef.current && tunesRef.current[tuneId] ? tunesRef.current[tuneId] : null
      },
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
      abcTools: tunebook.abcTools,
    })
    restoreAndResume()
    restoreAndResumeComposerDiscoveryQueue()
    restoreAndResumeStemCreateQueue()
    restoreAndResumeFieldLookupQueue()
  }, [tunebook.saveTune, forceRefresh]) 
  const practiceSession = usePracticeSession({
    tunebook,
    tunes,
    mediaController,
    setCurrentTune,
    setViewMode,
    suspendNowPlayingQueue: suspendNowPlayingQueue,
  })

  useEffect(function() {
    practiceSessionActiveRef.current = !!(practiceSession && practiceSession.sessionOpen)
  }, [practiceSession && practiceSession.sessionOpen])

  const queuePlaybackBlockedRef = useRef(false)
  const gigWasActiveRef = useRef(false)

  useEffect(function() {
    const gigActive = isGigPlaylistActive(setPlaylist)
    if (gigActive && !gigWasActiveRef.current) {
      suspendNowPlayingQueue()
    }
    gigWasActiveRef.current = gigActive
  }, [setPlaylist, suspendNowPlayingQueue])

  useEffect(function() {
    const practiceActive = !!(practiceSession && practiceSession.sessionOpen)
    const gigActive = isGigPlaylistActive(setPlaylist)
    const blocked = practiceActive || gigActive

    if (!blocked && queuePlaybackBlockedRef.current) {
      resumeNowPlayingQueue()
    }
    queuePlaybackBlockedRef.current = blocked
  }, [practiceSession && practiceSession.sessionOpen, setPlaylist, resumeNowPlayingQueue])
  //, onEnded:function() {
      //console.log('app ended',this)
        //tunebook.navigateToNextSong()
  //}})
  
  
  function onMerge(fullSheet) {
    //console.log('onmerge',fullSheet)
    //var trialResults = 
    mergeTuneBook(fullSheet).then(function(trialResults) {
        //console.log('onmerge', fullSheet.length, trialResults)
        // warning if items are being deleted
        if (trialResults) {
			var needsWarning = Object.keys(trialResults.deletes).length > 0 || Object.keys(trialResults.updates).length > 0 || Object.keys(trialResults.inserts).length > 0
			if (needsWarning) {
			  //console.log('onmerge set results',trialResults)
			  setSheetUpdateResults(trialResults)
			  tunebook.utils.scrollTo('topofpage')
			  forceRefresh()
			} else if (Object.keys(trialResults.localUpdates).length > 0 || Object.keys(trialResults.localInserts).length > 0) {
			  // Local changes (edits newer than Drive, or new local-only tunes) are saved silently without warning.
			  applyMergeChanges(trialResults)
			} else {
			  //console.log('onmerge empty results',trialResults)
			  setSheetUpdateResults(trialResults)
			  //utils.scrollTo('topofpage')
			  //applyMergeChanges(trialResults)
			  //forceRefresh()
			}
		}
    })
    offerPerformanceSetMerge(fullSheet, {
      sourceLabel: 'Google Drive set lists',
      sourceKey: PERFORMANCE_SETS_DRIVE_SOURCE_KEY,
    }).then(function(setResult) {
      if (setResult && setResult.needsUpload && token && token.access_token) {
        updateSheet(0)
      }
    })
    offerPlaylistMerge(fullSheet, {
      sourceLabel: 'Google Drive playlists',
      sourceKey: PLAYLISTS_DRIVE_SOURCE_KEY,
    }).then(function(playlistResult) {
      if (playlistResult && playlistResult.needsUpload && token && token.access_token) {
        updateSheet(0)
      }
    })
    if (token && token.access_token) {
      syncPendingRecordingUploads({
        token: token,
        driveApi: filesDocumentManager,
        tunes: tunesRef.current,
        saveTune: tunebook.saveTune,
      }).then(function(result) {
        if (result && result.uploaded > 0) {
          const label = result.uploaded === 1 ? 'recording' : 'recordings'
          toast.success(result.uploaded + ' ' + label + ' synced to Google Drive')
        }
      }).catch(function() {})
    }
  }

  useEffect(function() {
    registerMergeCheckHandler('drive', async function() {
      if (!googleDocumentId || !token || !token.access_token) return;
      const fullSheet = await new Promise(function(resolve, reject) {
        filesDocumentManager.getDocument(googleDocumentId).then(resolve).catch(reject);
      });
      onMerge(fullSheet);
    });
    return function() {
      unregisterMergeCheckHandler('drive');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onMerge stable enough for manual check registration
  }, [googleDocumentId, token, filesDocumentManager]);
  
  
    
    //<div  id="loginbuttondiv" style={{float:'left',fontSize:'0.6em'}} data-size="small" data-type="icon"  ></div>  }  
  
    
  useEffect(function() {
    if (!textSearchIndex || !textSearchIndex.tokens) {
      loadTextSearchIndex(textSearchIndex)
    }
    buildTunesHash()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap for search index and tune hash
  }, [])

  useEffect(function() {
    setPerformanceSetsChangeHandler(function() {
      if (token && token.access_token) {
        updateSheet(0)
      }
    })
    return function() {
      setPerformanceSetsChangeHandler(null)
    }
  }, [token, updateSheet])

  useEffect(function() {
    setPlaylistsChangeHandler(function() {
      if (token && token.access_token) {
        updateSheet(0)
      }
    })
    return function() {
      setPlaylistsChangeHandler(null)
    }
  }, [token, updateSheet])

  // App-level wake lock for gig mode, practice mode, and single view playback
  const appWakeLockRef = useRef(null)

  async function requestAppWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      if (!appWakeLockRef.current) {
        appWakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch (e) {
      console.warn('Failed to request screen wake lock:', e)
    }
  }

  function releaseAppWakeLock() {
    if (appWakeLockRef.current) {
      appWakeLockRef.current.release()
        .catch(() => {}) // already released, ignore errors
      appWakeLockRef.current = null
    }
  }

  // Request wake lock when in gig mode, practice mode, or single view
  useEffect(function() {
    const practiceActive = !!(practiceSession && practiceSession.sessionOpen)
    const gigActive = isGigPlaylistActive(setPlaylist)
    const singleViewActive = !!(currentTune && window.location.pathname.includes('/music/'))
    const shouldKeepAwake = practiceActive || gigActive || singleViewActive

    if (shouldKeepAwake) {
      requestAppWakeLock()
    } else {
      releaseAppWakeLock()
    }

    return function() {
      releaseAppWakeLock()
    }
  }, [practiceSession && practiceSession.sessionOpen, setPlaylist, currentTune])
  
  
  
  
  
  // set media player current tune
  //useEffect(function() {
     //mediaController.init()
  //},[window.location.href, tunes, currentTune])
  
  
  function closeWarning() {
    setImportResults(null)
    setSheetUpdateResults(null)
  }
  
  function acceptChanges() {
    applyMergeChanges(sheetUpdateResults)
    setSheetUpdateResults(null)
  } 
     
  function showWarning() {
    //if (sheetUpdateResults) return true
    //return false 
    //console.log('showWarning')
          //return true


    if (sheetUpdateResults !== null) {
        //return true
      if (sheetUpdateResults.deletes && Object.keys(sheetUpdateResults.deletes).length > 0) {
        return true
      }
      if (sheetUpdateResults.updates && Object.keys(sheetUpdateResults.updates).length > 0) {
        return true
      }
      if (sheetUpdateResults.inserts && Object.keys(sheetUpdateResults.inserts).length > 0) {
        return true
      }
      //if (sheetUpdateResults.filesToSave && Object.keys(sheetUpdateResults.filesToSave).length > 0) {
        //return true
      //}
      //if (sheetUpdateResults.filesToLoad && Object.keys(sheetUpdateResults.filesToLoad).length > 0) {
        //return true
      //}
      
      // Local-only changes (edits that win over a clashing online change, or
      // new local-only tunes) are saved silently (see onMerge), so they should
      // not trigger the warning dialog.
    }
    return false
  }
  
  function showImportWarning() {
	  //return true
    //if (sheetUpdateResults) return true
    //return false 
    //console.log('showWarning', localStorage.getItem('bookstorage_mergewarnings'), importResults)
    if (importResults !== null) {
        //return true
        if (localStorage.getItem('bookstorage_mergewarnings') === "true")  {
          if (importResults.deletes && Object.keys(importResults.deletes).length > 0) {
            return true
          }
          if (importResults.updates && Object.keys(importResults.updates).length > 0) {
            return true
          }
          if (importResults.inserts && Object.keys(importResults.inserts).length > 0) {
            return true
          }
        }
        if (importResults.localUpdates && Object.keys(importResults.localUpdates).length > 0) {
          return true
        }
        
    }
    return false
  }
  
  return (

    <div id="topofpage" className="App" >
        {showWaitingOverlay && <div style={{zIndex:999999, position:'fixed', top:0, left:0, backgroundColor: 'grey', opacity:'0.5', height:'100%', width:'100%'}} ><img alt="" src="/spinner.svg" style={{marginTop:'10em', marginLeft:'10em', height:'200px', width:'200px'}} /></div> }  
          <input type='hidden' name="refreshHash" value={refreshHash} />
          <Router >
            <AppEmbedFrameBootstrap />
            <RouteAnalytics />
            <LegacyShowParamRedirect />
            <PracticeRouteSync practiceSession={practiceSession} />
            <LongRunningJobNavigationGuard />
            <BulkCheckYoutubeHost />
            <BulkCheckCompleteToastHost />
            <BackgroundJobCompletionNotifications />
            <BackgroundReviewNotifications />
            <IncomingMergeHost
              token={token}
              tunebook={tunebook}
              sheetUpdateResults={sheetUpdateResults}
              googleDocumentId={googleDocumentId}
              onApplyDriveMerge={applyDriveMergeWithSelections}
              onClear={function() { setSheetUpdateResults(null) }}
            />
            <SourceUrlSyncHost
              token={token}
              tunebook={tunebook}
              tunes={tunes}
              driveApi={filesDocumentManager}
              onApplySourceUrlMerge={applySourceUrlMergeWithSelections}
              onSourceUrlAbcFetched={function(abcText, sourceUrl) {
                offerPerformanceSetMerge(abcText, {
                  sourceLabel: 'Source set lists: ' + sourceUrl,
                  sourceKey: normalizeSourceUrlKey(sourceUrl) + ':performance-sets',
                })
              }}
            />
            <PerformanceSetMergeHost
              pendingPrepared={performanceSetMergePending}
              sourceLabel={performanceSetMergeSourceLabel}
              sourceKey={performanceSetMergeSourceKey}
              deferWhileTuneMerge={!!sheetUpdateResults}
              onApply={applyPerformanceSetMergeHandler}
              onClear={function() { setPerformanceSetMergePending(null) }}
            />
            <PlaylistMergeHost
              pendingPrepared={playlistMergePending}
              sourceLabel={playlistMergeSourceLabel}
              sourceKey={playlistMergeSourceKey}
              deferWhileTuneMerge={!!sheetUpdateResults}
              onApply={applyPlaylistMergeHandler}
              onClear={function() { setPlaylistMergePending(null) }}
            />
            {(showImportWarning(importResults)) ? <>
              <ImportWarningDialog tunebook={tunebook} navigateAfterImport={navigateAfterImport} importResults={importResults} setImportResults={setImportResults} closeWarning={closeWarning} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} acceptChanges={function(changes) {
              }} overrideTuneBook={overrideTuneBook} />
            </> : null}
  
           {tunes !== null && <div >
              <ToastContainer autoClose={2000} />
              <TuneMediaAnalysisProvider
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                forceRefresh={forceRefresh}
              >
              <AppImportReviewBridge
                tunebook={tunebook}
                tunes={tunes}
                tunesHash={tunesHash}
                token={token}
                searchIndex={searchIndex}
                loadTuneTexts={loadTuneTexts}
                forceRefresh={forceRefresh}
                currentTuneBook={currentTuneBook}
                login={login}
                setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
              />
              <PlaybackRegionScanProvider
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                forceRefresh={forceRefresh}
              >
              <AppMainChrome
                headerProps={{
                  isSyncing: syncWorker.isRunning,
                  breakLoginToken: breakLoginToken,
                  forceNav: forceNav,
                  setForceNav: setForceNav,
                  mediaController: mediaController,
                  tunebook: tunebook,
                  tunes: tunes,
                  user: user,
                  token: token,
                  logout: logout,
                  login: login,
                  requestGoogleScopes: requestGoogleScopes,
                  googleDocumentId: googleDocumentId,
                  currentTune: currentTune,
                  setCurrentTune: setCurrentTune,
                  blockKeyboardShortcuts: blockKeyboardShortcuts,
                  setBlockKeyboardShortcuts: setBlockKeyboardShortcuts,
                  nowPlayingQueue: nowPlayingQueue,
                  setNowPlayingQueue: setNowPlayingQueue,
                  queuePlayConfirm: queuePlayConfirm,
                  setQueuePlayConfirm: setQueuePlayConfirm,
                  currentTuneBook: currentTuneBook,
                  setCurrentTuneBook: setCurrentTuneBook,
                  tagFilter: tagFilter,
                  setTagFilter: setTagFilter,
                  genreFilter: genreFilter,
                  setGenreFilter: setGenreFilter,
                  artistFilter: artistFilter,
                  setArtistFilter: setArtistFilter,
                  filter: filter,
                  setFilter: setFilter,
                  setGroupBy: setGroupBy,
                  forceRefresh: forceRefresh,
                  tunesHash: tunesHash,
                  searchIndex: searchIndex,
                  loadTuneTexts: loadTuneTexts,
                  selected: selected,
                  loadUserImage: loadUserImage,
                  practiceSession: practiceSession,
                  setPlaylist: setPlaylist,
                  notationHelpActive: notationHelpActive,
                }}
                queueProps={{
                  nowPlayingQueue: nowPlayingQueue,
                  setNowPlayingQueue: setNowPlayingQueue,
                  queuePlayConfirm: queuePlayConfirm,
                  setQueuePlayConfirm: setQueuePlayConfirm,
                  mediaController: mediaController,
                  tunebook: tunebook,
                  tunes: tunes,
                  practiceSessionActive: !!(practiceSession && practiceSession.sessionOpen),
                  gigModeActive: isGigPlaylistActive(setPlaylist),
                }}
              />
              <AppOptionalChrome>
                <PracticeSessionModals
                  practiceSession={practiceSession}
                  tunebook={tunebook}
                  tunes={tunes}
                  mediaController={mediaController}
                  forceRefresh={forceRefresh}
                  setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
                />
              </AppOptionalChrome>
              <div className="App-body">
                   <Routes>
                    <Route  path={``}   element={<BooksPage mediaController={mediaController}  tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token} user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />}  />
                    
                     <Route  path={`books`}   element={<BooksPage mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                     
                     <Route  path={`tags`}   element={<BooksPage defaultTab={'tags'} mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`filters`}   element={<FiltersPage tunebook={tunebook} setFilter={setFilter} setGroupBy={setGroupBy} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setCurrentTuneBook={setCurrentTuneBook} />} />
                    
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`settings`}  element={<SettingsPage user={user} tunebook={tunebook} tunes={tunes} deletedTunes={deletedTunes} token={token} login={login} forceRefresh={forceRefresh} googleDocumentId={googleDocumentId} onCheckMergeNow={runMergeChecksNow} mediaController={mediaController} />}  />
                    <Route  path={`review`} element={<ReviewPage tunebook={tunebook} tunes={tunes} tunesHash={tunesHash} token={token} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} forceRefresh={forceRefresh} currentTuneBook={currentTuneBook} />} />
                    <Route  path={`sets`} element={<SetsPage tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`sets/:setId`} element={<SetsPage tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig`} element={<SetsPage gigPickerMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig/:setId/:tuneId`} element={<SetsPage gigMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig/:setId`} element={<SetsPage gigMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    
                    <Route  path={`privacy`}   element={<PrivacyPage    />}  />
                    <Route  path={`testme`}   element={<MidiPlayer  tunebook={tunebook} />}  />
                    
                    <Route  path={`chords`} >
                      <Route index element={<ChordsPage  tunebook={tunebook}    />}  />
                      <Route  path={`:instrument/:chordLetter/:quality`} element={<ChordsPage  tunebook={tunebook}    />} />
                      <Route  path={`:instrument/:chordLetter`} element={<ChordsPage  tunebook={tunebook}    />} />
                      <Route  path={`:instrument`} element={<ChordsPage  tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`cheatsheet`} >
                      <Route index element={<CheatSheetPage googleDocumentId={googleDocumentId} token={token} tunes={tunes}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}     />}  />
                      <Route  path={`:tuneBook`} element={<CheatSheetPage   tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}   />} />
                    </Route>
                    <Route  path={`print`} >
                      <Route index element={<PrintPage   tunes={tunes} tunebook={tunebook}  selected={selected} viewMode={viewMode}  />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunes={tunes}   tunebook={tunebook} selected={selected} selectedCount={selectedCount} viewMode={viewMode}  />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tuner`}   element={<TunerPage  tunebook={tunebook}    />}  />
                    <Route  path={`piano`}   element={<PianoPage  tunebook={tunebook}    />}  />
                    <Route  path={`metronome`}   element={<MetronomePage  tunebook={tunebook} currentTune={currentTune} tunes={tunes} />}  />
                    <Route  path={`lyrics`}   element={<LyricsPage  tunebook={tunebook} token={token}   />}  />
                    <Route path={`add`} element={<AddPage mediaController={mediaController} tunes={tunes} tunebook={tunebook} forceRefresh={forceRefresh} tunesHash={tunesHash} token={token} login={login} requestGoogleScopes={requestGoogleScopes} filter={filter} setFilter={setFilter} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} tagFilter={tagFilter} setTagFilter={setTagFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />} />
                    <Route path={`add/bulk`} element={<AddPage mediaController={mediaController} tunes={tunes} tunebook={tunebook} forceRefresh={forceRefresh} tunesHash={tunesHash} token={token} login={login} requestGoogleScopes={requestGoogleScopes} filter={filter} setFilter={setFilter} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} tagFilter={tagFilter} setTagFilter={setTagFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />} />
                    <Route  path={`practice`} element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} genreFilter={genreFilter} setGenreFilter={setGenreFilter} artistFilter={artistFilter} setArtistFilter={setArtistFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} showPreviewInList={showPreviewInList} setShowPreviewInList={setShowPreviewInList} tagCollation={tagCollation} setTagCollation={setTagCollation} />} />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} genreFilter={genreFilter} setGenreFilter={setGenreFilter} artistFilter={artistFilter} setArtistFilter={setArtistFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} showPreviewInList={showPreviewInList} setShowPreviewInList={setShowPreviewInList} tagCollation={tagCollation} setTagCollation={setTagCollation} />}
                      />
                      <Route
                        path={`check`}
                        element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} genreFilter={genreFilter} setGenreFilter={setGenreFilter} artistFilter={artistFilter} setArtistFilter={setArtistFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} showPreviewInList={showPreviewInList} setShowPreviewInList={setShowPreviewInList} tagCollation={tagCollation} setTagCollation={setTagCollation} />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle   mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                      <Route  path={`:tuneId/:playState`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                      <Route  path={`:tuneId/:playState/:mediaLinkNumber`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor  logout={logout} token={token} login={login} mediaController={mediaController} editHistory={editHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setNowPlayingQueue={setNowPlayingQueue}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} onNotationHelpModeChange={setNotationHelpActive} />} />
                        <Route  path={`:tuneId/:view`} element={<MusicEditor  logout={logout} token={token} login={login} mediaController={mediaController} editHistory={editHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setNowPlayingQueue={setNowPlayingQueue}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} onNotationHelpModeChange={setNotationHelpActive} />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route path={`sheet-image`} element={<ImportModalRoutePage modalType="sheet-image" forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} token={token} requestGoogleScopes={requestGoogleScopes} login={login} mediaController={mediaController} />} />
                      <Route path={`chord-sheet`} element={<ImportModalRoutePage modalType="chord-sheet" forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} token={token} mediaController={mediaController} />} />
                      <Route path={`chord-url`} element={<ImportModalRoutePage modalType="chord-url" forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} token={token} mediaController={mediaController} />} />
                      <Route  path={`:curation`} element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`importdoc`} >
                      <Route  path={`:googleDocumentId/share/tune/:tuneId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/share/book/:bookName`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/share/set/:setId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/share/playlist/:playlistId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/tune/:tuneId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/book/:bookName`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                    </Route>
                    
                    <Route  path={`importlink`} >
                      <Route  path={`:link`} element={<ImportLinkPage   tunes={tunes} setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}   setTagFilter={setTagFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       <Route  path={`:link/book/:bookName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/play`} element={<ImportLinkPage autoplay={true}  tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}   setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName/play`} element={<ImportLinkPage autoplay={true} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/tag/:tagName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} />} />
                       
                       <Route  path={`:link/tag/:tagName/play`} element={<ImportLinkPage autoplay={true} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                      
                       <Route  path={`:link/tune/:tuneId`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/tune/:tuneId/play`} element={<ImportLinkPage  autoplay={true}  tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                    </Route>
                    
                    <Route path={'blank'} element={<BlankPage mediaController={mediaController} />} />
                    
                  </Routes>
              </div>
              </PlaybackRegionScanProvider>
              </TuneMediaAnalysisProvider>
              </div>}
              
            </Router>

            <div id="bottomofpage" >
               
            </div>
          
      
    </div>

  ); 
}

export default App;
//<Footer tunebook={tunebook} accessToken={token ? token.access_token : null} logout={logout} login={login} />
//<Route path={'playlist'} element={<DownloadPlaylistPage   mediaPlaylist={mediaPlaylist} tunebook={tunebook}   />} />
