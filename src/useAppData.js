import {useState, useEffect, useCallback} from 'react'
import useUtils from './useUtils'
import { normalizeViewMode } from './viewModeUtils'
import useAbcTools from './useAbcTools'
import { loadActiveQueue, persistActiveQueue } from './nowPlayingQueue'

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
  var [genreFilter, setGenreFilter] = useState([])
  var [artistFilter, setArtistFilter] = useState([])
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
  
  //var [zoom, setZoom] = useState(1)
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
  const [navigateAfterImport, setNavigateAfterImport] = useState({})
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load persisted hash once on mount
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
          if (!Array.isArray(importhashes[importhash])) importhashes[importhash] = []
          importhashes[importhash].push(tune.id)
        }
      })
      var builtTunesHash = {ids, hashes, importhashes}
      setTunesHash(builtTunesHash)
      return builtTunesHash
    } else {
      var emptyTunesHash = {ids:{}, hashes:{}, importhashes: {}}
      setTunesHash(emptyTunesHash)
      return emptyTunesHash
    }
    
  }
  
  function updateTunesHash(tune) {
     if (!tune || !tune.id) return
     var hash = abcTools.getTuneHash(tune)
     var prev = tunesHash && typeof tunesHash === 'object' ? tunesHash : { ids: {}, hashes: {}, importhashes: {} }
     var prevIds = prev.ids && typeof prev.ids === 'object' ? prev.ids : {}
     var oldHash = prevIds[tune.id]
     // Metadata-only edits (e.g. lyrics scroll speed) do not change the musical hash.
     if (oldHash === hash) return

     var nextIds = Object.assign({}, prevIds)
     var nextHashes = Object.assign({}, prev.hashes && typeof prev.hashes === 'object' ? prev.hashes : {})
     if (oldHash) {
       if (Array.isArray(nextHashes[oldHash])) {
         nextHashes[oldHash] = nextHashes[oldHash].filter(function(id) {
           return id !== tune.id
         })
         if (nextHashes[oldHash].length === 0) {
           delete nextHashes[oldHash]
         }
       } else {
         delete nextHashes[oldHash]
       }
     }
     delete nextIds[tune.id]
     if (!Array.isArray(nextHashes[hash])) nextHashes[hash] = []
     if (nextHashes[hash].indexOf(tune.id) === -1) nextHashes[hash].push(tune.id)
     nextIds[tune.id] = hash
     setTunesHash({
       ids: nextIds,
       hashes: nextHashes,
       importhashes: prev.importhashes && typeof prev.importhashes === 'object' ? prev.importhashes : {},
     })
  }
  
  // display single view as music notation OR chords and lyrics
  const [viewMode, setViewModeInner] = useState(function() {
    try {
      const stored = localStorage.getItem('bookstorage_view_mode')
      return normalizeViewMode(stored || 'music')
    } catch (e) {
      return 'music'
    }
  })
  function setViewMode(mode) {
    const normalized = normalizeViewMode(mode)
    setViewModeInner(normalized)
    try {
      localStorage.setItem('bookstorage_view_mode', normalized)
    } catch (e) {
      // ignore storage failures
    }
  }
  
  // memory copy of all tunes in the current database
  const [tunes, setTunesInner] = useState({});
  function setTunes(val) {
    setTunesInner(val)
    utils.saveLocalforageObject('bookstorage_tunes', val)
  }

  const [deletedTunes, setDeletedTunesInner] = useState({});
  function setDeletedTunes(val) {
    setDeletedTunesInner(val || {})
    utils.saveLocalforageObject('bookstorage_deleted_tunes', val || {})
  }
  
  // load tunes when the page first loads
  useEffect(function() {
    utils.loadLocalforageObject('bookstorage_tunes').then(function(t) {
            setTunesInner(t)
            forceRefresh()
    })
    utils.loadLocalforageObject('bookstorage_deleted_tunes').then(function(t) {
            setDeletedTunesInner(t || {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load persisted tunes once on mount
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
  
  // unified now-playing queue (persisted in localStorage)
  const [nowPlayingQueue, setNowPlayingQueueInner] = useState(function() {
    return loadActiveQueue()
  })
  const setNowPlayingQueue = useCallback(function(queue) {
    persistActiveQueue(queue)
    setNowPlayingQueueInner(queue)
  }, [])
  const [setPlaylist, setSetPlaylist] = useState(null)
  const [queuePlayConfirm, setQueuePlayConfirm] = useState(null)
  
  
 return {tunes, setTunes, setTunesInner, deletedTunes, setDeletedTunes, setDeletedTunesInner, tunesHash, setTunesHashInner, setTunesHash,  currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults, updateTunesHash, buildTunesHash, viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, queuePlayConfirm, setQueuePlayConfirm, scrollOffset, setScrollOffset, filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, showPreviewInList, setShowPreviewInList, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport} 
  
}
