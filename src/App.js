import './App.css';
import Header from './components/Header'
import HomePage from './pages/HomePage'
import PrintPage from './pages/PrintPage'
import CheatSheetPage from './pages/CheatSheetPage'
import ReviewPage from './pages/ReviewPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import ImportPage from './pages/ImportPage'
import HelpPage from './pages/HelpPage'
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'

import useTuneBook from './useTuneBook'
import axios from 'axios'
import useUtils from './useUtils'

import {useState, useEffect} from 'react';
import {useParams, useLocation} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
//import AbcAudio from './components/AbcAudio'

function Footer(props) {
  var location = useLocation()
  if (location.pathname.startsWith('/print')) return null
  
   return <div style={{backgroundColor:'#e8f8fe', height:'6em'}} >
          <Link to='/help' ><Button>Help</Button></Link>
          <div style={{textAlign:'center', fontSize:'0.7em'}}>(CopyLeft 2022)    Steve Ryan <a href='mailto:syntithenai@gmail.com'>syntithenai@gmail.com</a></div>
          <div style={{textAlign:'center', fontSize:'0.7em'}}>Source code on <a href='https://github.com/syntithenai/abc2book'>Github</a></div>
        </div>
}

function App(props) {
  let params = useParams();
  let dbTunes = {}
  let utils = useUtils();
  const [refreshHash, setRefreshHash] = useState(utils.generateObjectId())
  function forceRefresh() {
    setRefreshHash(utils.generateObjectId())
  }
  const [pageMessage, setPageMessageInner] = useState('')  
  var messageTimeout = null
  const [waiting, setWaiting] = useState('') 
  function startWaiting() {
    setWaiting(true)
  }
  function stopWaiting() {
    setWaiting(false)
  }
  function setPageMessage(message,timeout=0) {
      setPageMessageInner(message)
      if (timeout > 0) {
          if (messageTimeout) clearTimeout(messageTimeout) 
          messageTimeout = setTimeout(function() {setPageMessage('')},timeout)
      }
  }
  const [currentTune, setCurrentTuneInner] = useState(localStorage.getItem('bookstorage_current_tune') ? localStorage.getItem('bookstorage_current_tune') : 0);
  function setCurrentTune(val) {
    setCurrentTuneInner(val)
    localStorage.setItem('bookstorage_current_tune', val)
  }
  const [currentTuneBook, setCurrentTuneBookInner] = useState(localStorage.getItem('bookstorage_current_tunebook') ? localStorage.getItem('bookstorage_current_tunebook') : 0);
  function setCurrentTuneBook(val) {
    setCurrentTuneBookInner(val)
    localStorage.setItem('bookstorage_current_tunebook', val)
  }
  
   
  const [beatsPerBar, setBeatsPerBar] = useState(4) 
  const [textSearchIndex, setTextSearchIndex] = useState({}) 
  function getTextSearchIndex(index, callback) {
    if (index.tokens && Object.keys(index.tokens).length > 0) {
      callback(index)
    } else {
      // load the index from online
        axios.get('abc2book/textsearch_index.json').then(function(index) {
          if (callback) callback(index.data)
        }).catch(function(e) {
          console.log(["ERR",e])
        })
        
    }
  }
 
   
  //var tunesFrom = {}
  //try {
    //tunesFrom = JSON.parse(localStorage.getItem('bookstorage_tunes'))
  //} catch (e) {}
  
  
  
  const [tempo, setTempo] = useState('') //localStorage.getItem('bookstorage_tempo') ? localStorage.getItem('bookstorage_tempo') : '')
  //function setTempo(val) {
    //setTempoInner(val)
    //localStorage.setItem('bookstorage_tempo', val)
  //}
  
  
  const [tunesHash, setTunesHashInner] = useState(utils.loadLocalObject('bookstorage_tunes_hash')) 
  function setTunesHash(val) {
    setTunesHashInner(val)
    utils.saveLocalObject('bookstorage_tunes_hash', val)
  }
  
  const [tunes, setTunesInner] = useState(null);
  function setTunes(val) {
    setTunesInner(val)
    localStorage.setItem('bookstorage_tunes', JSON.stringify(val))
  }
  var tunebook = useTuneBook({tunes, setTunes, tempo, setTempo, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh, textSearchIndex, tunesHash, setTunesHash, beatsPerBar, setBeatsPerBar})
  
  useEffect(function() {
    var t = tunebook.utils.loadLocalObject('bookstorage_tunes')
    setTunesInner(t)
    console.log('loaded tunes',t)
    getTextSearchIndex(textSearchIndex, function(loadedIndex) { setTextSearchIndex(loadedIndex)})
    tunebook.buildTunesHash()
  },[])
  
  
  return (
  
    <div id="topofpage" className="App" >
        {(tunes !== null) && <div>
            <input type='hidden' value={refreshHash} />
            <Router >
                
              <Header tunebook={tunebook} currentTune={currentTune} beatsPerBar={beatsPerBar} setBeatsPerBar={setBeatsPerBar}  tempo={tempo} setTempo={setTempo} />
              <div className="App-body">
                
                  <Routes>
                    <Route  path={``}   element={<HomePage  tunebook={tunebook}    />}  />
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
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
                      <Route  path={`:tuneId`} element={<MusicSingle  tunes={tunes}   forceRefresh={forceRefresh} tunebook={tunebook}   tempo={tempo} setTempo={setTempo} />} />
                    </Route>
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor  tunes={tunes}  isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}  tempo={tempo} setTempo={setTempo}    />} />
                    </Route>
                    
                    <Route  path={`import`} >
                      <Route index element={<ImportPage   tunes={tunes} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook} />}  />
                      <Route  path={`:curation`} element={<ImportPage   tunes={tunes}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  tunebook={tunebook}    />} />
                    </Route>
                      
                  </Routes>
              </div>
             
            </Router>
          </div>}
    </div>
  );
}

export default App;
