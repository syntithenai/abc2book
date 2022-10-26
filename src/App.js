import './App.css';
import Header from './components/Header'
import HomePage from './pages/HomePage'
import BooksPage from './pages/BooksPage'
import PrintPage from './pages/PrintPage'
import PianoPage from './pages/PianoPage'
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
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'
import Footer from './components/Footer'
import MergeWarningDialog from './components/MergeWarningDialog'
import useTuneBook from './useTuneBook'
import axios from 'axios'
import useAppData from './useAppData'
import useUtils from './useUtils'
import useIndexes from './useIndexes'
import useGoogleSheet from './useGoogleSheet'
import useAbcTools from './useAbcTools'
import useHistory from './useHistory'
import useServiceWorker from './useServiceWorker'
import useTextSearchIndex from './useTextSearchIndex'
import {useState, useEffect, useRef} from 'react';
import jwt_decode from "jwt-decode";
import {useParams, useLocation} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button, Modal, Tabs, Tab} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'
import useRecordingsManager from './useRecordingsManager'
import useGoogleLogin from './useGoogleLogin' 
//import useGoogleDocument from './useGoogleDocument' 
//import GoogleLogin from './GoogleLogin'
  
function App(props) {
  let params = useParams();
  let dbTunes = {}
  let utils = useUtils();
  let abcTools = useAbcTools();
  //window.onclick=function(e) {
    //console.log('clickdoc',e.y) //,e.screenY,e.x,e.screenX)
    ////window.scrollTo(0,e.y)
  //}
  var [showWaitingOverlay, setShowWaitingOverlay] = useState(false)
  var {user, token, login, logout, refresh} = useGoogleLogin({usePrompt: false, loginButtonId: 'google_login_button', scopes:['https://www.googleapis.com/auth/drive.file'] })
  //console.log('APP',token)
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, mediaPlaylist, setMediaPlaylist } = useAppData()
  useServiceWorker()
    
  const indexes = useIndexes()
  const [blockKeyboardShortcuts, setBlockKeyboardShortcuts] = useState(false)
   
  function applyMergeChanges(changes) {
    var {inserts, updates, deletes, localUpdates} = changes
    //console.log('apply',changes)
    // save all inserts and updates
    // keep all local items that don't exist remotely
    Object.keys(deletes).forEach(function(d) {
       tunes[deletes[d].id] = deletes[d]
       //delete tunes[d]
    })
    Object.keys(updates).map(function(u)  {
      if (updates[u] && updates[u].id) {
        tunes[updates[u].id] = updates[u]
      }
    })
    Object.values(inserts).forEach(function(tune) {
      tunes[tune.id] = tune
    })
    // any more recent changes locally get saved online
    if ((localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)) {
      updateSheet(0)
    }
    //console.log('applied',tunes)
    if ((localUpdates && Object.keys(localUpdates).length > 0) || (deletes && Object.keys(deletes).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0)) {
      setTunes(tunes)
      buildTunesHash()
      indexes.resetBookIndex()
      indexes.indexTunes(tunes)
      setSheetUpdateResults(null)
    }
  }
  
   /** 
   * import songs to a tunebook from an abc file 
   */
  function mergeTuneBook(tunebookText) {
      setShowWaitingOverlay(true)
      //console.log('merge',tunebookText)
      var inserts={}
      var updates={}
      var patches={} // updates with common parent
      var deletes={}
      var localUpdates={}
      var intunes = {}
      if (tunebookText) {
      //console.log('haveabc')
        intunes = abcTools.abc2Tunebook(tunebookText)
      }
      var tunes = utils.loadLocalObject('bookstorage_tunes')
      //console.log('havetunes', intunes, "NOW",  tunes, tunesHash)
      var ids = []
      Object.values(intunes).forEach(function(tune) {
        // existing tunes are updated
        //console.log('tune in',tune.id, tune)
        if (tune.id && tunes[tune.id]) {
          // preserve boost
          tune.boost = tunes[tune.id].boost
          if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
            updates[tune.id] = tune
            //console.log('update MORE RECENT')
          } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
            localUpdates[tune.id] = tune
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
      //console.log(Object.keys(tunes))
      Object.keys(tunes).forEach(function(tuneId) {
        if (ids.indexOf(tuneId) === -1) {
          deletes[tuneId] = tunes[tuneId]
        }
      })
    
      var ret = {inserts, updates, deletes, localUpdates, fullSheet: tunebookText}
      //console.log('merge done' ,ret)
      setShowWaitingOverlay(false)
      return ret
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
    indexes.indexTunes(tunes)
    setSheetUpdateResults(null)
    setShowWaitingOverlay(false)
    forceRefresh()
  }
  

  
  function onMerge(fullSheet) {
    //console.log('onmerge')
    var trialResults = mergeTuneBook(fullSheet)
    //console.log('onmerge', fullSheet.length, trialResults)
    // warning if items are being deleted
    if (Object.keys(trialResults.deletes).length > 0 || Object.keys(trialResults.updates).length > 0 || Object.keys(trialResults.inserts).length > 0|| Object.keys(trialResults.localUpdates).length > 0) {
      //console.log('onmerge set results',trialResults)
      setSheetUpdateResults(trialResults)
      forceRefresh()
    } else { 
      //console.log('onmerge empty results',trialResults)
      setSheetUpdateResults(trialResults)
      //applyMergeChanges(trialResults)
      //forceRefresh()
    }
  }
  var recurseLoadSheetTimeout = useRef(null)
  var pauseSheetUpdates = useRef(null)
  var pollingInterval = process.env.NODE_ENV === "development" ? 5000 : 6000 //16000
  var {updateSheet} = useGoogleSheet({token, refresh, tunes, pollingInterval:pollingInterval, onMerge, pausePolling: pauseSheetUpdates, setGoogleDocumentId, googleDocumentId}) 
  
  //var recordingTools = {getRecording, createRecording, updateRecording, updateRecordingTitle, deleteRecording}
  const recordingsManager = useRecordingsManager(token)
  //console.log("app",recordingsManager)
  
  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, recordingsManager: recordingsManager})
  
  var {history, setHistory, pushHistory, popHistory} = useHistory({tunebook})
  

  
    
    //<div  id="loginbuttondiv" style={{float:'left',fontSize:'0.6em'}} data-size="small" data-type="icon"  ></div>  }  
  
    
  useEffect(function() {
    //var t = tunebook.utils.loadLocalObject('bookstorage_tunes')
    //setTunesInner(t)
    //console.log('loaded tunes',t)
    if (!textSearchIndex || !textSearchIndex.tokens) {
      loadTextSearchIndex(textSearchIndex) 
      //.then(function(loadedIndex) {setTextSearchIndex(loadedIndex)})
    }
    buildTunesHash()
    //applyGoogleWindowInit()
  },[])
  
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
    if (sheetUpdateResults !== null) {
      if (sheetUpdateResults.deletes && Object.keys(sheetUpdateResults.deletes).length > 0) {
        return true
      }
      if (sheetUpdateResults.updates && Object.keys(sheetUpdateResults.updates).length > 0) {
        return true
      }
      if (sheetUpdateResults.inserts && Object.keys(sheetUpdateResults.inserts).length > 0) {
        return true
      }
      //if (sheetUpdateResults.localUpdates && Object.keys(sheetUpdateResults.localUpdates).length > 0) {
        //return true
      //}
    }
    return false
  }
  
  function showImportWarning() {
    //if (sheetUpdateResults) return true
    //return false 
    //console.log('showWarning')
    if (importResults !== null) {
      return true
      //if (importResults.deletes && Object.keys(importResults.deletes).length > 0) {
        //return true
      //}
      //if (importResults.updates && Object.keys(importResults.updates).length > 0) {
        //return true
      //}
      //if (importResults.inserts && Object.keys(importResults.inserts).length > 0) {
        //return true
      //}
      //if (importResults.localUpdates && Object.keys(importResults.localUpdates).length > 0) {
        //return true
      //}
    }
    return false
  }
  
  return (

    <div id="topofpage" className="App" >
        {showWaitingOverlay && <div style={{zIndex:999999, position:'fixed', top:0, left:0, backgroundColor: 'grey', opacity:'0.5', height:'100%', width:'100%'}} ><img src="/spinner.svg" style={{marginTop:'10em', marginLeft:'10em', height:'200px', width:'200px'}} /></div> }  
          
          <input type='hidden' value={refreshHash} />
          <Router >
            {(token && showWarning(sheetUpdateResults)) ? <>
              <MergeWarningDialog tunebook={tunebook} sheetUpdateResults={sheetUpdateResults} closeWarning={closeWarning} acceptChanges={acceptChanges} revokeToken={logout} overrideTuneBook={overrideTuneBook} />
            </> : null}
            {(showImportWarning(importResults)) ? <>
              <ImportWarningDialog tunebook={tunebook} importResults={importResults} setImportResults={setImportResults} closeWarning={closeWarning} acceptChanges={function(changes) {
                //console.log('changes',changes)
              }} overrideTuneBook={overrideTuneBook} />
            </> : null}
  
           {((!showWarning(sheetUpdateResults)|| !user) && !showImportWarning(importResults)  && tunes !== null) && <div>   
              <Header tunebook={tunebook}  tunes={tunes} token={token} logout={logout} login={login}  googleDocumentId={googleDocumentId} currentTune={currentTune}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}   mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />
              <div className="App-body">
                  <Routes>
                    <Route  path={``}   element={<BooksPage  tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist}  />}  />
                    
                     <Route  path={`books`}   element={<BooksPage  tunes={tunes} tunebook={tunebook}   forceRefresh={forceRefresh} tunesHash={tunesHash}  currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />}  />
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`settings`}   element={<SettingsPage  tunebook={tunebook} token={token}  googleDocumentId={googleDocumentId} />}  />
                    <Route  path={`recordings`} >
                      <Route index element={<RecordingsPage   tunebook={tunebook} token={token} refresh={login}/>}  />
                      <Route  path={`:recordingId`} element={<RecordingPage   tunebook={tunebook} token={token} refresh={login} />} />
                    </Route>
                    
                    <Route  path={`privacy`}   element={<PrivacyPage    />}  />
                    
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
                      <Route index element={<PrintPage   tunes={tunes} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunes={tunes}   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`review`} >
                      <Route index element={<ReviewPage  googleDocumentId={googleDocumentId} token={token} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneId`} element={<ReviewPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh}  tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tuner`}   element={<TunerPage  tunebook={tunebook}    />}  />
                    <Route  path={`piano`}   element={<PianoPage  tunebook={tunebook}    />}  />
                    <Route  path={`metronome`}   element={<MetronomePage  tunebook={tunebook}    />}  />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage googleDocumentId={googleDocumentId} token={token} importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}  mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />} />
                      
                      <Route  path={`:tuneId/:playState`} element={<MusicSingle  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />} />
                      
                      <Route  path={`:tuneId/:playState/:mediaLinkNumber`} element={<MusicSingle  viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  googleDocumentId={googleDocumentId} blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} mediaPlaylist={mediaPlaylist} setMediaPlaylist={setMediaPlaylist} />} />
                      
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor pushHistory={pushHistory} popHistory={popHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    blockKeyboardShortcuts={blockKeyboardShortcuts} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}    />} />
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
                      <Route  path={`:link`} element={<ImportLinkPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                       <Route  path={`:link/book/:bookName`} element={<ImportLinkPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                       <Route  path={`:link/tune/:tuneId`} element={<ImportLinkPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                    </Route>
                    
                    <Route path={'playlist'} element={<DownloadPlaylistPage   mediaPlaylist={mediaPlaylist} tunebook={tunebook}   />} />
                    
                  </Routes>
                  
              </div>
              </div>}
              
            </Router>

            <div id="bottomofpage" ></div>
          
      
    </div>

  ); 
}

export default App;
//<Footer tunebook={tunebook} accessToken={token ? token.access_token : null} logout={logout} login={login} />
