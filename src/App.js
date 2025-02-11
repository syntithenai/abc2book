import './App.css';
import Header from './components/Header'
import Footer from './components/Footer'

import HomePage from './pages/HomePage'
import BooksPage from './pages/BooksPage'
import PrintPage from './pages/PrintPage'
import PianoPage from './pages/PianoPage'  
import BlankPage from './pages/BlankPage'
import TunerPage from './pages/TunerPage'
import DownloadPlaylistPage from './pages/DownloadPlaylistPage'
import MetronomePage from './pages/MetronomePage'
import CheatSheetPage from './pages/CheatSheetPage'
import ReviewPage from './pages/ReviewPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import ChordsPage from './pages/ChordsPage'
import SettingsPage from './pages/SettingsPage'
import PrivacyPage from './pages/PrivacyPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import RecordingsPage from './pages/RecordingsPage'
import ImportLinkPage from './pages/ImportLinkPage'
import ImportGoogleDocumentPage from './pages/ImportGoogleDocumentPage'
import ImportGoogleAudioPage from './pages/ImportGoogleAudioPage'
import ImportWarningDialog from './components/ImportWarningDialog'
import RecordingPage from './pages/RecordingPage'
import FilesPage from './pages/FilesPage'
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
import useHistory from './useHistory'
import useServiceWorker from './useServiceWorker'
import useTextSearchIndex from './useTextSearchIndex'
import useRecordingsManager from './useRecordingsManager'
import useGoogleLogin from './useGoogleLogin' 
//import useGoogleDocument from './useGoogleDocument' 
//import GoogleLogin from './GoogleLogin'
import useTuneBookMediaController from './useTuneBookMediaController'
import useFileManager from './useFileManager' 
import useSyncWorker from './useSyncWorker'	

