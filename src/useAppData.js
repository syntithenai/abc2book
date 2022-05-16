import {useState} from 'react'
import useUtils from './useUtils'

export default function useAppData() {

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
  
  const [tempo, setTempo] = useState('') //localStorage.getItem('bookstorage_tempo') ? localStorage.getItem('bookstorage_tempo') : '')
  
  const [tunesHash, setTunesHashInner] = useState(utils.loadLocalObject('bookstorage_tunes_hash')) 
  function setTunesHash(val) {
    setTunesHashInner(val)
    utils.saveLocalObject('bookstorage_tunes_hash', val)
  }
  
  const [tunes, setTunesInner] = useState(utils.loadLocalObject('bookstorage_tunes'));
  function setTunes(val) {
    setTunesInner(val)
    localStorage.setItem('bookstorage_tunes', JSON.stringify(val))
  }
  const [sheetUpdateResults, setSheetUpdateResults] = useState(null)
  
 return {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash, tempo, setTempo, beatsPerBar, setBeatsPerBar, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults} 
  
}
