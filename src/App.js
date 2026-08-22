import './App.css';
import Header from './components/Header'
import AppFootPedalHost from './components/AppFootPedalHost'
import Footer from './components/Footer'

import HomePage from './pages/HomePage'
import BooksPage from './pages/BooksPage'
import LibraryBrowsePage from './pages/LibraryBrowsePage'
import PrintPage from './pages/PrintPage'
import PianoPage from './pages/PianoPage'  
import BlankPage from './pages/BlankPage'
import TunerPage from './pages/TunerPage'
import AudioAnalysisPage from './pages/AudioAnalysisPage'
import AudioAnalysisLegacyRedirect from './pages/AudioAnalysisLegacyRedirect'
import MetronomePage from './pages/MetronomePage'
import LyricsPage from './pages/LyricsPage'
import CheatSheetPage from './pages/CheatSheetPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import ChordsPage from './pages/ChordsPage'
import SettingsPage from './pages/SettingsPage'
import SetsPage from './pages/SetsPage'
import PracticeListsPage from './pages/PracticeListsPage'
import PrivacyPage from './pages/PrivacyPage'
import BillingCheckoutPage from './pages/BillingCheckoutPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import FeedPage from './pages/FeedPage'
import LessonsPage from './pages/LessonsPage'
import QuizzesPage from './pages/QuizzesPage'
import ScratchpadPage from './pages/ScratchpadPage'
import ScratchpadItemPage from './pages/ScratchpadItemPage'
import FiltersPage from './pages/FiltersPage'
import ImportLinkPage from './pages/ImportLinkPage'
import ImportGoogleDocumentPage from './pages/ImportGoogleDocumentPage'
import AudioAnalysisSharedReportPage from './pages/AudioAnalysisSharedReportPage'
import ImportWarningDialog from './components/ImportWarningDialog'
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'
//import VideoPlayerTest from './components/VideoPlayerTest'
import IncomingMergeHost from './components/IncomingMergeHost'
import SyncSourcesHost from './components/SyncSourcesHost'
import { applySourceUrlMergeBatch } from './sourceUrlSync'
import { bookIndexNeedsRepair } from './tuneCandidateFilter'
import { registerMergeCheckHandler, unregisterMergeCheckHandler, runMergeChecksNow } from './mergeCheckTrigger'
import { beginDriveMergeCheckingToast, endDriveMergeCheckingToast } from './driveMergeCheckingToast'
import MidiPlayer from './components/MidiPlayer'

import useTuneBook from './useTuneBook'
import { registerDevTunebookSeeder } from './devSeed/seedTunebook'
import { installChordMigrationConsole } from './chordMigrationConsole'
//import axios from 'axios'
import useAppData from './useAppData'
import useUtils from './useUtils'
import useIndexes from './useIndexes'
import useGoogleSheet from './useGoogleSheet'
import useGoogleDocument from './useGoogleDocument'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import useTuneEditHistory from './useTuneEditHistory'
import useServiceWorker from './useServiceWorker'
import useAppFreshLoad from './useAppFreshLoad'
import useTextSearchIndex from './useTextSearchIndex'
import useGoogleLogin from './useGoogleLogin' 
import useAudioAnalysisLoginSync from './useAudioAnalysisLoginSync'
import useScratchpadLoginSync from './useScratchpadLoginSync'
import useMediaCacheDriveBackupSync from './useMediaCacheDriveBackupSync'
//import useGoogleDocument from './useGoogleDocument' 
//import GoogleLogin from './GoogleLogin'
import NowPlayingHost from './components/NowPlayingHost'
import LessonExternalMediaHost from './components/LessonExternalMediaHost'
import MidiFilePlaybackHost from './components/MidiFilePlaybackHost'
import NowPlayingTransportBar from './components/NowPlayingTransportBar'
import NowPlayingPage from './pages/NowPlayingPage'
import QueuePlayConfirmModal from './components/QueuePlayConfirmModal'
import DriveUploadShrinkConfirmModal from './components/DriveUploadShrinkConfirmModal'
import {
  readLastDriveUploadSnapshot,
  writeLastDriveUploadSnapshot,
  isLastDriveUploadAbcEcho,
} from './driveUploadShrinkGuard'
import LinksEditorModal from './components/LinksEditorModal'
import { getViewedTuneIdFromPath, shouldShowPlaylistTransportBar } from './playbackNavigationUtils'
import { isQueueActive, suspendQueue, resumeQueue, startPreviewOnce, getCurrentItem, getCurrentTuneId, isExternalQueueItem, isLessonExternalMedia } from './nowPlayingQueue'
import { isGigPlaylistActive } from './gigRouteUtils'
import { handleQueueAdvanceOnEnded, playCurrentQueueItem, playQueueItem, navigateToQueueTune } from './nowPlayingQueuePlayback'
import { setStandaloneMediaPlaybackEndedHandler } from './standaloneMediaPlayback'
import useTuneBookMediaController from './useTuneBookMediaController'
import usePracticeSession from './usePracticeSession'
import usePracticeRouteSync from './usePracticeRouteSync'
import useSearchFilterRouteSync from './useSearchFilterRouteSync'
import ImportModalRoutePage from './pages/ImportModalRoutePage'
import CollectionCuratorPage from './pages/CollectionCuratorPage'
import SnapcastPage from './pages/SnapcastPage'
import { isRemoteOutputUiEnabled } from './remoteOutputUi'
import { RemoteOutputProvider } from './RemoteOutputProvider'
import AddPage from './pages/AddPage'
import LegacyShowParamRedirect from './LegacyShowParamRedirect'
import PracticeSessionModals from './components/PracticeSessionModals'
import { useInitMediaResolverHealth } from './useMediaResolverHealth'
import { TuneMediaAnalysisProvider } from './useTuneMediaAnalysis'
import { PlaybackRegionScanProvider } from './usePlaybackRegionScan'
import LongRunningJobNavigationGuard from './LongRunningJobNavigationGuard'
import ChordRecordNavigationGuard from './components/ChordRecordNavigationGuard'
import BulkCheckYoutubeHost from './components/BulkCheckYoutubeHost'
import BulkCheckCompleteToastHost from './components/BulkCheckCompleteToastHost'
import YoutubeHelperInstallHost from './components/YoutubeHelperInstallHost'
import AndroidBatteryPrompt from './components/AndroidBatteryPrompt'
import BackgroundJobCompletionNotifications from './backgroundJobCompletionNotifications'
import AudioExportDownloadNotifications from './AudioExportDownloadNotifications'
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
import { restoreAndResume as restoreAndResumeAudioGenerationQueue } from './audioGenerationJobStore'
import {
  restoreAndResume as restoreAndResumeChordReadinessCleanupQueue,
  setChordReadinessCleanupQueueContext,
} from './chordReadinessCleanupQueue'
import {
  restoreAndResume as restoreAndResumeFieldLookupQueue,
  setTuneFieldLookupQueueContext,
} from './tuneFieldLookupQueue'
import useSyncWorker from './useSyncWorker'	
import useRouteAnalytics from './useRouteAnalytics'
import { compareTuneBooks, mergeDeletedTuneMaps, parseDeletedTunesFromAbc } from './tuneBookSync'
import { pruneDeletedTunesFromPlaylists } from './playlistTunePrune'
import { compareTuneBooksStreaming } from './tuneBookSyncStreaming'
import { iterateTunesFromAbcAsync } from './tuneAbcStream'
import { parseSyncManifest, iterateShardedTunesFromAbc } from './tuneShardSync'
import { configureTuneRepository, setMonolithTunesRef } from './tuneRepository'
import { yieldToMain } from './tuneListFilter'
import {
  setPerformanceSetsChangeHandler,
} from './performanceSetStore'
import {
  setPlaylistsChangeHandler,
} from './savedPlaylistsStore'
import {
  setPracticeListsChangeHandler,
} from './practiceListStore'
import {
  mergePerformanceSetsFromTuneBookAbc,
  applyPreparedPerformanceSetMerge,
  replacePerformanceSetsFromTuneBookAbc,
} from './performanceSetSyncClient'
import {
  mergePlaylistsFromTuneBookAbc,
  applyPreparedPlaylistMerge,
} from './playlistSyncClient'
import {
  mergePracticeListsFromTuneBookAbc,
} from './practiceListSyncClient'
import { PERFORMANCE_SETS_DRIVE_SOURCE_KEY, PLAYLISTS_DRIVE_SOURCE_KEY } from './incomingMergePrefs'
import { normalizeSourceUrlKey } from './sourceUrlSync'
import PerformanceSetMergeHost from './components/PerformanceSetMergeHost'
import PlaylistMergeHost from './components/PlaylistMergeHost'
import { syncPendingRecordingUploads } from './linkRecording'
import { warmOwnedMediaCacheOnLogin } from './mediaCacheWarmOnLogin'
import { isNavigatorOffline } from './offlineNetwork'
import { syncPendingTuneFileUploads } from './tuneFiles'
import {
  applyDriveRecordStateToTunes,
  stripMassDeletesFromSheetResults,
  sanitizeRemoteDeletedAgainstLocalTunes,
  isMassDeleteBatch,
} from './incomingMergeUtils'
import { TunesProvider } from './TunesContext'

