import './App.css';
import Header from './components/Header'
import HomePage from './pages/HomePage'
import PrintPage from './pages/PrintPage'
import CheatSheetPage from './pages/CheatSheetPage'
import ReviewPage from './pages/ReviewPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import SettingsPage from './pages/SettingsPage'
import PrivacyPage from './pages/PrivacyPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import RecordingsPage from './pages/RecordingsPage'
import ImportLinkPage from './pages/ImportLinkPage'
import ImportGoogleDocumentPage from './pages/ImportGoogleDocumentPage'
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
import useGoogleDocument from './useGoogleDocument' 

//import GoogleLogin from './GoogleLogin'

function App(props) {
  
  //return <GoogleLogin />
  
  let params = useParams();
  let dbTunes = {}
  let utils = useUtils();
  let abcTools = useAbcTools();
  
  var {user, token, login, logout, refresh} = useGoogleLogin({usePrompt: false, loginButtonId: 'google_login_button', scopes:['https://www.googleapis.com/auth/drive.file'] })
  
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash,updateTunesHash, buildTunesHash, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults,  viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId } = useAppData()
  useServiceWorker()
    
  const indexes = useIndexes()
  
   
  function applyMergeChanges(changes) {
    var {inserts, updates, deletes, localUpdates} = changes
    console.log('apply',changes)
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
    console.log('applied',tunes)
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
      console.log('merge',tunebookText)
      var inserts={}
      var updates={}
      var patches={} // updates with common parent
      var deletes={}
      var localUpdates={}
      if (tunebookText) {
        //console.log('haveabc')
        var intunes = abcTools.abc2Tunebook(tunebookText)
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
      }
      var ret = {inserts, updates, deletes, localUpdates, fullSheet: tunebookText}
      console.log('merge done' ,ret)
      return ret
  }
  
  function overrideTuneBook(fullSheet) {
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
  
  var {updateSheet} = useGoogleSheet({token, refresh, tunes, pollingInterval:16000, onMerge, pausePolling: pauseSheetUpdates, setGoogleDocumentId, googleDocumentId}) 
  
  //var recordingTools = {getRecording, createRecording, updateRecording, updateRecordingTitle, deleteRecording}
  const recordingsManager = useRef(useRecordingsManager({token, user}))
  //console.log("app",recordingsManager)
  
  var tunebook = useTuneBook({importResults, setImportResults, tunes, setTunes, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, buildTunesHash, updateTunesHash, pauseSheetUpdates, recordingsManager: recordingsManager.current})
  
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
      
          <input type='hidden' value={refreshHash} />
          <Router >
            {(showWarning(sheetUpdateResults)) ? <>
              <MergeWarningDialog sheetUpdateResults={sheetUpdateResults} closeWarning={closeWarning} acceptChanges={acceptChanges} revokeToken={logout} overrideTuneBook={overrideTuneBook} />
            </> : null}
            {(showImportWarning(importResults)) ? <>
              <ImportWarningDialog tunebook={tunebook} importResults={importResults} setImportResults={setImportResults} closeWarning={closeWarning} acceptChanges={function(changes) {
                //console.log('changes',changes)
              }} overrideTuneBook={overrideTuneBook} />
            </> : null}
  
           {(!showWarning(sheetUpdateResults) && !showImportWarning(importResults) && tunes !== null) && <div>   
              <Header tunebook={tunebook}  token={token} googleDocumentId={googleDocumentId} currentTune={currentTune} />
              <div className="App-body">
                  <Routes>
                    <Route  path={``}   element={<HomePage  tunebook={tunebook}     currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook} />}  />
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`settings`}   element={<SettingsPage  tunebook={tunebook} token={token}  googleDocumentId={googleDocumentId} />}  />
                    <Route  path={`recordings`} >
                      <Route index element={<RecordingsPage   tunebook={tunebook}/>}  />
                      <Route  path={`:recordingId`} element={<RecordingPage   tunebook={tunebook}  />} />
                    </Route>
                    
                    <Route  path={`privacy`}   element={<PrivacyPage    />}  />
                    
                    <Route  path={`cheatsheet`} >
                      <Route index element={<CheatSheetPage  tunes={tunes}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}     />}  />
                      <Route  path={`:tuneBook`} element={<CheatSheetPage   tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}   />} />
                    </Route>
                    <Route  path={`print`} >
                      <Route index element={<PrintPage   tunes={tunes} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunes={tunes}   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`review`} >
                      <Route index element={<ReviewPage   tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneId`} element={<ReviewPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh}  tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage  importResults={importResults} setImportResults={setImportResults} setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle viewMode={viewMode} setViewMode={setViewMode} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}  token={token}  googleDocumentId={googleDocumentId}/>} />
                    </Route>  
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor pushHistory={pushHistory} popHistory={popHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}      />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route  path={`:curation/:tuneId`} element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                      <Route  path={`:curation`} element={<ImportPage   importResults={importResults} setImportResults={setImportResults} tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`importdoc`} >
                      <Route  path={`:googleDocumentId`} element={<ImportGoogleDocumentPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                      <Route  path={`:googleDocumentId/:tuneId`} element={<ImportGoogleDocumentPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                    </Route>
                    
                    <Route  path={`importlink`} >
                      <Route  path={`:link`} element={<ImportLinkPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                       <Route  path={`:link/:tuneId`} element={<ImportLinkPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}  token={token} refresh={login}  importResults={importResults} setImportResults={setImportResults} />} />
                    </Route>
                      
                  </Routes>
                  
              </div>
              </div>}
              <Footer tunebook={tunebook} accessToken={token ? token.access_token : null} logout={logout} login={login} />
            </Router>

            <div id="bottomofpage" ></div>
          
      
    </div>

  ); 
}

export default App;
