import './App.css';
import Header from './components/Header'
import HomePage from './pages/HomePage'
import PrintPage from './pages/PrintPage'
import CheatSheetPage from './pages/CheatSheetPage'
import ReviewPage from './pages/ReviewPage'
import MenuPage from './pages/MenuPage'
import MusicPage from './pages/MusicPage'
import HelpPage from './pages/HelpPage'
import MusicSingle from './components/MusicSingle'
import MusicEditor from './components/MusicEditor'

import useTuneBook from './useTuneBook'

import useUtils from './useUtils'

import {useState, useEffect} from 'react';
import {useParams, useLocation} from 'react-router-dom';
import {HashRouter as  Router,Routes, Route, Link  } from 'react-router-dom'
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
import AbcAudio from './components/AbcAudio'

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
  let utils = useUtils();
  var [midiBuffer, setMidiBuffer] = useState(null)
  var [timingCallbacks, setTimingCallbacks] = useState(null)
  var [audioContext, setAudioContext] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const [refreshHash, setRefreshHash] = useState(false)
  function forceRefresh() {
    setRefreshHash(utils.generateObjectId())
  }
  const [pageMessage, setPageMessageInner] = useState('')  
  var messageTimeout = null
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
  
  var tunebook = useTuneBook({startWaiting, stopWaiting, setPageMessage,isMobile, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook, forceRefresh})
  
  
  function primeAudio(e) {
    //console.log('prime audio')
    if (!audioContext) {
      //console.log('prime audio  real')
      utils.primeAudio().then(function(audioContext) {
        //console.log('prime audio done')
        setAudioContext(audioContext)
      })
    }
  }
  
  
  function AppPageContent(props) {
     return <div>
          <div>
            <input type='hidden' value={refreshHash} />
            <Router >
                
              <Header tunebook={tunebook} currentTune={currentTune}   />
              <div className="App-body">
                
                  <Routes>
                    <Route  path={``}   element={<HomePage  tunebook={tunebook}    />}  />
                    <Route  path={`help`}   element={<HelpPage  tunebook={tunebook}    />}  />
                    <Route  path={`cheatsheet`} >
                      <Route index element={<CheatSheetPage  tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<CheatSheetPage   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`print`} >
                      <Route index element={<PrintPage  tunebook={tunebook}    />}  />
                      <Route  path={`:tuneBook`} element={<PrintPage   tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`review`} >
                      <Route index element={<ReviewPage audioContext={audioContext} setAudioContext={setAudioContext} midiBuffer={midiBuffer} setMidiBuffer={setMidiBuffer} timingCallbacks={timingCallbacks}  setTimingCallbacks={setTimingCallbacks}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh} tunebook={tunebook}    />}  />
                      <Route  path={`:tuneId`} element={<ReviewPage audioContext={audioContext} setAudioContext={setAudioContext} midiBuffer={midiBuffer} setMidiBuffer={setMidiBuffer} timingCallbacks={timingCallbacks}  setTimingCallbacks={setTimingCallbacks}   currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  forceRefresh={forceRefresh}  tunebook={tunebook}    />} />
                    </Route>
                    <Route  path={`menu`}   element={<MenuPage  tunebook={tunebook}    />}  />
                    <Route  path={`tunes`}     >
                      <Route
                        index 
                        element={<MusicPage  forceRefresh={forceRefresh} tunebook={tunebook} currentTuneBook={currentTuneBook} setCurrentTuneBook={setCurrentTuneBook}  />}
                      />
                      <Route  path={`:tuneId`} element={<MusicSingle audioContext={audioContext} setAudioContext={setAudioContext} midiBuffer={midiBuffer} setMidiBuffer={setMidiBuffer} timingCallbacks={timingCallbacks}  setTimingCallbacks={setTimingCallbacks} forceRefresh={forceRefresh} tunebook={tunebook}    />} />
                    </Route>
                    
                    <Route  path={`editor`}     >
                      <Route  path={`:tuneId`} element={<MusicEditor audioContext={audioContext} setAudioContext={setAudioContext} midiBuffer={midiBuffer} setMidiBuffer={setMidiBuffer} timingCallbacks={timingCallbacks}  setTimingCallbacks={setTimingCallbacks}   isMobile={isMobile} forceRefresh={forceRefresh} tunebook={tunebook}    />} />
                    </Route>
                      
                  </Routes>
              </div>
             
            </Router>
          </div>
        </div>
  }
  
  return (
  
    <div id="topofpage" className="App" onClick={primeAudio} >
      <AbcAudio  tunebook={tunebook} tempo={tunebook.tempo} >
        <AppPageContent />
      </AbcAudio >  
    </div>
  );
}

export default App;