import {useState, useEffect, useRef, useCallback} from 'react';
//import jwt_decode from "jwt-decode";
import {HashRouter as Router, Routes, Route, Link, Navigate, useLocation, useParams, useNavigate, useSearchParams} from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import './theme.css';
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'
import {ToastContainer, toast}  from 'react-toastify'
import AppEmbedFrameBootstrap from './components/AppEmbedFrameBootstrap'
import { isEmbeddedAppFrame } from './embedFrameUtils'
import { scheduleMediaCacheStorageCheck } from './mediaCacheStorage'
import { initChromeZoomGuard } from './chromeZoomGuard'
import { isAndroidApp } from './platformUtils'
import { staggerNativeStartup } from './deferNativeStartup'

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

function SearchFilterRouteSync(props) {
  useSearchFilterRouteSync(props)
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
      user={props.user}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      forceRefresh={props.forceRefresh}
      currentTuneBook={props.currentTuneBook}
      setCurrentTuneBook={props.setCurrentTuneBook}
      login={props.login}
      logout={props.logout}
      requestGoogleScopes={props.requestGoogleScopes}
      onOpenTune={function(tune) {
        if (tune && tune.id) navigate('/tunes/' + encodeURIComponent(tune.id))
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
/** Main shell waits for tunes unless the user landed on Stripe checkout return URLs. */
function AppTunesGatedShell(props) {
  const location = useLocation()
  const billingCheckout = location.pathname === '/billing/success' || location.pathname === '/billing/cancel'
  if (props.tunes === null && !billingCheckout) return null
  return props.children
}

function AppMainChrome(props) {
  const embedded = useIsEmbeddedAppFrame()
  const [nowPlayingExpanded, setNowPlayingExpanded] = useState(false)
  const [nowPlayingFocus, setNowPlayingFocus] = useState('playlist')

  function openNowPlaying(focus) {
    setNowPlayingFocus(focus === 'viewed' ? 'viewed' : 'playlist')
    setNowPlayingExpanded(true)
  }

  if (embedded) return null
  return (
    <>
      <Header
        {...props.headerProps}
        onOpenNowPlaying={openNowPlaying}
      />
      <AppQueueLayer
        {...props.queueProps}
        nowPlayingExpanded={nowPlayingExpanded}
        setNowPlayingExpanded={setNowPlayingExpanded}
        nowPlayingFocus={nowPlayingFocus}
        onOpenNowPlaying={openNowPlaying}
      />
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
  const [linksEditorTuneId, setLinksEditorTuneId] = useState(null)
  const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
  const nowPlayingExpanded = !!props.nowPlayingExpanded
  const setNowPlayingExpanded = props.setNowPlayingExpanded
  const nowPlayingFocus = props.nowPlayingFocus === 'viewed' ? 'viewed' : 'playlist'
  const openNowPlaying = props.onOpenNowPlaying
  const showPlaylistTransport = !nowPlayingExpanded && shouldShowPlaylistTransportBar(
    location.pathname,
    props.nowPlayingQueue,
    props.gigModeActive,
    props.mediaController
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

  useEffect(function() {
    if (typeof document === 'undefined') return undefined
    if (nowPlayingExpanded) {
      document.body.classList.add('app-now-playing-expanded')
    } else {
      document.body.classList.remove('app-now-playing-expanded')
    }
    return function() {
      document.body.classList.remove('app-now-playing-expanded')
    }
  }, [nowPlayingExpanded])

  useEffect(function() {
    if (location.pathname !== '/now-playing') return
    if (typeof openNowPlaying === 'function') openNowPlaying('playlist')
    else if (typeof setNowPlayingExpanded === 'function') setNowPlayingExpanded(true)
    navigate('/books', { replace: true })
  }, [location.pathname, navigate, setNowPlayingExpanded, openNowPlaying])

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

  const linksEditorTune = linksEditorTuneId && props.tunes
    ? props.tunes[linksEditorTuneId]
    : null

  function handleOpenLinksEditor(tuneId) {
    if (!tuneId) return
    if (typeof setNowPlayingExpanded === 'function') setNowPlayingExpanded(false)
    setLinksEditorTuneId(tuneId)
  }

  function handleCloseLinksEditor() {
    setLinksEditorTuneId(null)
  }

  return (
    <>
      <MidiFilePlaybackHost
        mediaController={props.mediaController}
        tunebook={props.tunebook}
        tunes={props.tunes}
      />
      <NowPlayingHost
        nowPlayingQueue={props.nowPlayingQueue}
        tunes={props.tunes}
        mediaController={props.mediaController}
        tunebook={props.tunebook}
        viewedTuneId={viewedTuneId}
        pathname={location.pathname}
        practiceSessionActive={props.practiceSessionActive}
        gigModeActive={props.gigModeActive}
        nowPlayingExpanded={nowPlayingExpanded}
      />
      <LessonExternalMediaHost
        nowPlayingQueue={props.nowPlayingQueue}
        setNowPlayingQueue={props.setNowPlayingQueue}
        tunes={props.tunes}
        tunebook={props.tunebook}
        mediaController={props.mediaController}
        navigate={navigate}
        location={location}
        setPlaylist={props.setPlaylist}
        practiceSessionActive={props.practiceSessionActive}
      />
      <QueuePlayConfirmModal
        request={props.queuePlayConfirm}
        onPlayThisTune={handleQueueConfirmPlayThisTune}
        onResumePlaylist={handleQueueConfirmResumePlaylist}
        onCancel={function() { props.setQueuePlayConfirm(null) }}
      />
      {nowPlayingExpanded ? (
        <div
          className="now-playing-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Now playing"
          onClick={function(event) {
            if (event.target !== event.currentTarget) return
            if (typeof setNowPlayingExpanded === 'function') setNowPlayingExpanded(false)
          }}
        >
          <NowPlayingPage
            mediaController={props.mediaController}
            tunebook={props.tunebook}
            tunes={props.tunes}
            nowPlayingQueue={props.nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            setQueuePlayConfirm={props.setQueuePlayConfirm}
            returnPath={location.pathname}
            nowPlayingFocus={nowPlayingFocus}
            viewedTuneId={viewedTuneId}
            login={props.login}
            token={props.token}
            onClose={function() {
              if (typeof setNowPlayingExpanded === 'function') setNowPlayingExpanded(false)
            }}
            onOpenLinksEditor={handleOpenLinksEditor}
          />
        </div>
      ) : null}
      {linksEditorTune ? (
        <LinksEditorModal
          hideTrigger
          show={true}
          onShowChange={function(next) {
            if (!next) handleCloseLinksEditor()
          }}
          mediaController={props.mediaController}
          forceRefresh={props.forceRefresh}
          tunebook={props.tunebook}
          tune={linksEditorTune}
          token={props.token}
          user={props.user}
          googleDocumentId={props.googleDocumentId}
          login={props.login}
          onTuneChange={function(updated) {
            const tuneId = (updated && updated.id) || linksEditorTuneId
            if (!tuneId || !props.tunebook || !props.tunebook.saveTune) return
            const live = props.tunes && props.tunes[tuneId]
            const toSave = Object.assign({}, live || {}, updated || {}, { id: tuneId })
            if (Array.isArray(updated && updated.links)) {
              toSave.links = updated.links
            } else if (live && Array.isArray(live.links)) {
              toSave.links = live.links
            }
            props.tunebook.saveTune(toSave)
            if (typeof props.forceRefresh === 'function') props.forceRefresh()
          }}
          onChange={function(nextLinks, targetId) {
            const tuneId = targetId || linksEditorTuneId
            const tune = tuneId && props.tunes ? props.tunes[tuneId] : null
            if (!tune) return
            if (props.tunebook && props.tunebook.saveTune) {
              props.tunebook.saveTune(Object.assign({}, tune, { id: tuneId, links: nextLinks }))
            }
            if (typeof props.forceRefresh === 'function') props.forceRefresh()
          }}
        />
      ) : null}
      {!nowPlayingExpanded ? (
        <NowPlayingTransportBar
          nowPlayingQueue={props.nowPlayingQueue}
          setNowPlayingQueue={props.setNowPlayingQueue}
          tunebook={props.tunebook}
          tunes={props.tunes}
          mediaController={props.mediaController}
          gigModeActive={props.gigModeActive}
          queuePlayConfirm={props.queuePlayConfirm}
          setQueuePlayConfirm={props.setQueuePlayConfirm}
          nowPlayingExpanded={nowPlayingExpanded}
          onNowPlayingExpandedChange={setNowPlayingExpanded}
          onOpenNowPlaying={openNowPlaying}
          token={props.token}
        />
      ) : null}
    </>
  )
}

function App(props) {
  const tuneBookName='ABC Tune Book'
  //let mediaController = useTuneBookMediaController()
  let dbTunes = {}
  let utils = useUtils();
  let abcTools = useAbcTools();
  const abcjsParser = useAbcjsParser();
  //window.onclick=function(e) {
    ////window.scrollTo(0,e.y)
  //}
  var {user, token, login, logout, refresh, requestGoogleScopes, loadCurrentUser, loadUserImage, breakLoginToken, authMode, authBase} = useGoogleLogin({usePrompt: false, loginButtonId: 'google_login_button', scopes:['https://www.googleapis.com/auth/drive.file'] })
  useInitMediaResolverHealth(
    token && token.access_token ? token.access_token : null,
    authMode === 'token' ? requestGoogleScopes : null,
    login
  )
  useAudioAnalysisLoginSync(token, logout)
  const scratchpadSync = useScratchpadLoginSync(token, logout)
  useMediaCacheDriveBackupSync(token, logout)
  const filesDocumentManager = useGoogleDocument(token, logout)
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, tunesContentRevision, tunesHydrated, flushTunesPersistence, deletedTunes, setDeletedTunes, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, queuePlayConfirm, setQueuePlayConfirm, scrollOffset, setScrollOffset , filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, albumFilter, setAlbumFilter, starredFilter, setStarredFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, listDisplayMode, setListDisplayMode, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport} = useAppData()
  useAppFreshLoad()
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
  // Bumped when a Drive merge is applied/cleared so in-flight compares cannot
  // immediately re-open the same incoming-merge warning.
  const driveMergeEpochRef = useRef(0)

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

  function offerPracticeListMerge(abcText) {
    return mergePracticeListsFromTuneBookAbc(abcText, {
      interactive: false,
      applySilently: true,
    }).then(function(result) {
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
    return initChromeZoomGuard()
  }, []);

  useEffect(function() {
    scheduleMediaCacheStorageCheck(isAndroidApp() ? 15000 : 1500)
  }, [])

  function scheduleTuneReindex(nextTunes) {
    if (!nextTunes) return
    if (indexes.reindexTunesAsync) {
      indexes.reindexTunesAsync(nextTunes).catch(function(err) {
        console.warn('Tune reindex failed', err)
      })
      return
    }
    indexes.resetBookIndex()
    indexes.resetTagIndex()
    indexes.indexTunes(nextTunes)
  }

  // Heal wiped/empty book indexes so book filters stay usable.
  const emptyIndexRepairAttemptedRef = useRef(false)
  useEffect(function() {
    if (!tunesHydrated || !indexes.indexesReady) return
    if (!bookIndexNeedsRepair(tunes, indexes.bookIndex)) {
      emptyIndexRepairAttemptedRef.current = false
      return
    }
    if (emptyIndexRepairAttemptedRef.current) return
    emptyIndexRepairAttemptedRef.current = true
    scheduleTuneReindex(tunes)
  }, [tunesHydrated, indexes.indexesReady, tunes, indexes.bookIndex])
   
  function applySourceUrlMergeWithSelections(batch, recordState) {
    if (!batch) return
    var nextTunes = applySourceUrlMergeBatch(tunes, batch, recordState)
    setTunes(nextTunes)
    buildTunesHash()
    scheduleTuneReindex(nextTunes)
    forceRefresh()
    updateSheet(0)
  }

  function applyDriveMergeWithSelections(sheetResults, recordState) {
    if (!sheetResults) return
    const localCount = Object.keys(tunesRef.current || tunes || {}).length
    // Toast Accept passes null recordState. Never apply a mass-delete wipe from
    // a emptied Drive head against a restored/full local library.
    const safeSheetResults = recordState
      ? sheetResults
      : stripMassDeletesFromSheetResults(sheetResults, localCount)
    if (!recordState) {
      applyMergeChanges(safeSheetResults)
      return
    }
    var applied = applyDriveRecordStateToTunes(tunes, safeSheetResults, recordState)
    if (isMassDeleteBatch(Object.keys(applied.deletes || {}).length, localCount)) {
      Object.keys(applied.deletes || {}).forEach(function(tuneId) {
        if (tunes[tuneId] && !applied.tunes[tuneId]) {
          applied.tunes[tuneId] = tunes[tuneId]
        }
      })
      applied.deletes = {}
    }
    var remoteDeleted = sanitizeRemoteDeletedAgainstLocalTunes(
      parseDeletedTunesFromAbc(safeSheetResults.fullSheet || ''),
      applied.tunes
    )
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
    Object.keys(nextTunes || {}).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    setDeletedTunes(nextDeleted)
    setTunes(nextTunes)
    // Eagerly publish merged tunes so an in-flight Drive compare cannot still
    // see pre-apply local state and re-open the same merge warning.
    tunesRef.current = nextTunes
    flushTunesPersistence()
    if (applied.deletes && Object.keys(applied.deletes).length > 0) {
      pruneDeletedTunesFromPlaylists(Object.keys(applied.deletes), nowPlayingQueue, setNowPlayingQueue)
    }
    buildTunesHash()
    scheduleTuneReindex(nextTunes)
    driveMergeEpochRef.current += 1
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
    offerPracticeListMerge(sheetResults.fullSheet)
  }

  function applyMergeChanges(changes) {
    var {filesToLoad, filesToSave, inserts, updates, deletes, localUpdates, localInserts, fullSheet} = changes
    var localCount = Object.keys(tunesRef.current || tunes || {}).length
    var safeDeletes = deletes || {}
    if (isMassDeleteBatch(Object.keys(safeDeletes).length, localCount)) {
      // Keep local tunes; mass remote deletes are treated as a wiped Drive head.
      safeDeletes = {}
    }
    var remoteDeleted = sanitizeRemoteDeletedAgainstLocalTunes(
      parseDeletedTunesFromAbc(fullSheet || ''),
      tunes
    )
    Object.keys(updates || {}).map(function(u)  {
      if (updates[u] && updates[u][1].id) {
        tunes[updates[u][1].id] = updates[u][1]
      }
    })
    Object.values(inserts || {}).forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    Object.keys(safeDeletes).forEach(function(tuneId) {
      if (tunes[tuneId]) {
        indexes.removeTune(tunes[tuneId], indexes.bookIndex)
        delete tunes[tuneId]
      }
    })
    var nextDeleted = mergeDeletedTuneMaps(deletedTunes, remoteDeleted)
    Object.keys(safeDeletes).forEach(function(tuneId) {
      if (!nextDeleted[tuneId]) {
        nextDeleted[tuneId] = {
          id: tuneId,
          deletedAt: Date.now(),
          name: safeDeletes[tuneId] && safeDeletes[tuneId].name,
        }
      }
    })
    Object.keys(inserts || {}).concat(Object.keys(updates || {})).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    Object.keys(localUpdates || {}).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    // Restored local tunes must not stay tombstoned.
    Object.keys(tunes || {}).forEach(function(tuneId) {
      delete nextDeleted[tuneId]
    })
    setDeletedTunes(nextDeleted)
    var deletedTuneIds = Object.keys(safeDeletes)
    Object.keys(remoteDeleted || {}).forEach(function(tuneId) {
      if (!tunes[tuneId] && deletedTuneIds.indexOf(tuneId) === -1) {
        deletedTuneIds.push(tuneId)
      }
    })
    if (deletedTuneIds.length > 0) {
      pruneDeletedTunesFromPlaylists(deletedTuneIds, nowPlayingQueue, setNowPlayingQueue)
    }
    
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (Object.keys(safeDeletes).length > 0)|| (filesToLoad && Object.keys(filesToLoad).length > 0) || (filesToSave && Object.keys(filesToSave).length > 0)) {
      setTunes(tunes)
      updateSheet(0)
    }
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (Object.keys(safeDeletes).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      tunesRef.current = tunes
      flushTunesPersistence()
      buildTunesHash()
      scheduleTuneReindex(tunes)
      driveMergeEpochRef.current += 1
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
    offerPracticeListMerge(fullSheet)
  }
  
   /** 
   * import songs to a tunebook from an abc file 
   */
  function mergeTuneBook(tunebookText) {
      return new Promise(function(resolve,reject) {
          beginDriveMergeCheckingToast()
          flushTunesPersistence()
          if (typeof flushActiveEditor === 'function' && currentTune) {
            flushActiveEditor(currentTune)
          }
          Promise.all([
            utils.loadLocalforageObject('bookstorage_tunes'),
            utils.loadLocalforageObject('bookstorage_deleted_tunes'),
          ]).then(async function(results) {
              var localTunes = results[0] || {}
              if (tunesHydratedRef.current && tunesRef.current && Object.keys(tunesRef.current).length > 0) {
                localTunes = tunesRef.current
              }
              var localDeleted = results[1] || {}
              var remoteDeleted = parseDeletedTunesFromAbc(tunebookText)
              var lastUpload = readLastDriveUploadSnapshot() || {}
              var compared
              if (tunebookText && Object.keys(localTunes).length > 500) {
                const sharded = parseSyncManifest(tunebookText)
                compared = await compareTuneBooksStreaming({
                  localTunes: localTunes,
                  localDeleted: localDeleted,
                  remoteDeleted: remoteDeleted,
                  lastUpdatedById: lastUpload.lastUpdatedById,
                  lastDeletedAtById: lastUpload.deletedAtById,
                  remoteTuneIterator: function(onTune) {
                    if (sharded) {
                      return new Promise(function(resolve) {
                        iterateShardedTunesFromAbc(
                          tunebookText,
                          abcTools.abc2json.bind(abcTools),
                          onTune
                        )
                        resolve()
                      })
                    }
                    return iterateTunesFromAbcAsync(
                      tunebookText,
                      abcTools.abc2json.bind(abcTools),
                      onTune,
                      { yieldToMain: yieldToMain, batchSize: 50 }
                    )
                  },
                })
              } else {
                var remoteTunes = {}
                if (tunebookText) {
                  abcTools.abc2Tunebook(tunebookText).forEach(function(tune) {
                    if (tune && tune.id) remoteTunes[tune.id] = tune
                  })
                }
                compared = compareTuneBooks({
                  localTunes: localTunes,
                  localDeleted: localDeleted,
                  remoteTunes: remoteTunes,
                  remoteDeleted: remoteDeleted,
                  lastUpdatedById: lastUpload.lastUpdatedById,
                  lastDeletedAtById: lastUpload.deletedAtById,
                })
              }
              var ret = Object.assign({}, compared, {
                fullSheet: tunebookText,
                remoteDeleted: remoteDeleted,
              })
              endDriveMergeCheckingToast()
              resolve(ret)
            }).catch(function(err) {
              endDriveMergeCheckingToast()
              reject(err)
            })
    })
  }
  
  function overrideTuneBook(fullSheet) {
    pauseSheetUpdates.current = true
    var tunes = {}
    abcTools.abc2Tunebook(fullSheet).forEach(function(tune) {
        if (tune && tune.id) tunes[tune.id] = tune
    })
    var remoteDeleted = parseDeletedTunesFromAbc(fullSheet)
    setDeletedTunes(remoteDeleted)
    replacePerformanceSetsFromTuneBookAbc(fullSheet)
    setTunes(tunes)
    writeLastDriveUploadSnapshot(tunes)
    updateSheet(0, { forceShrinkUpload: true }).then(function() {
      pauseSheetUpdates.current = false
    }) 
    // update indexes....
    buildTunesHash()
    scheduleTuneReindex(tunes)
    setSheetUpdateResults(null)
    forceRefresh()
  }
  

  var recurseLoadSheetTimeout = useRef(null)
  var pauseSheetUpdates = useRef(null)
  var pollingInterval = process.env.NODE_ENV === "development" ? 5000 : 6000 //16000
  const [driveShrinkWarning, setDriveShrinkWarning] = useState(null)
  const driveShrinkResolverRef = useRef(null)
  const requestDriveShrinkConfirmation = useCallback(function(warning) {
    return new Promise(function(resolve) {
      if (driveShrinkResolverRef.current) {
        driveShrinkResolverRef.current(false)
      }
      driveShrinkResolverRef.current = resolve
      setDriveShrinkWarning(warning)
    })
  }, [])
  var {updateSheet} = useGoogleSheet({
    token,
    logout,
    refresh,
    tunes,
    pollingInterval: pollingInterval,
    onMerge,
    pausePolling: pauseSheetUpdates,
    setGoogleDocumentId,
    googleDocumentId,
    onUploadShrinkWarning: requestDriveShrinkConfirmation,
  })

  useEffect(function() {
    if (!tunesHydrated) return
    if (readLastDriveUploadSnapshot()) return
    if (tunes && Object.keys(tunes).length > 0) {
      writeLastDriveUploadSnapshot(tunes)
    }
  }, [tunesHydrated, tunes])
  
  	var syncWorker = useSyncWorker(token, logout, tuneBookName)
  
  var tunesRef = useRef(tunes)
  tunesRef.current = tunes
  var tunesHydratedRef = useRef(tunesHydrated)
  tunesHydratedRef.current = tunesHydrated
  const getValidTuneIds = useCallback(function() {
    return Object.keys(tunesRef.current || {})
  }, [])
  const getTunesReady = useCallback(function() {
    return !!tunesHydratedRef.current
  }, [])
  var editHistory = useTuneEditHistory({ getValidTuneIds, getTunesReady })
  const activeEditorFlushRef = useRef(null)
  const flushActiveEditor = useCallback(function(tuneId) {
    if (!tuneId || tuneId !== currentTune) return
    if (activeEditorFlushRef.current) activeEditorFlushRef.current()
    if (editHistory && typeof editHistory.flushPendingTune === 'function') {
      editHistory.flushPendingTune(tuneId)
    }
  }, [currentTune, editHistory])
  const practiceSessionActiveRef = useRef(false)
  const nowPlayingQueueRef = useRef(nowPlayingQueue)
  nowPlayingQueueRef.current = nowPlayingQueue

  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, tunesHydrated, deletedTunes, setDeletedTunes, isLoggedIn: !!(token && token.access_token), ownedMediaUpload: token && token.access_token ? { token: token, driveApi: filesDocumentManager, googleDocumentId: googleDocumentId } : null, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, albumFilter, setAlbumFilter, starredFilter, setStarredFilter, filter, setFilter, groupBy, setGroupBy, filtered, grouped, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, forceNav, setForceNav, editHistory, flushActiveEditor, practiceSessionActiveRef})
  //var abcPlayerRef = useRef()
  let mediaController = useTuneBookMediaController({tunebook, tunes, forceRefresh, token, user, nowPlayingQueue, setNowPlayingQueue, setPlaylist, practiceSessionActiveRef})

  // Dev-only: expose window.seedTunebook()/clearTunebook() and honour ?seed=demo
  // so the app can be prepopulated with sample tunebook data for repro/tests.
  var tunebookRef = useRef(tunebook)
  tunebookRef.current = tunebook
  var mediaControllerRef = useRef(mediaController)
  mediaControllerRef.current = mediaController
  var abcjsParserRef = useRef(abcjsParser)
  abcjsParserRef.current = abcjsParser
  useEffect(function() {
    registerDevTunebookSeeder({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current },
    })
    installChordMigrationConsole({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current },
      getAbcjsParser: function() { return abcjsParserRef.current },
    })
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      Object.defineProperty(window, '__mediaController', { configurable: true, get: function() { return mediaControllerRef.current } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- register once on mount; refs stay current
  }, [])

  useEffect(function() {
    setStandaloneMediaPlaybackEndedHandler(function() {
      const queue = nowPlayingQueueRef.current
      if (!isQueueActive(queue) || queue.source !== 'media-search') return
      const item = getCurrentItem(queue)
      if (!isExternalQueueItem(item) || isLessonExternalMedia(item.externalMedia)) return
      handleQueueAdvanceOnEnded({
        queue: queue,
        setQueue: setNowPlayingQueue,
        tunes: tunesRef.current,
        tunebook: tunebookRef.current,
        mediaController: mediaControllerRef.current,
        navigate: function(path) {
          if (tunebookRef.current && tunebookRef.current.navigate) tunebookRef.current.navigate(path)
        },
        location: typeof window !== 'undefined'
          ? { pathname: (window.location.hash || '').replace(/^#/, '') }
          : { pathname: '' },
        setPlaylist: setPlaylist,
        practiceSessionActive: practiceSessionActiveRef.current,
        failCallback: function() {},
        playbackOptions: { fromUserGesture: false },
      })
    })
    return function() {
      setStandaloneMediaPlaybackEndedHandler(null)
    }
  }, [setNowPlayingQueue, setPlaylist])

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
    function getTuneFromStore(tuneId) {
      const tunes = tunesRef.current
      if (!tunes || tuneId == null) return null
      return tunes[tuneId] || tunes[String(tuneId)] || null
    }
    setBulkBackgroundResearchQueueContext({
      getTune: getTuneFromStore,
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
    })
    setBulkComposerDiscoveryQueueContext({
      getTune: getTuneFromStore,
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
    })
    setTuneFieldLookupQueueContext({
      getTune: getTuneFromStore,
      saveTune: tunebook.saveTune,
      forceRefresh: forceRefresh,
      abcTools: tunebook.abcTools,
      getTunebook: function() { return tunebookRef.current },
      getAbcjsParser: function() { return abcjsParserRef.current },
    })
    setChordReadinessCleanupQueueContext({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current },
      getAbcjsParser: function() { return abcjsParserRef.current },
      forceRefresh: forceRefresh,
    })
    staggerNativeStartup([
      { fn: restoreAndResume },
      { fn: restoreAndResumeComposerDiscoveryQueue },
      { fn: restoreAndResumeStemCreateQueue },
      {
        fn: function() {
          return restoreAndResumeAudioGenerationQueue(function(tuneId) {
            const tune = getTuneFromStore(tuneId)
            if (!tune) return null
            return {
              tune: tune,
              tunebook: tunebook,
              onTuneChange: function(updated) {
                tunebook.saveTune(updated)
                forceRefresh()
              },
            }
          })
        },
      },
      { fn: restoreAndResumeFieldLookupQueue },
      { fn: restoreAndResumeChordReadinessCleanupQueue },
    ])
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
        //tunebook.navigateToNextSong()
  //}})
  
  
  function onMerge(fullSheet) {
    if (!isLastDriveUploadAbcEcho(fullSheet)) {
    //var trialResults = 
    var epochAtStart = driveMergeEpochRef.current
    mergeTuneBook(fullSheet).then(function(trialResults) {
        // User already applied/dismissed while this compare was running.
        if (epochAtStart !== driveMergeEpochRef.current) return
        // warning if items are being deleted
        if (trialResults) {
			var needsWarning = Object.keys(trialResults.deletes).length > 0 || Object.keys(trialResults.updates).length > 0 || Object.keys(trialResults.inserts).length > 0
			if (needsWarning) {
			  setSheetUpdateResults(trialResults)
			  tunebook.utils.scrollTo('topofpage')
			  forceRefresh()
			} else if (Object.keys(trialResults.localUpdates).length > 0 || Object.keys(trialResults.localInserts).length > 0) {
			  // Local changes (edits newer than Drive, or new local-only tunes) are saved silently without warning.
			  applyMergeChanges(trialResults)
			} else {
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
    offerPracticeListMerge(fullSheet)
    }
    if (token && token.access_token && !isNavigatorOffline()) {
      syncPendingRecordingUploads({
        token: token,
        driveApi: filesDocumentManager,
        tunes: tunesRef.current,
        saveTune: tunebook.saveTune,
        googleDocumentId: googleDocumentId,
      }).then(function(result) {
        if (result && result.uploaded > 0) {
          const label = result.uploaded === 1 ? 'recording' : 'recordings'
          toast.success(result.uploaded + ' ' + label + ' synced to Google Drive')
        }
        return warmOwnedMediaCacheOnLogin(tunesRef.current, {
          token: token,
          driveApi: filesDocumentManager,
        })
      }).catch(function() {})
      syncPendingTuneFileUploads({
        token: token,
        driveApi: filesDocumentManager,
        tunes: tunesRef.current,
        saveTune: tunebook.saveTune,
        googleDocumentId: googleDocumentId,
      }).then(function(result) {
        if (result && result.uploaded > 0) {
          const label = result.uploaded === 1 ? 'file' : 'files'
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

  useEffect(function() {
    setPracticeListsChangeHandler(function() {
      if (token && token.access_token) {
        updateSheet(0)
      }
    })
    return function() {
      setPracticeListsChangeHandler(null)
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
        <ToastContainer autoClose={2000} style={{ zIndex: 1000001 }} />
          <input type='hidden' name="refreshHash" value={refreshHash} />
          <TunesProvider tunes={tunes} tunesContentRevision={tunesContentRevision}>
          <Router >
            <AppEmbedFrameBootstrap />
            <RouteAnalytics />
            <LegacyShowParamRedirect />
            <PracticeRouteSync practiceSession={practiceSession} />
            <SearchFilterRouteSync
              currentTuneBook={currentTuneBook}
              setCurrentTuneBook={setCurrentTuneBook}
              filter={filter}
              setFilter={setFilter}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              genreFilter={genreFilter}
              setGenreFilter={setGenreFilter}
              artistFilter={artistFilter}
              setArtistFilter={setArtistFilter}
              albumFilter={albumFilter}
              setAlbumFilter={setAlbumFilter}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
            />
            <LongRunningJobNavigationGuard />
            <ChordRecordNavigationGuard />
            <AppFootPedalHost
              tunebook={tunebook}
              mediaController={mediaController}
              nowPlayingQueue={nowPlayingQueue}
            />
            <BulkCheckYoutubeHost />
            <BulkCheckCompleteToastHost />
            <YoutubeHelperInstallHost />
            <AndroidBatteryPrompt />
            <BackgroundJobCompletionNotifications />
            <AudioExportDownloadNotifications />
            <BackgroundReviewNotifications
              practiceSessionActive={!!(practiceSession && practiceSession.sessionOpen)}
            />
            <IncomingMergeHost
              token={token}
              tunebook={tunebook}
              sheetUpdateResults={sheetUpdateResults}
              googleDocumentId={googleDocumentId}
              onApplyDriveMerge={applyDriveMergeWithSelections}
              onClear={function() { setSheetUpdateResults(null) }}
            />
            <DriveUploadShrinkConfirmModal
              warning={driveShrinkWarning}
              onCancel={function() {
                var resolve = driveShrinkResolverRef.current
                driveShrinkResolverRef.current = null
                setDriveShrinkWarning(null)
                if (typeof resolve === 'function') resolve(false)
              }}
              onConfirm={function() {
                var resolve = driveShrinkResolverRef.current
                driveShrinkResolverRef.current = null
                setDriveShrinkWarning(null)
                // Resolve true so the waiting updateSheet() continues and uploads once.
                if (typeof resolve === 'function') resolve(true)
              }}
            />
            <SyncSourcesHost
              token={token}
              tunebook={tunebook}
              tunes={tunes}
              tunesHydrated={tunesHydrated}
              deletedTunes={deletedTunes}
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
  
           <AppTunesGatedShell tunes={tunes}>
           <div >
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
                user={user}
                searchIndex={searchIndex}
                loadTuneTexts={loadTuneTexts}
                forceRefresh={forceRefresh}
                currentTuneBook={currentTuneBook}
                setCurrentTuneBook={setCurrentTuneBook}
                login={login}
                logout={logout}
                requestGoogleScopes={requestGoogleScopes}
                setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
              />
              <PlaybackRegionScanProvider
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                forceRefresh={forceRefresh}
              >
              <RemoteOutputProvider
                mediaController={mediaController}
                tunebook={tunebook}
                nowPlayingQueue={nowPlayingQueue}
                tunes={tunes}
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
                  albumFilter: albumFilter,
                  setAlbumFilter: setAlbumFilter,
                  filter: filter,
                  setFilter: setFilter,
                  groupBy: groupBy,
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
                  setPlaylist: setPlaylist,
                  practiceSessionActive: !!(practiceSession && practiceSession.sessionOpen),
                  gigModeActive: isGigPlaylistActive(setPlaylist),
                  login: login,
                  token: token,
                  forceRefresh: forceRefresh,
                  user: user,
                  googleDocumentId: googleDocumentId,
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
                    <Route  path={``}   element={<BooksPage mediaController={mediaController}  tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setQueuePlayConfirm={setQueuePlayConfirm} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token} user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setAlbumFilter={setAlbumFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />}  />
                    
                     <Route  path={`books`}   element={<BooksPage mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setQueuePlayConfirm={setQueuePlayConfirm} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setAlbumFilter={setAlbumFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                     
                     <Route  path={`tags`}   element={<BooksPage defaultTab={'tags'} mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setQueuePlayConfirm={setQueuePlayConfirm} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} login={login} requestGoogleScopes={requestGoogleScopes} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} filter={filter} tagFilter={tagFilter} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setAlbumFilter={setAlbumFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`library`}   element={<LibraryBrowsePage tunebook={tunebook} tunes={tunes} mediaController={mediaController} forceRefresh={forceRefresh} token={token} login={login} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} />} />
                    <Route  path={`filters`}   element={<FiltersPage tunebook={tunebook} setFilter={setFilter} setGroupBy={setGroupBy} setTagFilter={setTagFilter} setGenreFilter={setGenreFilter} setArtistFilter={setArtistFilter} setAlbumFilter={setAlbumFilter} setCurrentTuneBook={setCurrentTuneBook} />} />
                    
                    <Route  path={`feed`}   element={<FeedPage  tunebook={tunebook} tunes={tunes} user={user} accessToken={token && token.access_token ? token.access_token : null} />}  />
                    <Route  path={`lessons/:lessonId?`} element={<LessonsPage tunebook={tunebook} mediaController={mediaController} user={user} />} />
                    <Route  path={`quizzes`} element={<QuizzesPage tunebook={tunebook} user={user} />} />
                    <Route  path={`quizzes/:lessonId`} element={<QuizzesPage tunebook={tunebook} user={user} />} />
                    <Route  path={`scratchpad`} element={<ScratchpadPage tunebook={tunebook} tunes={tunes} token={token} login={login} driveApi={filesDocumentManager} requestGoogleScopes={requestGoogleScopes} scratchpadSync={scratchpadSync} />} />
                    <Route  path={`scratchpad/:itemId`} element={<ScratchpadItemPage tunebook={tunebook} tunes={tunes} token={token} user={user} login={login} editHistory={editHistory} mediaController={mediaController} forceRefresh={forceRefresh} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} requestGoogleScopes={requestGoogleScopes} scratchpadSync={scratchpadSync} />} />
                    <Route  path={`settings/*`}  element={<SettingsPage user={user} tunebook={tunebook} tunes={tunes} tunesHash={tunesHash} deletedTunes={deletedTunes} token={token} login={login} logout={logout} refresh={refresh} requestGoogleScopes={requestGoogleScopes} authMode={authMode} forceRefresh={forceRefresh} googleDocumentId={googleDocumentId} onCheckMergeNow={runMergeChecksNow} mediaController={mediaController} overrideTuneBook={overrideTuneBook} indexes={indexes} tunesContentRevision={tunesContentRevision} currentTuneBook={currentTuneBook} driveApi={filesDocumentManager} />}  />
                    <Route path={`collection-curator`} element={<CollectionCuratorPage token={token} tunebook={tunebook} />} />
                    <Route path={`snapcast`} element={isRemoteOutputUiEnabled()
                      ? <SnapcastPage mediaController={mediaController} tunebook={tunebook} nowPlayingQueue={nowPlayingQueue} tunes={tunes} />
                      : <Navigate to="/settings" replace />} />
                    <Route  path={`review`} element={<ReviewPage tunebook={tunebook} tunes={tunes} tunesHash={tunesHash} token={token} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} forceRefresh={forceRefresh} currentTuneBook={currentTuneBook} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />} />
                    <Route  path={`practice-lists`} element={<PracticeListsPage tunes={tunes} tunebook={tunebook} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} />} />
                    <Route  path={`practice-lists/:listId`} element={<PracticeListsPage tunes={tunes} tunebook={tunebook} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} />} />
                    <Route  path={`sets`} element={<SetsPage tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`sets/:setId`} element={<SetsPage tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig`} element={<SetsPage gigPickerMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig/:setId/:tuneId`} element={<SetsPage gigMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`gig/:setId`} element={<SetsPage gigMode={true} tunes={tunes} tunebook={tunebook} setPlaylist={setPlaylist} setSetPlaylist={setSetPlaylist} mediaController={mediaController} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} token={token} login={login} googleDocumentId={googleDocumentId} />} />
                    
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`privacy`}   element={<PrivacyPage    />}  />
                    <Route  path={`billing/success`} element={<BillingCheckoutPage outcome="success" token={token} login={login} />} />
                    <Route  path={`billing/cancel`} element={<BillingCheckoutPage outcome="cancel" token={token} login={login} />} />
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
                    <Route  path={`tuner`}   element={<TunerPage  tunebook={tunebook} token={token} login={login} logout={logout}   />}  />
                    <Route  path={`tuner/audioanalysis`}   element={<AudioAnalysisLegacyRedirect />}  />
                    <Route  path={`audioanalysis`}   element={<AudioAnalysisPage  tunebook={tunebook} token={token} login={login} logout={logout} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />}  />
                    <Route  path={`piano`}   element={<PianoPage  tunebook={tunebook}    />}  />
                    <Route  path={`metronome`}   element={<MetronomePage  tunebook={tunebook} currentTune={currentTune} tunes={tunes} />}  />
                    <Route  path={`lyrics`}   element={<LyricsPage  tunebook={tunebook} token={token} login={login} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />}  />
                    <Route path={`add`} element={<AddPage mediaController={mediaController} tunes={tunes} tunebook={tunebook} forceRefresh={forceRefresh} tunesHash={tunesHash} token={token} login={login} requestGoogleScopes={requestGoogleScopes} filter={filter} setFilter={setFilter} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} tagFilter={tagFilter} setTagFilter={setTagFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />} />
                    <Route path={`add/bulk`} element={<AddPage mediaController={mediaController} tunes={tunes} tunebook={tunebook} forceRefresh={forceRefresh} tunesHash={tunesHash} token={token} login={login} requestGoogleScopes={requestGoogleScopes} filter={filter} setFilter={setFilter} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} tagFilter={tagFilter} setTagFilter={setTagFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} />} />
                    <Route  path={`practice`} element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} login={login} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes} tunesHydrated={tunesHydrated} indexes={indexes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setQueuePlayConfirm={setQueuePlayConfirm} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} genreFilter={genreFilter} setGenreFilter={setGenreFilter} artistFilter={artistFilter} setArtistFilter={setArtistFilter} albumFilter={albumFilter} setAlbumFilter={setAlbumFilter} starredFilter={starredFilter} setStarredFilter={setStarredFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} waiting={waiting} tunesContentRevision={tunesContentRevision} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} listDisplayMode={listDisplayMode} setListDisplayMode={setListDisplayMode} tagCollation={tagCollation} setTagCollation={setTagCollation} />} />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} login={login} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes} tunesHydrated={tunesHydrated} indexes={indexes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setQueuePlayConfirm={setQueuePlayConfirm} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} genreFilter={genreFilter} setGenreFilter={setGenreFilter} artistFilter={artistFilter} setArtistFilter={setArtistFilter} albumFilter={albumFilter} setAlbumFilter={setAlbumFilter} starredFilter={starredFilter} setStarredFilter={setStarredFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} waiting={waiting} tunesContentRevision={tunesContentRevision} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} listDisplayMode={listDisplayMode} setListDisplayMode={setListDisplayMode} tagCollation={tagCollation} setTagCollation={setTagCollation} />}
                      />
                      <Route
                        path="check"
                        element={<Navigate to="/tunes" replace />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle   mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} filter={filter} groupBy={groupBy} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} albumFilter={albumFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} requestGoogleScopes={requestGoogleScopes} />} />
                      
                      <Route  path={`:tuneId/:playState`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} filter={filter} groupBy={groupBy} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} albumFilter={albumFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} requestGoogleScopes={requestGoogleScopes} />} />
                      
                      <Route  path={`:tuneId/:playState/:mediaLinkNumber`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} queuePlayConfirm={queuePlayConfirm} setQueuePlayConfirm={setQueuePlayConfirm} currentTuneBook={currentTuneBook} filter={filter} groupBy={groupBy} tagFilter={tagFilter} genreFilter={genreFilter} artistFilter={artistFilter} albumFilter={albumFilter} selected={selected} setPlaylist={setPlaylist} login={login} logout={logout} practiceSession={practiceSession} requestGoogleScopes={requestGoogleScopes} />} />
                      
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor  logout={logout} token={token} user={user} login={login} mediaController={mediaController} editHistory={editHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setNowPlayingQueue={setNowPlayingQueue}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} onNotationHelpModeChange={setNotationHelpActive} onRegisterActiveEditorFlush={function(fn) { activeEditorFlushRef.current = fn }} />} />
                        <Route  path={`:tuneId/:view`} element={<MusicEditor  logout={logout} token={token} user={user} login={login} mediaController={mediaController} editHistory={editHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setNowPlayingQueue={setNowPlayingQueue}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} onNotationHelpModeChange={setNotationHelpActive} onRegisterActiveEditorFlush={function(fn) { activeEditorFlushRef.current = fn }} />} />
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
                      <Route  path={`:googleDocumentId/share/tag/:tagName`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/tune/:tuneId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId/book/:bookName`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                      <Route  path={`:googleDocumentId`} element={<ImportGoogleDocumentPage tunebook={tunebook} token={token} refresh={login} setNavigateAfterImport={setNavigateAfterImport} setCurrentTuneBook={setCurrentTuneBook} setTagFilter={setTagFilter} setFilter={setFilter} />} />
                    </Route>
                    <Route
                      path={`audioanalysis/share/:manifestFileId`}
                      element={<AudioAnalysisSharedReportPage token={token} login={login} logout={logout} />}
                    />
                    
                    <Route  path={`importlink`} >
                      <Route  path={`:link`} element={<ImportLinkPage   tunesHydrated={tunesHydrated} tunes={tunes} setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}   setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       <Route  path={`:link/book/:bookName`} element={<ImportLinkPage   tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/play`} element={<ImportLinkPage autoplay={true}  tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}   setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName`} element={<ImportLinkPage   tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName/play`} element={<ImportLinkPage autoplay={true} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/tag/:tagName`} element={<ImportLinkPage   tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/tag/:tagName/play`} element={<ImportLinkPage autoplay={true} tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue} setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                      
                       <Route  path={`:link/tune/:tuneId`} element={<ImportLinkPage   tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/tune/:tuneId/play`} element={<ImportLinkPage  autoplay={true}  tunesHydrated={tunesHydrated} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} nowPlayingQueue={nowPlayingQueue} setNowPlayingQueue={setNowPlayingQueue}  setTagFilter={setTagFilter} setFilter={setFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                    </Route>
                    
                    <Route path={'blank'} element={<BlankPage mediaController={mediaController} />} />
                    
                  </Routes>
              </div>
              </RemoteOutputProvider>
              </PlaybackRegionScanProvider>
              </TuneMediaAnalysisProvider>
              </div>
           </AppTunesGatedShell>
              
            </Router>
          </TunesProvider>

            <div id="bottomofpage" >
               
            </div>
          
      
    </div>

  ); 
}

export default App;
//<Footer tunebook={tunebook} accessToken={token ? token.access_token : null} logout={logout} login={login} />
//<Route path={'playlist'} element={<DownloadPlaylistPage   mediaPlaylist={mediaPlaylist} tunebook={tunebook}   />} />