import {useState, useEffect, useRef} from 'react';
//import jwt_decode from "jwt-decode";
import {useParams, useLocation, useNavigate} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'


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
  var {user, token, login, logout, refresh,loadCurrentUser, loadUserImage, breakLoginToken} = useGoogleLogin({usePrompt: false, loginButtonId: 'google_login_button', scopes:['https://www.googleapis.com/auth/drive.file'] })
  const filesDocumentManager = useGoogleDocument(token, logout)
  //console.log('APP',token)
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, mediaPlaylist, setMediaPlaylist, scrollOffset, setScrollOffset , abcPlaylist, setAbcPlaylist, filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, showPreviewInList, setShowPreviewInList, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport} = useAppData()
  useServiceWorker()
  
  
  
  const indexes = useIndexes()
  const [blockKeyboardShortcuts, setBlockKeyboardShortcuts] = useState(false)
   
  function applyMergeChanges(changes) {
    var {filesToLoad, filesToSave, inserts, updates, deletes, localUpdates, localInserts} = changes
    //console.log('apply',tunes, token,changes)
    // save all inserts and updates
    // keep all local items that don't exist remotely
    //Object.keys(deletes).forEach(function(d) {
       //tunes[deletes[d].id] = deletes[d]
       ////delete tunes[d]
    //})
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u][1].id) {
        tunes[updates[u][1].id] = updates[u][1]
      }
    })
    Object.values(inserts).forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    
    
    // any more recent changes locally get saved online
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)|| (filesToLoad && Object.keys(filesToLoad).length > 0) || (filesToSave && Object.keys(filesToSave).length > 0)) {
      setTunes(tunes)
      updateSheet(0)
    }
    //console.log('applied',tunes)
    // 
    if ((localInserts && Object.keys(localInserts).length > 0) || (localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.resetTagIndex()
      indexes.indexTunes(tunes)
      setSheetUpdateResults(null)
    }
    
    filesDocumentManager.syncAttachedFiles(tunes, (token ? token.access_token : null)).then(function(res) {setTunes(res)})     
  }
  
   /** 
   * import songs to a tunebook from an abc file 
   */
  function mergeTuneBook(tunebookText) {
      return new Promise(function(resolve,reject) {
          setShowWaitingOverlay(true)
          //console.log('mergetb',tunebookText)
          var inserts={}
          var updates={}
          var patches={} // updates with common parent
          var deletes={}
          var localUpdates={}
          var localInserts={}
          //var filesToSave = {}
          //var filesToLoad = {}
          
          var intunes = {}
          if (tunebookText) {
          //console.log('haveabc')
            intunes = abcTools.abc2Tunebook(tunebookText)
          }
          //console.log('havetunes', intunes)
          //var tunes = utils.loadLocalObject('bookstorage_tunes')
          utils.loadLocalforageObject('bookstorage_tunes').then(function(tunes) {
              //console.log('havetunes', intunes, "NOW",  tunes, tunesHash)
              var ids = []
              Object.values(intunes).forEach(function(tune) {
                // existing tunes are updated
                //console.log('tune in',tune.id, tune)
                if (tune.id && tunes[tune.id]) {
					// sync files
					//if (tunes[tune.id] && Array.isArray(tunes[tune.id].files) && tunes[tune.id].files.length > 0) {
						////console.log('tune files', tunes[tune.id].files)
						//tunes[tune.id].files.forEach(function(file, fileKey) {
							//if (file.googleDocumentId && !file.data) {
								//// load from online
								//filesToLoad[tune.id] = fileKey
							//}
							//if (!file.googleDocumentId && file.data) {
								//// save online
								//filesToSave[tune.id] = fileKey
							//}
						//})
				  //}
                  // preserve boost
                  //tune.boost = tunes[tune.id].boost
                  if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
                    updates[tune.id] = [tunes[tune.id], tune]
                    //console.log('update MORE RECENT')
                  } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
                    localUpdates[tune.id] = [tune,tunes[tune.id]]
                    //console.log('local update MORE RECENT')
                  } else {
                    //console.log('skip update NOT MORE RECENT')
                  }
                  ids.push(tune.id)
                // new tunes 
                } else {
                   //console.log('insert')
                   if (!tune.id) tune.id = utils.generateObjectId()
                   inserts[tune.id] = tune
                }
              })
              //console.log(ids)
              //console.log(tuness)
              //
              //for (var tkey in tunes) {
                  //console.log(tkey)
              //}
              //var tkeys = Object.keys(tunes)
              //console.log(tkeys)
              Object.keys(tunes).forEach(function(tuneId) {
                if (ids.indexOf(tuneId) === -1) {
                  localInserts[tuneId] = tunes[tuneId]
                }
              })
            
              var ret = {inserts, updates, deletes, localUpdates,localInserts, fullSheet: tunebookText}
              //console.log('merge done' ,filesToLoad, filesToSave, ret)filesToLoad, filesToSave, 
              setShowWaitingOverlay(false)
              resolve(ret)
            })
    })
  }
  
  function overrideTuneBook(fullSheet) {
    setShowWaitingOverlay(true)
    //console.log('overrideTuneBook')
    pauseSheetUpdates.current = true
    var tunes = {}
    abcTools.abc2Tunebook(fullSheet).forEach(function(tune) {
        if (tune && tune.id) tunes[tune.id] = tune
    })
    //console.log("FORCE TUNESN",tunes)
    // TODO - check in with user if applying changes
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
  
	var allowedImageMimeTypes = ['text/plain','image/*','application/pdf','application/musicxml','.musicxml','.mxl'] //application/musicxml
	var fileManager = useFileManager('files',token, logout, null, allowedImageMimeTypes, false, false)
	var allowedAudioMimeTypes = ['audio/*']
	var recordingsFileManager = useFileManager('recordings',token, logout, null, allowedAudioMimeTypes)
	
  	var syncWorker = useSyncWorker(token, logout, tuneBookName)
  
	
	
  //var recordingTools = {getRecording, createRecording, updateRecording, updateRecordingTitle, deleteRecording}
  const recordingsManager = useRecordingsManager(token, logout, recordingsFileManager)
  //console.log("app",recordingsManager)
  
  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, tagFilter, setTagFilter, filter, setFilter, groupBy, setGroupBy, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, recordingsManager: recordingsManager, mediaPlaylist, setMediaPlaylist, abcPlaylist, setAbcPlaylist, forceNav, setForceNav})
  //var abcPlayerRef = useRef()
  let mediaController = useTuneBookMediaController({tunebook, tunes,forceRefresh}) 
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
			if (Object.keys(trialResults.deletes).length > 0 || Object.keys(trialResults.updates).length > 0 || Object.keys(trialResults.inserts).length > 0|| Object.keys(trialResults.localUpdates).length > 0) {
			  //console.log('onmerge set results',trialResults)
			  setSheetUpdateResults(trialResults)
			  tunebook.utils.scrollTo('topofpage')
			  forceRefresh()
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
  
  var {history, setHistory, pushHistory, popHistory} = useHistory({tunebook})
  

  
    
    //<div  id="loginbuttondiv" style={{float:'left',fontSize:'0.6em'}} data-size="small" data-type="icon"  ></div>  }  
  
    
  useEffect(function() {
    //var t = tunebook.utils.loadLocalObject('bookstorage_tunes')
    //setTunesInner(t)
    //console.log('loaded tunes',t)
    if (!textSearchIndex || !textSearchIndex.tokens) {
        //console.log('load index')
      loadTextSearchIndex(textSearchIndex) 
      //console.log('load index d',textSearchIndex)
      //.then(function(loadedIndex) {setTextSearchIndex(loadedIndex)})
    }
    buildTunesHash()
    //applyGoogleWindowInit()
    //mediaController.init()
  },[])
  
  
  
  
  
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
      
      if (sheetUpdateResults.localUpdates && Object.keys(sheetUpdateResults.localUpdates).length > 0) {
        return true
      }
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
    
        {showWaitingOverlay && <div style={{zIndex:999999, position:'fixed', top:0, left:0, backgroundColor: 'grey', opacity:'0.5', height:'100%', width:'100%'}} ><img src="/spinner.svg" style={{marginTop:'10em', marginLeft:'10em', height:'200px', width:'200px'}} /></div> }  
          <input type='hidden' name="refreshHash" value={refreshHash} />
          <Router >
            {(token && showWarning(sheetUpdateResults)) ? <>
              <MergeWarningDialog tunebook={tunebook} sheetUpdateResults={sheetUpdateResults} closeWarning={closeWarning} acceptChanges={acceptChanges} revokeToken={logout} overrideTuneBook={overrideTuneBook} />
            </> : null}
            {(showImportWarning(importResults)) ? <>
              <ImportWarningDialog tunebook={tunebook} navigateAfterImport={navigateAfterImport} importResults={importResults} setImportResults={setImportResults} closeWarning={closeWarning} acceptChanges={function(changes) {
                //console.log('changes',changes)
              }} overrideTuneBook={overrideTuneBook} />
            </> : null}
  
           {((!showWarning(sheetUpdateResults)|| !user) && !showImportWarning(importResults)  && tunes !== null) && <div >   
              <Header isSyncing={syncWorker.isRunning} breakLoginToken={breakLoginToken} forceNav={forceNav} setForceNav={setForceNav} mediaController={mediaController} tunebook={tunebook}  tunes={tunes} user={user}   token={token} logout={logout} login={login}  googleDocumentId={googleDocumentId} currentTune={currentTune}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} loadUserImage={loadUserImage} />
              <div className="App-body">
                   <Routes>
                    <Route  path={``}   element={<BooksPage mediaController={mediaController}  tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token} user={user} setTagFilter={setTagFilter} setFilter={setFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />}  />
                    
                     <Route  path={`books`}   element={<BooksPage mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} setTagFilter={setTagFilter} setFilter={setFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                     
                     <Route  path={`tags`}   element={<BooksPage defaultTab={'tags'} mediaController={mediaController} tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  scrollOffset={scrollOffset} setScrollOffset={setScrollOffset} token={token}  user={user} setTagFilter={setTagFilter} setFilter={setFilter} searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} googleDocumentId={googleDocumentId} />} />
                    
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`settings`}  element={<SettingsPage user={user}    tunebook={tunebook} token={token}  googleDocumentId={googleDocumentId} />}  />
                    
                    <Route  path={`recordings`} >
                      <Route index element={<RecordingsPage fileManager={recordingsFileManager} mediaController={mediaController}   tunebook={tunebook} tunes={tunes} logout={logout} token={token} refresh={login}/>}  />
                      <Route  path={`:recordingId`} element={<RecordingPage fileManager={recordingsFileManager}  tunebook={tunebook} token={token} refresh={login} />} />
                    </Route>
                    
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
                    <Route  path={`review`} >
                      <Route index element={<ReviewPage  mediaController={mediaController}  googleDocumentId={googleDocumentId} token={token} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneId`} element={<ReviewPage   mediaController={mediaController}  tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh}  tunebook={tunebook}    />} />
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
                      <Route  path={`:tuneId`} element={<MusicSingle   mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist} login={login} logout={logout} />} />
                      
                      <Route  path={`:tuneId/:playState`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}  login={login} logout={logout} />} />
                      
                      <Route  path={`:tuneId/:playState/:mediaLinkNumber`} element={<MusicSingle  mediaController={mediaController}  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token} user={user} googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  abcPlaylist={abcPlaylist} setAbcPlaylist={setAbcPlaylist}   login={login} logout={logout} />} />
                      
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor  logout={logout} token={token} login={login} mediaController={mediaController}  pushHistory={pushHistory} popHistory={popHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   setAbcPlaylist={setAbcPlaylist}  setMediaPlaylist={setMediaPlaylist}  searchIndex={searchIndex} loadTuneTexts={loadTuneTexts} />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route  path={`:curation`} element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`importaudio`} >
                      <Route  path={`:googleDocumentId`} element={<ImportGoogleAudioPage     tunebook={tunebook}  token={token} refresh={login}   />} />
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
                    
                    <Route path={'files'} element={<FilesPage  fileManager={fileManager} tunebook={tunebook}  tunes={tunes} token={token} logout={logout} />} />
                    
                    <Route path={'blank'} element={<BlankPage mediaController={mediaController} />} />
                    
                  </Routes>
                  
              </div>
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
