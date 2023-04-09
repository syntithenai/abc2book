import {useState, useEffect} from 'react'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'

/**
 * Top level state for tunebook application
 */
export default function useAppData() {

  let utils = useUtils();
  let abcTools = useAbcTools();
  
  // refresh hash is used to force components to rerender
  const [refreshHash, setRefreshHash] = useState(utils.generateObjectId())
  function forceRefresh() {
    setRefreshHash(utils.generateObjectId())
  }
  
  // what is the current google document we are saving to
  const [googleDocumentId, setGoogleDocumentId] = useState(null)
  
  // list search filters
  var [filter, setFilter] = useState('')
  var [groupBy, setGroupBy] = useState('')
  var [tagFilter, setTagFilter] = useState('')
  var [showPreviewInList, setShowPreviewInList] = useState(false)
  // currentTuneBook is used as list filter and in many other places
  const [currentTuneBook, setCurrentTuneBookInner] = useState(localStorage.getItem('bookstorage_current_tunebook') ? localStorage.getItem('bookstorage_current_tunebook') : 0);
  function setCurrentTuneBook(val) {
    setCurrentTuneBookInner(val)
    setScrollOffsetReal(0)
    localStorage.setItem('bookstorage_current_tunebook', val)
  }
  
  
  // list cache
  var [filtered, setFiltered] = useState(null)
  var [grouped, setGrouped] = useState({})
  var [tuneStatus, setTuneStatus] = useState({})
  var [listHash, setListHash] = useState('')
  var [tagCollation, setTagCollation] = useState({})
  
  // selected tunes (list checkboxes) 
  // eg {<tuneId>:true, <tuneId>:true, <tuneId>:false }
  var [selected, setSelected] = useState({})
  // used for shift select
  var [lastSelected, setLastSelected] = useState({})
  // note that selected count needs to maintained when changing selection
  // value is cached to save rendering time
  var [selectedCount, setSelectedCount] = useState({})
  
  // waiting overlay
  const [waiting, setWaiting] = useState('') 
  function startWaiting() {
    setWaiting(true)
  }
  function stopWaiting() {
    setWaiting(false)
  }
  // navigate from outside router
  const [forceNav, setForceNav] = useState()
  
  // auto closing popup messages 
  const [pageMessage, setPageMessageInner] = useState('')  
  var messageTimeout = null
  
  function setPageMessage(message,timeout=0) {
      setPageMessageInner(message)
      if (timeout > 0) {
          if (messageTimeout) clearTimeout(messageTimeout) 
          messageTimeout = setTimeout(function() {setPageMessage('')},timeout)
      }
  }
  
    // scroll offset is saved when scrolling so list can automatically 
    // restore scroll on load
    const [scrollOffset, setScrollOffsetReal] = useState(null);
    const setScrollOffset = (e) => {
        //console.log('setScroll',window.pageYOffset,e)
        setScrollOffsetReal(window.pageYOffset);
    };
  
  // current tune is set when clicking list item or next/prev buttons
  // it is used to add a header icon allowing quick navigation back to the last tune
  const [currentTune, setCurrentTuneInner] = useState(localStorage.getItem('bookstorage_current_tune') ? localStorage.getItem('bookstorage_current_tune') : 0);
  function setCurrentTune(val) {
    setCurrentTuneInner(val)
    localStorage.setItem('bookstorage_current_tune', val)
  }
  
  // the tunes hash is used to determine if the audio generated from abc
  // notation needs to be updated
  // the hash maps from tune ids to a hash dependant on tune voices, key, .... (see abcTools.getTuneHash)
  const [tunesHash, setTunesHashInner] = useState({})
  useEffect(function() {
      utils.loadLocalforageObject('bookstorage_tunes_hash').then(function(data) {
        setTunesHashInner(data) 
      })
  }, [])
  function setTunesHash(val) {
    setTunesHashInner(val)
    utils.saveLocalforageObject('bookstorage_tunes_hash', val)
  }
  
  
  function buildTunesHash(forceTunes) {
    var hashes = {}
    var ids = {}
    var importhashes = {}
    var useTunes = forceTunes ? forceTunes : tunes;
    if (useTunes && Object.values(useTunes).length > 0) {
      Object.values(useTunes).forEach(function(tune) {
        if (tune.id && tune.voices) {
          var hash = abcTools.getTuneHash(tune) 
          var importhash = abcTools.getTuneImportHash(tune) 
          if (!Array.isArray(hashes[hash])) hashes[hash] = []
          hashes[hash].push(tune.id)
          ids[tune.id] = hash
          importhashes[tune.id] = importhash
        }
      })
      setTunesHash({ids, hashes, importhashes})
    } else {
      setTunesHash({ids:{}, hashes:{}, importhash: {}})
    }
    
  }
  
  function updateTunesHash(tune) {
     if (tune.id ) {
        var oldHash = tunesHash && tunesHash.ids ? tunesHash.ids[tune.id] : null
        if (oldHash) {
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
        if (!tunesHash)  tunesHash = {}
        if (!tunesHash.hashes)  tunesHash.hashes = {}
        if (!tunesHash.ids)  tunesHash.ids = {}
        tunesHash.hashes[hash] = true
        tunesHash.ids[tune.id] = hash
        setTunesHash(tunesHash)
     }
  }
  
  // display single view as music notation OR chords and lyrics
  const [viewMode, setViewMode] = useState('music')
  
  // memory copy of all tunes in the current database
  const [tunes, setTunesInner] = useState({});
  function setTunes(val) {
    setTunesInner(val)
    utils.saveLocalforageObject('bookstorage_tunes', val)
  }
  
  // load tunes when the page first loads
  useEffect(function() {
    utils.loadLocalforageObject('bookstorage_tunes').then(function(t) {
            setTunesInner(t)
            forceRefresh()
    })
  },[])
  
  // staging value for merge results (from online polling)
  // existence of this value triggers merge warning 
  const [sheetUpdateResults, setSheetUpdateResults] = useState(null)
  
  // staging value for import results to show changes before final import
  const [importResults, setImportResultsReal] = useState(null)
  function setImportResults(res) {
      utils.scrollTo('topofpage')
      setImportResultsReal(res)
  }
  
  // when a playlist is created, the tunebook automatically navigates to the
  // next tune when playback finishes
  const [mediaPlaylist, setMediaPlaylistReal] = useState(null)
  const [abcPlaylist, setAbcPlaylist] = useState(null)
  
  // ensure playlist has media links or set null
  function setMediaPlaylist(playlist) {
      if (playlist && playlist.hasOwnProperty('tunes') && playlist.tunes.length > 0) {
          var foundMedia = false
          playlist.tunes.forEach(function(t) {
            if (Array.isArray(t.links)  && t.links.length > 0) {
                foundMedia = true
            }
          })
          if (foundMedia) {
            setMediaPlaylistReal(playlist)
          } else {
            setMediaPlaylistReal(null)
          }
      } else {
          setMediaPlaylistReal(null)
      }
  }
  
  
 return {tunes, setTunes, setTunesInner, tunesHash, setTunesHashInner, setTunesHash,  currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults, updateTunesHash, buildTunesHash, viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, mediaPlaylist, setMediaPlaylist, scrollOffset, setScrollOffset, abcPlaylist, setAbcPlaylist, filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, showPreviewInList, setShowPreviewInList, tagCollation, setTagCollation, forceNav, setForceNav} 
  
}
