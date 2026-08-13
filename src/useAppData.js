import {useState, useEffect, useCallback, useRef} from 'react'
import useUtils from './useUtils'
import { normalizeViewMode } from './viewModeUtils'
import { configureTuneRepository, setMonolithTunesRef } from './tuneRepository'
import { getTuneHash, getTuneImportHash } from './tuneHashUtils'
import { loadActiveQueue, persistActiveQueue, normalizeQueuePlaybackModes } from './nowPlayingQueue'
import { isAndroidApp } from './platformUtils'
import { readSearchFilterParamsFromHash } from './searchFilterParams'
import { shouldRefuseTunesPersist } from './tunesPersistenceGuard'

const initialSearchFiltersFromHash = readSearchFilterParamsFromHash()

/**
 * Top level state for tunebook application
 */
export default function useAppData() {

  let utils = useUtils();
  
  // refresh hash is used to force components to rerender
  const [refreshHash, setRefreshHash] = useState(utils.generateObjectId())
  function forceRefresh() {
    setRefreshHash(utils.generateObjectId())
  }
  
  // what is the current google document we are saving to
  const [googleDocumentId, setGoogleDocumentId] = useState(null)
  
  // list search filters
  var [filter, setFilter] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.q : ''
  })
  var [groupBy, setGroupBy] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.group : ''
  })
  var [tagFilter, setTagFilter] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.tags : ''
  })
  var [genreFilter, setGenreFilter] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.genres : []
  })
  var [artistFilter, setArtistFilter] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.artists : []
  })
  var [albumFilter, setAlbumFilter] = useState(function() {
    return initialSearchFiltersFromHash ? initialSearchFiltersFromHash.albums : []
  })
  var [starredFilter, setStarredFilter] = useState(false)
  // list display: compact | detailed | preview
  var [listDisplayMode, setListDisplayModeInner] = useState(function() {
    try {
      var saved = localStorage.getItem('bookstorage_list_display_mode')
      if (saved === 'compact' || saved === 'detailed' || saved === 'preview') return saved
    } catch (e) {}
    return 'compact'
  })
  function setListDisplayMode(val) {
    var next = (val === 'detailed' || val === 'preview') ? val : 'compact'
    setListDisplayModeInner(next)
    try {
      localStorage.setItem('bookstorage_list_display_mode', next)
    } catch (e) {}
  }
  // currentTuneBook is used as list filter and in many other places
  const [currentTuneBook, setCurrentTuneBookInner] = useState(function() {
    if (initialSearchFiltersFromHash && initialSearchFiltersFromHash.book) {
      return initialSearchFiltersFromHash.book
    }
    return localStorage.getItem('bookstorage_current_tunebook')
      ? localStorage.getItem('bookstorage_current_tunebook')
      : 0
  });
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
  
  // tune list filter in progress (inline indicator in IndexLayout)
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
  // the hash maps from tune ids to a hash dependant on tune voices, key, .... (see tuneHashUtils)
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
          var hash = getTuneHash(tune) 
          var importhash = getTuneImportHash(tune) 
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
     var hash = getTuneHash(tune)
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
     bumpTunesContentRevision()
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
  const [tunesContentRevision, setTunesContentRevision] = useState(0)
  const pendingTunesSaveRef = useRef(null)
  const tunesSaveTimerRef = useRef(null)
  const latestTunesRef = useRef(tunes)
  latestTunesRef.current = tunes
  // load tunes when the page first loads
  const [tunesHydrated, setTunesHydrated] = useState(false)
  const tunesHydratedRef = useRef(false)

  function bumpTunesContentRevision() {
    setTunesContentRevision(function(rev) { return rev + 1 })
  }

  function clearPendingTunesSave() {
    pendingTunesSaveRef.current = null
    if (tunesSaveTimerRef.current) {
      clearTimeout(tunesSaveTimerRef.current)
      tunesSaveTimerRef.current = null
    }
  }

  function flushTunesPersistence() {
    if (tunesSaveTimerRef.current) {
      clearTimeout(tunesSaveTimerRef.current)
      tunesSaveTimerRef.current = null
    }
    if (!tunesHydratedRef.current) {
      // Never write the empty pre-hydrate book over IndexedDB.
      pendingTunesSaveRef.current = null
      return
    }
    if (!pendingTunesSaveRef.current) return
    if (shouldRefuseTunesPersist(pendingTunesSaveRef.current, latestTunesRef.current)) {
      console.warn(
        'Refusing to persist a much smaller songbook over the in-memory library (possible hydrate/save race).'
      )
      pendingTunesSaveRef.current = null
      return
    }
    utils.saveLocalforageObject('bookstorage_tunes', pendingTunesSaveRef.current)
    pendingTunesSaveRef.current = null
  }

  function setTunes(val) {
    const next = val || {}
    setTunesInner(next)
    // Keep the ref in sync immediately so flush/beforeunload see the same map
    // setTunes just committed (important for intentional deleteAll).
    latestTunesRef.current = next
    setMonolithTunesRef(next)
    configureTuneRepository({ tunes: next })
    bumpTunesContentRevision()
    if (!tunesHydratedRef.current) {
      // Memory-only until hydrate finishes; discard any premature persist.
      clearPendingTunesSave()
      return
    }
    pendingTunesSaveRef.current = next
    if (tunesSaveTimerRef.current) clearTimeout(tunesSaveTimerRef.current)
    tunesSaveTimerRef.current = setTimeout(function() {
      flushTunesPersistence()
    }, 750)
  }

  const [deletedTunes, setDeletedTunesInner] = useState({});
  function setDeletedTunes(val) {
    setDeletedTunesInner(val || {})
    utils.saveLocalforageObject('bookstorage_deleted_tunes', val || {})
  }

  useEffect(function() {
    function hydrateTunes() {
      utils.loadLocalforageObject('bookstorage_tunes').then(function(t) {
        const loaded = t || {}
        // Drop any save scheduled against the empty pre-hydrate book.
        clearPendingTunesSave()
        setTunesInner(loaded)
        latestTunesRef.current = loaded
        setMonolithTunesRef(loaded)
        configureTuneRepository({ tunes: loaded })
        tunesHydratedRef.current = true
        setTunesHydrated(true)
        forceRefresh()
      })
      utils.loadLocalforageObject('bookstorage_deleted_tunes').then(function(t) {
        setDeletedTunesInner(t || {})
      })
    }
    if (isAndroidApp()) {
      setTimeout(hydrateTunes, 400)
    } else {
      hydrateTunes()
    }
    function handleBeforeUnload() {
      flushTunesPersistence()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return function() {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      flushTunesPersistence()
    }
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
    const normalized = queue ? normalizeQueuePlaybackModes(queue) : queue
    persistActiveQueue(normalized)
    setNowPlayingQueueInner(normalized)
  }, [])
  const [setPlaylist, setSetPlaylist] = useState(null)
  const [queuePlayConfirm, setQueuePlayConfirm] = useState(null)
  
  
 return {tunes, setTunes, setTunesInner, tunesContentRevision, tunesHydrated, flushTunesPersistence, deletedTunes, setDeletedTunes, setDeletedTunesInner, tunesHash, setTunesHashInner, setTunesHash,  currentTuneBook, setCurrentTuneBookInner, setCurrentTuneBook, currentTune, setCurrentTune, setCurrentTuneInner, setPageMessage, pageMessage, stopWaiting, startWaiting, waiting, setWaiting, refreshHash, setRefreshHash, forceRefresh, sheetUpdateResults, setSheetUpdateResults, updateTunesHash, buildTunesHash, viewMode, setViewMode, importResults, setImportResults, googleDocumentId, setGoogleDocumentId, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, queuePlayConfirm, setQueuePlayConfirm, scrollOffset, setScrollOffset, filter, setFilter, groupBy, setGroupBy, tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, albumFilter, setAlbumFilter, starredFilter, setStarredFilter, selected, setSelected, lastSelected, setLastSelected,selectedCount, setSelectedCount, filtered, setFiltered,grouped, setGrouped, tuneStatus, setTuneStatus, listHash, setListHash, listDisplayMode, setListDisplayMode, tagCollation, setTagCollation, forceNav, setForceNav, navigateAfterImport, setNavigateAfterImport}
  
}
