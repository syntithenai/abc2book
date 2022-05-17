import './App.css';
import Header from './components/Header'
import HomePage from './pages/HomePage'
import PrintPage from './pages/PrintPage'
import CheatSheetPage from './pages/CheatSheetPage'
import ReviewPage from './pages/ReviewPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import PrivacyPage from './pages/PrivacyPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'

import useTuneBook from './useTuneBook'
import axios from 'axios'
import useAppData from './useAppData'
import useUtils from './useUtils'
import useGoogleSheet from './useGoogleSheet'
import useAbcTools from './useAbcTools'
import useHistory from './useHistory'
import useTextSearchIndex from './useTextSearchIndex'
import {useState, useEffect, useRef} from 'react';
import jwt_decode from "jwt-decode";
import {useParams, useLocation} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button, Modal} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'




function App(props) {
  
  let params = useParams();
  let dbTunes = {}
  let utils = useUtils();
  let abcTools = useAbcTools();
  const {textSearchIndex, setTextSearchIndex, loadTextSearchIndex} = useTextSearchIndex()
  const {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash, tempo, setTempo, beatsPerBar, setBeatsPerBar, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults} = useAppData()
  
  var recurseLoadSheetTimeout = useRef(null)

  var {applyGoogleWindowInit, updateSheet, loadSheet, initClient, getToken, revokeToken, loginUser, accessToken, mergeTuneBook, applyMergeChanges} = useGoogleSheet({tunes, setTunes, timeout:10000, setSheetUpdateResults, forceRefresh, recurseLoadSheetTimeout}) 
  
  var tunebook = useTuneBook({tunes, setTunes, tempo, setTempo, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, beatsPerBar, setBeatsPerBar, updateSheet})
  var {history, setHistory, pushHistory, popHistory} = useHistory({tunebook})
  

  
    
    //<div  id="loginbuttondiv" style={{float:'left',fontSize:'0.6em'}} data-size="small" data-type="icon"  ></div>  }  
  function Footer(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print')) return null
   
     return <div style={{position:'fixed', bottom: 0, left: 0, width:'100%',display:'block',clear:'both',backgroundColor:'#e8f8fe', height:'1.2em'}} >
              <Link style={{float:'right'}} to='/' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Home</Button></Link>
              <Link style={{float:'right', marginRight:'0.2em'}} to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Help</Button></Link>
              {props.accessToken ? <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px'}} size="sm" variant="danger" onClick={props.revokeToken} >Logout</Button> : <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px'}} size="sm" variant="success" onClick={function() {initClient(); getToken()}} >Login</Button>}
                
              <div style={{textAlign:'center', fontSize:'0.4em'}}><div>(CopyLeft 2022)    Steve Ryan <a href='mailto:syntithenai@gmail.com'>syntithenai@gmail.com</a>&nbsp;&nbsp;&nbsp;&nbsp;</div>
               <div>Source code on <a href='https://github.com/syntithenai/abc2book'>Github</a></div>
             </div>
          </div>
  } 
    
  useEffect(function() {
    //var t = tunebook.utils.loadLocalObject('bookstorage_tunes')
    //setTunesInner(t)
    //console.log('loaded tunes',t)
    if (!textSearchIndex || !textSearchIndex.tokens) {
      loadTextSearchIndex(textSearchIndex) 
      //.then(function(loadedIndex) {setTextSearchIndex(loadedIndex)})
    }
    tunebook.buildTunesHash()
    applyGoogleWindowInit()
    
    
  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          '/sw.js',
          {
            scope: '/',
          }
        );
        if (registration.installing) {
          console.log('Service worker installing');
        } else if (registration.waiting) {
          console.log('Service worker installed');
        } else if (registration.active) {
          console.log('Service worker active');
        }
      } catch (error) {
        console.error(`Service Registration failed with ${error}`);
      }
    }
  };
   console.error(`Register Service worker`);
  registerServiceWorker()
    
    
  },[])
  
  function closeWarning() {
    updateSheet(0)
    setSheetUpdateResults(null)
  }
  
  function acceptChanges() {
    applyMergeChanges(sheetUpdateResults)
    setSheetUpdateResults(null)
  } 
     
  function showWarning() {
    if (sheetUpdateResults !== null) {
      if (sheetUpdateResults.deletes && Object.keys(sheetUpdateResults.deletes).length > 0) {
        return true
      }
      //if (sheetUpdateResults.updates && Object.keys(sheetUpdateResults.updates).length > 0) {
        //return true
      //}
    }
    return false
  }
  return (
  
    <div id="topofpage" className="App" >
        {(showWarning(sheetUpdateResults)) ? <>
          <Modal.Dialog 
        backdrop="static"
        keyboard={false} onHide={closeWarning} >
            <Modal.Header closeButton>
              <Modal.Title>Update Warning</Modal.Title>
            </Modal.Header>

            <Modal.Body>
              <p>Changes made on another device have been detected. </p>
              {Object.keys(sheetUpdateResults.inserts).length ? <div><b>{Object.keys(sheetUpdateResults.inserts).length}</b> items inserted</div>: ''}
              {Object.keys(sheetUpdateResults.updates).length ?<div><b>{Object.keys(sheetUpdateResults.updates).length}</b> items updated</div>: ''}
              {Object.keys(sheetUpdateResults.deletes).length ?<div><b>{Object.keys(sheetUpdateResults.deletes).length}</b> items deleted</div>: ''}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="danger" onClick={closeWarning} >Override with Local Copy</Button>
              <Button variant="primary" onClick={acceptChanges} >Load Updates</Button>
            </Modal.Footer>
          </Modal.Dialog>
          
        </> : null}
        {(!showWarning(sheetUpdateResults) && tunes !== null) && <div>
            <input type='hidden' value={refreshHash} />
            <Router >
                
              <Header tunebook={tunebook} currentTune={currentTune} beatsPerBar={beatsPerBar} setBeatsPerBar={setBeatsPerBar}  tempo={tempo} setTempo={setTempo} />
              <div className="App-body">
                  <Routes>
                    <Route  path={``}   element={<HomePage  tunebook={tunebook}    />}  />
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`privacy`}   element={<PrivacyPage    />}  />
                    
                    <Route  path={`cheatsheet`} >
                      <Route index element={<CheatSheetPage  tunes={tunes}  tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<CheatSheetPage   tunes={tunes}   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`print`} >
                      <Route index element={<PrintPage   tunes={tunes} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunes={tunes}   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`review`} >
                      <Route index element={<ReviewPage   tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh} tunebook={tunebook}  tempo={tempo} setTempo={setTempo}    />}  />
                      <Route  path={`:tuneId`} element={<ReviewPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh}  tunebook={tunebook}   tempo={tempo} setTempo={setTempo}   />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage setCurrentTune={setCurrentTune} tunes={tunes}  tunesHash={props.tunesHash}  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle setBeatsPerBar={setBeatsPerBar} tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}   tempo={tempo} setTempo={setTempo} />} />
                    </Route>
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor pushHistory={pushHistory} popHistory={popHistory} tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}  tempo={tempo} setTempo={setTempo}    />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route  path={`:curation`} element={<ImportPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                      
                  </Routes>
                  
              </div>
              <Footer tunebook={tunebook} accessToken={accessToken} loginUser={loginUser} revokeToken={revokeToken} />
            </Router>

            <div id="bottomofpage" ></div>
          </div>}
      
    </div>
  );
}

export default App;
