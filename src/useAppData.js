import {useState} from 'react'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'

export default function useAppData() {

  let utils = useUtils();
  let abcTools = useAbcTools();
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
  const [showTempo, setShowTempo] = useState(false)
  const [tunesHash, setTunesHashInner] = useState(utils.loadLocalObject('bookstorage_tunes_hash')) 
  function setTunesHash(val) {
    setTunesHashInner(val)
    utils.saveLocalObject('bookstorage_tunes_hash', val)
  }
  
  
  function buildTunesHash(forceTunes) {
    var hashes = {}
    var ids = {}
    var useTunes = forceTunes ? forceTunes : tunes;
    if (Array.isArray(useTunes) && useTunes.length > 0) {
      Object.values(useTunes).forEach(function(tune) {
        if (tune.id && tune.voices) {
          //console.log('BTHBB',tune.notes)
          var hash = abcTools.getTuneHash(tune) 
          //utils.hash(tune.notes.join("\n"))
          if (!Array.isArray(hashes[hash])) hashes[hash] = []
          hashes[hash].push(tune.id)
          ids[tune.id] = hash
        }
      })
      console.log('BTH',{ids, hashes})
      setTunesHash({ids, hashes})
    } else {
      setTunesHash({ids:{}, hashes:{}})
    }
    
  }
  
  function updateTunesHash(tune) {
    //console.log('update tune hash',tunesHash)
     if (tune.id ) {
        var oldHash = tunesHash && tunesHash.ids ? tunesHash.ids[tune.id] : null
        if (oldHash) {
          //console.log('update tune hash have old', oldHash, tunesHash.hashes[oldHash])
          if (Array.isArray(tunesHash.hashes[oldHash])) {
            tunesHash.hashes[oldHash] = tunesHash.hashes[oldHash].filter(function(ids) {
              if (Array.isArray(ids) && ids.indexOf(tune.id) === -1) {
                return true
              } else {
                return false
              }
            })
            if (tunesHash && tunesHash.hashes && tunesHash.hashes[oldHash].length === 0) {
              delete tunesHash.hashes[oldHash]
            }
          }
          if (tunesHash && tunesHash.ids ) delete tunesHash.ids[tune.id]
        }
        var hash = hash = abcTools.getTuneHash(tune) 
        //utils.hash(tune.notes.join("\n"))
        //console.log('update tune hash have new', hash)
        if (!tunesHash)  tunesHash = {}
        if (!tunesHash.hashes)  tunesHash.hashes = {}
        if (!tunesHash.ids)  tunesHash.ids = {}
        tunesHash.hashes[hash] = true
        tunesHash.ids[tune.id] = hash
        setTunesHash(tunesHash)
     }
  }
  
  const [viewMode, setViewMode] = useState('music')
  const [tunes, setTunesInner] = useState(utils.loadLocalObject('bookstorage_tunes'));
  function setTunes(val) {
    setTunesInner(val)
    localStorage.setItem('bookstorage_tunes', JSON.stringify(val))
  }
  const [sheetUpdateResults, setSheetUpdateResults] = useState(null)
  
 return {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash, tempo, setTempo, beatsPerBar, setBeatsPerBar, currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults, updateTunesHash, buildTunesHash, showTempo, setShowTempo, viewMode, setViewMode} 
  
}
