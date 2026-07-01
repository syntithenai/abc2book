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
import CheatSheetPage from './pages/CheatSheetPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import ChordsPage from './pages/ChordsPage'
import SettingsPage from './pages/SettingsPage'
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
import MergeWarningDialog from './components/MergeWarningDialog'
import MidiPlayer from './components/MidiPlayer'

import useTuneBook from './useTuneBook'
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
import useTuneBookMediaController from './useTuneBookMediaController'
import usePracticeSession from './usePracticeSession'
import { useInitMediaResolverHealth } from './useMediaResolverHealth'
import { TuneMediaAnalysisProvider } from './useTuneMediaAnalysis'
import { PlaybackRegionScanProvider } from './usePlaybackRegionScan'
import LongRunningJobNavigationGuard from './LongRunningJobNavigationGuard'
import useSyncWorker from './useSyncWorker'	
import useRouteAnalytics from './useRouteAnalytics'
import { compareTuneBooks, mergeDeletedTuneMaps, parseDeletedTunesFromAbc } from './tuneBookSync'

import {useState, useEffect, useRef, useCallback} from 'react';
//import jwt_decode from "jwt-decode";
import {useParams, useLocation, useNavigate} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'
import {ToastContainer}  from 'react-toastify'

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

function App(props) {
  let params = useParams();
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
  const {tunes, setTunes, setTunesInner, deletedTunes, setDeletedTunes, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, mediaPlaylist, setMediaPlaylist, scrollOffset, setScrollOffset , abcPlaylist, setAbcPlaylist, filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, showPreviewInList, setShowPreviewInList, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport} = useAppData()
  useServiceWorker()
  
  
  
  const indexes = useIndexes()
  const [blockKeyboardShortcuts, setBlockKeyboardShortcuts] = useState(false)

  useEffect(function() {
    if (isMobile) {
      document.documentElement.classList.add('platform-mobile');
    }
    return function() {
      document.documentElement.classList.remove('platform-mobile');
    };
  }, []);
   
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
  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, deletedTunes, setDeletedTunes, isLoggedIn: !!(token && token.access_token), currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, tagFilter, setTagFilter, filter, setFilter, groupBy, setGroupBy, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, mediaPlaylist, setMediaPlaylist, abcPlaylist, setAbcPlaylist, forceNav, setForceNav, editHistory})
  //var abcPlayerRef = useRef()
  let mediaController = useTuneBookMediaController({tunebook, tunes, forceRefresh, token, user}) 
  const practiceSession = usePracticeSession({
    tunebook,
    tunes,
    mediaController,
    setCurrentTune,
    setViewMode,
  })
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
  }
  
  
    
    //<div  id="loginbuttondiv" style={{float:'left',fontSize:'0.6em'}} data-size="small" data-type="icon"  ></div>  }  
  
    
  useEffect(function() {
    if (!textSearchIndex || !textSearchIndex.tokens) {
      loadTextSearchIndex(textSearchIndex)
    }
    buildTunesHash()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap for search index and tune hash
  }, [])
  
  
  
  
  
  // set media player current tune
  //useEffect(function() {
     //mediaController.init()
  //},[window.location.href, tunes, currentTune])
  
  
  function closeWarning() {
    //console.log('closeWarning')
    //updateSheet(0)
    logout()
    setSheetUpdateResults(null)
  }
  
  function acceptChanges() {
    //console.log('acceptChanges')
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
            <RouteAnalytics />
            <LongRunningJobNavigationGuard />
            {(token && showWarning(sheetUpdateResults)) ? <>
              <MergeWarningDialog tunebook={tunebook} sheetUpdateResults={sheetUpdateResults} closeWarning={closeWarning} acceptChanges={acceptChanges} revokeToken={logout} overrideTuneBook={overrideTuneBook} />
            </> : null}
            {(showImportWarning(importResults)) ? <>
              <ImportWarningDialog tunebook={tunebook} navigateAfterImport={navigateAfterImport} importResults={importResults} setImportResults={setImportResults} closeWarning={closeWarning} acceptChanges={function(changes) {
                //console.log('changes',changes)
              }} overrideTuneBook={overrideTuneBook} />
            </> : null}
  
           {((!showWarning(sheetUpdateResults)|| !user) && !showImportWarning(importResults)  && tunes !== null) && <div >   
              <div style={{position:'absolute', top:'12em', right:'0.5em'}}><ToastContainer /></div>
            
              <TuneMediaAnalysisProvider
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                forceRefresh={forceRefresh}
              >
              <PlaybackRegionScanProvider
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                forceRefresh={forceRefresh}
              >
              <Header isSyncing={syncWorker.isRunning} breakLoginToken={breakLoginToken} forceNav={forceNav} setForceNav={setForceNav} mediaController={mediaController} tunebook={tunebook}  tunes={tunes} user={user}   token={token} logout={logout} login={login} requestGoogleScopes={requestGoogleScopes} googleDocumentId={googleDocumentId} currentTune={currentTune} setCurrentTune={setCurrentTune} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} tagFilter={tagFilter} setTagFilter={setTagFilter} filter={filter} setFilter={setFilter} setGroupBy={setGroupBy} forceRefresh={forceRefresh} tunesHash={tunesHash} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} selected={selected} loadUserImage={loadUserImage} practiceSession={practiceSession} />
              <div className="App-body">
                   <Routes>
                    <Route  path={``}   element={<BooksPage mediaController={mediaController}  tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token} user={user} setTagFilter={setTagFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />}  />
                    
                     <Route  path={`books`}   element={<BooksPage mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} setTagFilter={setTagFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                     
                     <Route  path={`tags`}   element={<BooksPage defaultTab={'tags'} mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} setCurrentTune={setCurrentTune}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} setTagFilter={setTagFilter} setFilter={setFilter} setGroupBy={setGroupBy} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                    <Route  path={`filters`}   element={<FiltersPage tunebook={tunebook} setFilter={setFilter} setGroupBy={setGroupBy} setTagFilter={setTagFilter} setCurrentTuneBook={setCurrentTuneBook} />} />
                    
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`settings`}  element={<SettingsPage user={user}    tunebook={tunebook} token={token}  googleDocumentId={googleDocumentId} />}  />
                    
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
                      <Route index element={<PrintPage   tunes={tunes} tunebook={tunebook}  selected={selected}  />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunes={tunes}   tunebook={tunebook} selected={selected} selectedCount={selectedCount}  />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tuner`}   element={<TunerPage  tunebook={tunebook}    />}  />
                    <Route  path={`piano`}   element={<PianoPage  tunebook={tunebook}    />}  />
                    <Route  path={`metronome`}   element={<MetronomePage  tunebook={tunebook}    />}  />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} filter={filter} setFilter={setFilter}  groupBy={groupBy} setGroupBy={setGroupBy} tagFilter={tagFilter} setTagFilter={setTagFilter} selected={selected} setSelected={setSelected} lastSelected={lastSelected} setLastSelected={setLastSelected} selectedCount={selectedCount} setSelectedCount={setSelectedCount} filtered={filtered} setFiltered={setFiltered} grouped={grouped} setGrouped={setGrouped}  tuneStatus={tuneStatus} setTuneStatus={setTuneStatus} listHash={listHash} setListHash={setListHash} startWaiting={startWaiting} stopWaiting={stopWaiting} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} showPreviewInList={showPreviewInList} setShowPreviewInList={setShowPreviewInList} tagCollation={tagCollation} setTagCollation={setTagCollation} />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle   mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                      <Route  path={`:tuneId/:playState`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                      <Route  path={`:tuneId/:playState/:mediaLinkNumber`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}   login={login} logout={logout} practiceSession={practiceSession} />} />
                      
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor  logout={logout} token={token} login={login} mediaController={mediaController} editHistory={editHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setAbcPlaylist={setAbcPlaylist}  setMediaPlaylist={setMediaPlaylist}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route  path={`:curation`} element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`importdoc`} >
                      <Route  path={`:googleDocumentId`} element={<ImportGoogleDocumentPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                      <Route  path={`:googleDocumentId/tune/:tuneId`} element={<ImportGoogleDocumentPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                      <Route  path={`:googleDocumentId/book/:bookName`} element={<ImportGoogleDocumentPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                    </Route>
                    
                    <Route  path={`importlink`} >
                      <Route  path={`:link`} element={<ImportLinkPage   tunes={tunes} setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}   setTagFilter={setTagFilter} navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       <Route  path={`:link/book/:bookName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/play`} element={<ImportLinkPage autoplay={true}  tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}   setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/book/:bookName/tag/:tagName/play`} element={<ImportLinkPage autoplay={true} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                       
                       <Route  path={`:link/tag/:tagName`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  setTagFilter={setTagFilter} />} />
                       
                       <Route  path={`:link/tag/:tagName/play`} element={<ImportLinkPage autoplay={true}  setMediaPlaylist={setMediaPlaylist} tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults}  forceRefresh={forceRefresh} mediaPlaylist={mediaPlaylist} setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport}  />} />
                      
                       <Route  path={`:link/tune/:tuneId`} element={<ImportLinkPage   tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
                       
                       <Route  path={`:link/tune/:tuneId/play`} element={<ImportLinkPage  autoplay={true}  tunes={tunes}  setTunes={setTunes}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} forceRefresh={forceRefresh} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  setTagFilter={setTagFilter}  navigateAfterImport={navigateAfterImport} setNavigateAfterImport={setNavigateAfterImport} />} />
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
