/* global window */
import { useNavigate } from 'react-router-dom'
import { Button, Badge, ButtonGroup, Alert, ListGroup } from 'react-bootstrap'
import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react'
import IndexSearchForm from './IndexSearchForm'
import SelectedItemsModal from './SelectedItemsModal'
import VirtualizedTuneList, { COMPACT_ROW_HEIGHT, DETAILED_ROW_HEIGHT } from './VirtualizedTuneList'
import TuneListRow from './TuneListRow'
import MediaListRow from './MediaListRow'
import ArtistDiscographyBrowseModal from './ArtistDiscographyBrowseModal'
import { searchMainMediaSources } from '../mainMediaSearchClient'
import { isNavigatorOffline } from '../offlineNetwork'
import {
  isAndroidLocalMediaAvailable,
  requestAndroidAudioPermission,
} from '../androidLocalMediaSearchClient'
import { tuneRowsFromTunes, mergeSearchListRows, getSearchRowKey, isMediaSearchRow, isSearchSectionHeaderRow, countTuneSearchRows } from '../searchListRows'
import SearchListSectionHeader from './SearchListSectionHeader'
import { stageMediaCandidateToTunebook } from '../stageMediaCandidateToTunebook'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
    
import {buildSearchPageTitle, DEFAULT_APP_TITLE, SEARCH_PAGE_TITLE_BASE, setDocumentTitle} from '../pageTitle'
import { compareSearchGroupKeys } from '../searchListOrder'
import { playQueueItem, navigateToQueueTune } from '../nowPlayingQueuePlayback'
import { appendTunesToQueue, createQueue, insertTunesAfterCurrentInQueue, getCurrentTuneId } from '../nowPlayingQueue'
import { getPlayableTuneIdsFromListRows } from '../collectionQueueUtils'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import SelectAllToggle from './SelectAllToggle'
import { toast } from 'react-toastify'
import { getListHighlightTuneId } from '../playbackNavigationUtils'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  expandPdfSnapshotSearchRows,
} from '../pdfSnapshotIndex'
import {
  LIST_PROTECTION_LIMIT,
  PREVIEW_LIST_LIMIT,
  filterSearchNoBooks,
  runTuneListFilterAsync,
  runTuneListFilterSync,
  buildTuneStatusEntry,
  pruneSelectionForStatus,
  buildListHashKey,
  CATALOG_PAGE_SIZE,
  BULK_SELECTION_LIMIT,
} from '../tuneListFilter'
import { isCatalogStorageEnabled } from '../tuneStorageFlags'

function isGroupedListView(grouped) {
  return grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0
}

function IndexLayout(props) {
    const mediaControllerRef = useRef(props.mediaController)
    mediaControllerRef.current = props.mediaController
    const { available: resolverAvailable } = useMediaResolverHealth()

    //var [filtered, setFiltered] = useState('')
    //var [grouped, setGrouped] = useState({})
    //var [tuneStatus, setTuneStatus] = useState({})
    //var [selected, setSelected] = useState({})
    //var [lastSelected, setLastSelected] = useState({})
    //var [selectedCount, setSelectedCount] = useState({})
    
    var listHash = props.listHash
    var setListHash = props.setListHash
    var filtered = props.filtered
    var grouped = props.grouped
    var tuneStatus = props.tuneStatus
    var lastSelected = props.lastSelected
    var selectedCount = props.selectedCount
    var selected = props.selected
    var setFiltered = props.setFiltered
    var setGrouped = props.setGrouped
    var setTuneStatus = props.setTuneStatus
    var setSelected = props.setSelected
    var setLastSelected = props.setLastSelected
    var setSelectedCount = props.setSelectedCount
    var tagCollation = props.tagCollation
    var setTagCollation = props.setTagCollation
    var [onlyShowDuplicates, setOnlyShowDuplicates] = useState(false)
    var [listPageMeta, setListPageMeta] = useState(null)
    var [mediaSearchResults, setMediaSearchResults] = useState([])
    var [mediaSearchBusy, setMediaSearchBusy] = useState(false)
    var [deviceAudioNeedsPermission, setDeviceAudioNeedsPermission] = useState(false)
    var [deviceAudioPermissionBusy, setDeviceAudioPermissionBusy] = useState(false)
    var [deviceAudioPermissionRevision, setDeviceAudioPermissionRevision] = useState(0)
    var [discographySeedCandidate, setDiscographySeedCandidate] = useState(null)
    var [showDiscographyModal, setShowDiscographyModal] = useState(false)
    var filterRunIdRef = useRef(0)
    var mediaSearchRunIdRef = useRef(0)
    var mediaSearchTimerRef = useRef(null)
    var mediaSearchAbortRef = useRef(null)
    var listSelectionCurtailedToastKeyRef = useRef(null)
    const navigate = useNavigate()
    
    const scrollOffset = props.scrollOffset
    useEffect(function() {
        window.addEventListener("scroll", props.setScrollOffset);
        return () => {
            window.removeEventListener("scroll", props.setScrollOffset);
        };
    },[props.setScrollOffset])

    useEffect(function() {
        const base = props.searchTitleBase || SEARCH_PAGE_TITLE_BASE
        setDocumentTitle(buildSearchPageTitle(props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, base, props.albumFilter))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.albumFilter, props.searchTitleBase])

    // reset selection when grouping, book, tag or genre filters change (but not text filter)
    useEffect(function() {
        setSelected({})
        setSelectedCount(0)
    },[props.groupBy,props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.albumFilter, props.starredFilter, props.filter, setSelected, setSelectedCount])

    useEffect(function() {
      const query = String(props.filter || '').trim()
      if (mediaSearchTimerRef.current) clearTimeout(mediaSearchTimerRef.current)
      if (mediaSearchAbortRef.current) {
        mediaSearchAbortRef.current.abort()
        mediaSearchAbortRef.current = null
      }
      if (query.length < 3) {
        setMediaSearchResults([])
        setMediaSearchBusy(false)
        setDeviceAudioNeedsPermission(false)
        return undefined
      }
      if (isNavigatorOffline()) {
        setMediaSearchResults([])
        setMediaSearchBusy(false)
        setDeviceAudioNeedsPermission(false)
        return undefined
      }
      setMediaSearchBusy(true)
      mediaSearchTimerRef.current = setTimeout(function() {
        const runId = mediaSearchRunIdRef.current + 1
        mediaSearchRunIdRef.current = runId
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        mediaSearchAbortRef.current = controller
        const accessToken = resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''
        searchMainMediaSources({
          query: query,
          accessToken: accessToken,
          token: accessToken,
          signal: controller ? controller.signal : undefined,
        }).then(function(result) {
          if (mediaSearchRunIdRef.current !== runId) return
          const list = result && Array.isArray(result.candidates) ? result.candidates : []
          setMediaSearchResults(list)
          setDeviceAudioNeedsPermission(!!(result && result.deviceNeedsPermission))
        }).catch(function(err) {
          if (mediaSearchRunIdRef.current !== runId) return
          if (err && err.name === 'AbortError') return
          setMediaSearchResults([])
        }).finally(function() {
          if (mediaSearchRunIdRef.current === runId) {
            setMediaSearchBusy(false)
          }
        })
      }, 400)
      return function() {
        if (mediaSearchTimerRef.current) clearTimeout(mediaSearchTimerRef.current)
        if (mediaSearchAbortRef.current) {
          mediaSearchAbortRef.current.abort()
          mediaSearchAbortRef.current = null
        }
      }
    }, [props.filter, props.token, deviceAudioPermissionRevision])

    function handleBrowseArtistFromMediaRow(candidate) {
      if (!candidate) return
      setDiscographySeedCandidate(candidate)
      setShowDiscographyModal(true)
    }

    function handleCloseDiscographyModal() {
      setShowDiscographyModal(false)
      setDiscographySeedCandidate(null)
    }

    async function handleGrantDeviceAudioAccess() {
      if (!isAndroidLocalMediaAvailable() || deviceAudioPermissionBusy) return
      setDeviceAudioPermissionBusy(true)
      try {
        const result = await requestAndroidAudioPermission()
        if (result && result.granted) {
          setDeviceAudioNeedsPermission(false)
          setDeviceAudioPermissionRevision(function(v) { return v + 1 })
        } else {
          toast.warn('Audio library access was not granted. Device tracks will not appear in search.')
        }
      } finally {
        setDeviceAudioPermissionBusy(false)
      }
    }
    
    function filterSearch(tune) {
       return props.tunebook.filterSearch(tune, props.filter, props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter, props.albumFilter)
    }

    function applyFilterResult(result) {
      if (!result) return
      setFiltered(result.filtered)
      setGrouped(result.grouped)
      setTuneStatus(result.tuneStatus)
      setTagCollation(result.tagCollation)
      setListPageMeta(result.listPage || null)
      setSelected(function(prev) {
        const pruned = pruneSelectionForStatus(prev, result.filtered)
        setSelectedCount(pruned.selectedCount)
        return pruned.selected
      })
    }

    function getListScrollTotal() {
      return Array.isArray(filtered) ? filtered.length : 0
    }

    function usesPaginatedList() {
      if (!isCatalogStorageEnabled()) return false
      return getListScrollTotal() > CATALOG_PAGE_SIZE
    }

    function runFilter() {
      const runId = filterRunIdRef.current + 1
      filterRunIdRef.current = runId
      setGrouped(null)
      setFiltered([])
      props.startWaiting()

      runTuneListFilterAsync({
        tunes: props.tunes,
        filterSearchFn: filterSearch,
        groupBy: props.groupBy,
        tunebook: props.tunebook,
        shouldCancel: function() { return filterRunIdRef.current !== runId },
        indexes: props.indexes && props.indexes.getIndexBundle ? props.indexes.getIndexBundle() : null,
        filterContext: {
          currentTuneBook: props.currentTuneBook,
          tagFilter: props.tagFilter,
          genreFilter: props.genreFilter,
          artistFilter: props.artistFilter,
          albumFilter: props.albumFilter,
          starredFilter: props.starredFilter,
          filter: props.filter,
          textFilter: props.filter,
        },
      }).then(function(result) {
        if (filterRunIdRef.current !== runId) return
        if (result) applyFilterResult(result)
        props.stopWaiting()
      }).catch(function() {
        if (filterRunIdRef.current === runId) props.stopWaiting()
      })
    }

    function runDefaultFilter() {
      const result = runTuneListFilterSync({
        tunes: props.tunes,
        filterSearchFn: filterSearchNoBooks,
        groupBy: props.groupBy,
        tunebook: props.tunebook,
        indexes: props.indexes && props.indexes.getIndexBundle ? props.indexes.getIndexBundle() : null,
        filterContext: {
          currentTuneBook: props.currentTuneBook,
          tagFilter: props.tagFilter,
          genreFilter: props.genreFilter,
          artistFilter: props.artistFilter,
          albumFilter: props.albumFilter,
          starredFilter: props.starredFilter,
          filter: props.filter,
          textFilter: props.filter,
        },
      })
      setGrouped(result.grouped)
      setFiltered(result.filtered)
      setTuneStatus(result.tuneStatus)
      setTagCollation(result.tagCollation)
      const total = Array.isArray(result.filtered) ? result.filtered.length : 0
      if (total > CATALOG_PAGE_SIZE) {
        setListPageMeta({
          total: total,
          offset: 0,
          limit: CATALOG_PAGE_SIZE,
          ids: result.filtered.map(function(t) { return t.id }),
        })
      } else {
        setListPageMeta(null)
      }
      props.stopWaiting()
    }

    function ensureTuneStatusForVisibleList(tuneList) {
      const list = Array.isArray(tuneList) ? tuneList : []
      if (list.length === 0 || list.length >= LIST_PROTECTION_LIMIT) return
      setTuneStatus(function(prev) {
        const nextStatus = Object.assign({}, prev)
        let changed = false
        list.forEach(function(tune) {
          if (!tune || !tune.id || nextStatus[tune.id]) return
          const entry = buildTuneStatusEntry(tune, props.tunebook)
          if (entry) {
            nextStatus[tune.id] = entry
            changed = true
          }
        })
        return changed ? nextStatus : prev
      })
    }

    const stopWaiting = props.stopWaiting
    useEffect(function() {
        setTimeout(function() {
            window.scroll(0, scrollOffset)
            stopWaiting()
        },300)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore scroll position once on mount
    },[])

    useEffect(function() {
      return function() {
        props.stopWaiting()
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear list-waiting indicator on unmount
    }, [])
    
    const lastScrollTopRef = useRef(0);
	const [fixedSingleMenu, setFixedSingleMenu] = useState(false)
	useEffect(() => {
		const handleScroll = (e) => {
				const currentScrollTop = window.scrollY;
				if (currentScrollTop > lastScrollTopRef.current) {
				  // Scrolling down
				  setFixedSingleMenu(false)
				} else {
				  // Scrolling up
				  if (currentScrollTop > 100) {
					  setFixedSingleMenu(true)
					  //setTimeout(function() { setFixedSingleMenu(false) }, 5000)
				  } else {
					  setFixedSingleMenu(false)
				  }
				}
				
				lastScrollTopRef.current = currentScrollTop;
		};

		window.addEventListener("scroll", handleScroll);

		return () => {
			window.removeEventListener("scroll", handleScroll);
		};
	}, []);
    
    useEffect(function() {
        if (!props.tunesHydrated) return
        // Do not wait for indexesReady: empty/loading indexes must not leave the
        // list blank. resolveCandidateTuneIds falls back to a full tune scan.
        var tuneCount = props.tunes ? Object.keys(props.tunes).length : 0
        var indexBookCount = props.indexes && props.indexes.bookIndex
          ? Object.keys(props.indexes.bookIndex).length
          : 0
        var newHash = buildListHashKey([
          props.groupBy,
          props.filter,
          props.currentTuneBook,
          props.tagFilter,
          props.genreFilter,
          props.artistFilter,
          props.albumFilter,
          props.starredFilter,
          tuneCount,
          props.tunesContentRevision || 0,
          props.indexes && props.indexes.indexesReady ? 1 : 0,
          indexBookCount,
        ])
      if (listHash !== newHash) {
            if (props.filter && props.filter.trim().length > 2 || props.currentTuneBook|| props.starredFilter || (Array.isArray(props.tagFilter) && props.tagFilter.length > 0) || (Array.isArray(props.genreFilter) && props.genreFilter.length > 0) || (Array.isArray(props.artistFilter) && props.artistFilter.length > 0) || (Array.isArray(props.albumFilter) && props.albumFilter.length > 0)) {
                runFilter()
                setTimeout(function() {
                    window.scroll(0,props.scrollOffset)
                },300)
            } else if (props.filter.length <= 2 && props.filter.length > 0) {
              setFiltered([])
              props.stopWaiting()
            } else  {
                runDefaultFilter()
            }
            setListHash(newHash)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listHash comparison prevents redundant filter runs
    },[props.groupBy, props.filter, props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.albumFilter, props.starredFilter, listHash, props.tunes ? Object.keys(props.tunes).length : 0, props.tunesContentRevision, props.tunesHydrated, props.indexes && props.indexes.indexesReady, props.indexes && props.indexes.bookIndex ? Object.keys(props.indexes.bookIndex).length : 0])

    useEffect(function() {
      const displayMode = props.listDisplayMode || 'compact'
      if (displayMode !== 'detailed' && displayMode !== 'preview') {
        listSelectionCurtailedToastKeyRef.current = null
        return undefined
      }
      if (!Array.isArray(filtered) || filtered.length === 0 || filtered.length >= LIST_PROTECTION_LIMIT) {
        return undefined
      }
      ensureTuneStatusForVisibleList(filtered)
    }, [props.listDisplayMode, filtered, props.tunebook])

    function listRowsForTunes(tunes) {
      const list = Array.isArray(tunes) ? tunes : []
      const tuneRows = tuneRowsFromTunes(list, props.filter)
      const query = String(props.filter || '').trim()
      const includeMedia = query.length >= 3
      return mergeSearchListRows(tuneRows, includeMedia ? mediaSearchResults : [], {
        includeMedia: includeMedia,
      })
    }

    const handleBookClick = useCallback(function(book) {
        props.setCurrentTuneBook(book)
        props.setFilter('')
        props.forceRefresh()
    }, [props.setCurrentTuneBook, props.setFilter, props.forceRefresh])

    const handleTagClick = useCallback(function(tag) {
        props.setTagFilter([tag])
        props.setFilter('')
        props.forceRefresh()
    }, [props.setTagFilter, props.setFilter, props.forceRefresh])

    const handleAddMediaToTunebook = useCallback(function(candidate) {
      stageMediaCandidateToTunebook(candidate, {
        book: props.currentTuneBook || '',
        tags: Array.isArray(props.tagFilter) ? props.tagFilter : [],
      }).catch(function(err) {
        toast.error(err && err.message ? err.message : 'Could not open Add to Tunebook')
      })
    }, [props.currentTuneBook, props.tagFilter])

    const handleMediaPlaybackError = useCallback(function(err) {
      toast.error(err && err.message ? err.message : 'Could not play media')
    }, [])

    function isListSelectionCurtailed(tunes) {
      const tuneRowCount = countTuneSearchRows(listRowsForTunes(tunes))
      return tuneRowCount > 0 && tuneRowCount >= LIST_PROTECTION_LIMIT
    }

    function selectionCurtailedInCurrentView() {
      const displayMode = props.listDisplayMode || 'compact'
      if (displayMode !== 'detailed' && displayMode !== 'preview') return false
      if (usesPaginatedList()) return false
      if (!Array.isArray(filtered) || filtered.length === 0) return false
      if (!grouped || Object.keys(grouped).length === 0) {
        return isListSelectionCurtailed(filtered)
      }
      return Object.keys(grouped).some(function(groupKey) {
        const indices = grouped[groupKey]
        if (!Array.isArray(indices)) return false
        const groupTunes = indices.map(function(itemKey) { return filtered[itemKey] }).filter(Boolean)
        return isListSelectionCurtailed(groupTunes)
      })
    }

    useEffect(function() {
      const displayMode = props.listDisplayMode || 'compact'
      if (displayMode !== 'detailed' && displayMode !== 'preview') {
        listSelectionCurtailedToastKeyRef.current = null
        return
      }
      if (!selectionCurtailedInCurrentView()) {
        listSelectionCurtailedToastKeyRef.current = null
        return
      }
      const toastKey = displayMode + ':' + (listHash || '') + ':' + (Array.isArray(filtered) ? filtered.length : 0)
      if (listSelectionCurtailedToastKeyRef.current === toastKey) return
      listSelectionCurtailedToastKeyRef.current = toastKey
      toast.warn(
        'Refine your search to ' + LIST_PROTECTION_LIMIT + ' or fewer results to enable selection checkboxes and row metadata in Detailed mode'
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast once per curtailed list view
    }, [props.listDisplayMode, filtered, grouped, listHash, props.filter])
    
    
    function selectAllToggle(groupKey=null) {
        if (groupKey === null) {
            setSelected(function(prev) {
                var nextSelected = Object.assign({}, prev)
                var prevCount = countSelectedFrom(prev)
                if (prevCount > 0) {
                    filtered.forEach(function(tune) {
                        nextSelected[tune.id] = false
                    })
                } else {
                    var selectedCount = 0
                    var matchingCount = 0
                    filtered.forEach(function(tune) {
                        matchingCount += 1
                        if (selectedCount >= BULK_SELECTION_LIMIT) return
                        nextSelected[tune.id] = true
                        selectedCount += 1
                    })
                    if (matchingCount > BULK_SELECTION_LIMIT) {
                        toast.warn('Selection limited to ' + BULK_SELECTION_LIMIT + ' tunes at once.')
                    }
                }
                var trimmed = enforceSelectionLimit(nextSelected)
                setSelectedCount(countSelectedFrom(trimmed))
                return trimmed
            })
            props.forceRefresh()
        } else {
             if (grouped && Array.isArray(grouped[groupKey])) {
                setSelected(function(prev) {
                    var nextSelected = Object.assign({}, prev)
                    if (grouped[groupKey].length === countSelectedFrom(prev, groupKey)) {
                        grouped[groupKey].forEach(function(id) {
                            if (filtered[id] && filtered[id].id) nextSelected[filtered[id].id] = false
                        })
                    } else {
                        grouped[groupKey].forEach(function(id) {
                            if (filtered[id] && filtered[id].id) nextSelected[filtered[id].id] = true
                        })
                    }
                    var trimmed = enforceSelectionLimit(nextSelected)
                    setSelectedCount(countSelectedFrom(trimmed))
                    return trimmed
                })
                props.forceRefresh()
             }
        }
    }
    
    function selectBetween(startId,endId) {
        if (startId && endId) {
            setSelected(function(prev) {
                var nextSelected = Object.assign({}, prev)
                var started = false
                filtered.forEach(function(tune) {
                    if (tune.id === startId || tune.id === endId) {
                        started = !started
                        nextSelected[tune.id] = true
                    }
                    if (started) {
                        nextSelected[tune.id] = true
                    }
                })
                var trimmed = enforceSelectionLimit(nextSelected)
                setSelectedCount(countSelectedFrom(trimmed))
                return trimmed
            })
            props.forceRefresh()
        }
    }
    
    function enforceSelectionLimit(nextSelected) {
      const ids = Object.keys(nextSelected).filter(function(id) { return nextSelected[id] })
      if (ids.length <= BULK_SELECTION_LIMIT) return nextSelected
      const trimmed = Object.assign({}, nextSelected)
      ids.slice(BULK_SELECTION_LIMIT).forEach(function(id) { trimmed[id] = false })
      toast.warn('Selection limited to ' + BULK_SELECTION_LIMIT + ' tunes at once.')
      return trimmed
    }

    function handleSelection(e,tuneId) {
        // TODO grouped
        
        if (!grouped && e.shiftKey && lastSelected) {
            e.preventDefault(); 
            e.stopPropagation();
            selectBetween(lastSelected, tuneId)
        } else {
            e.preventDefault(); 
            e.stopPropagation();
            setSelected(function(prev) {
                var nextSelected = Object.assign({}, prev)
                if (nextSelected[tuneId] === true) {
                    nextSelected[tuneId] = false
                    setLastSelected(null)
                } else {
                    nextSelected[tuneId] = true
                    setLastSelected(tuneId)
                }
                var trimmed = enforceSelectionLimit(nextSelected)
                setSelectedCount(countSelectedFrom(trimmed))
                return trimmed
            })
        }
        
    }
    
    function countSelectedFrom(sel, groupKey = null) {
        if (grouped && Array.isArray(grouped[groupKey])) {
            var count = 0
            grouped[groupKey].forEach(function(id) {
                if (filtered[id] && filtered[id].id && sel[filtered[id].id]) count++
            })
            return count
        }
        var count = 0
        Object.keys(sel).forEach(function(key) {
            if (sel[key]) count++
        })
        return count
    }

    function countSelected(groupKey = null) {
        return countSelectedFrom(selected, groupKey)
    }
    
    
    //function gatherSelected() {
        //var count = 0
        //var final = {}
        //return selected.split(",").forEach(function(key) {
            //if (key && props.tunes[key] && props.tunes[key]._id) final[props.tunes[key]._id] = props.tunes[key] 
        //})
        //return final
    //}
    

    function forceRefresh() {
        setListHash("abc"+Math.random())
        setFiltered(null)
        //var filtered = Object.values(props.tunes).filter(filterSearch)
        //setFiltered(filtered)
        runFilter()
        //props.forceRefresh()
    }

    function renderListItems(items, prebuiltRows) {
        var displayMode = props.listDisplayMode || 'compact'
        var previewAllowed = !(props.filtered && props.filtered.length > PREVIEW_LIST_LIMIT)
        var isCompact = displayMode === 'compact'
        var isPreview = displayMode === 'preview' && previewAllowed
        var isDetailed = displayMode === 'detailed' || (displayMode === 'preview' && !previewAllowed)
        var rows = prebuiltRows || listRowsForTunes(items)
        var tuneRowCount = countTuneSearchRows(rows)
        var showRowExtras = (isDetailed || isPreview) && tuneRowCount > 0
          && (usesPaginatedList() || tuneRowCount < LIST_PROTECTION_LIMIT)
        var showStarToggle = isDetailed
        var showFilterChips = isDetailed || isPreview
        var rowProps = {
          isCompact: isCompact,
          isPreview: isPreview,
          showRowExtras: showRowExtras,
          showStarToggle: showStarToggle,
          showFilterChips: showFilterChips,
          selected: selected,
          tuneStatus: tuneStatus,
          tunebook: props.tunebook,
          setCurrentTune: props.setCurrentTune,
          currentTuneBook: props.currentTuneBook,
          tagFilter: props.tagFilter,
          onBookClick: handleBookClick,
          onTagClick: handleTagClick,
          onSelect: handleSelection,
          forceRefresh: props.forceRefresh,
          mediaControllerRef: mediaControllerRef,
          tunes: props.tunes,
          nowPlayingQueue: props.nowPlayingQueue,
          setNowPlayingQueue: props.setNowPlayingQueue,
          setQueuePlayConfirm: props.setQueuePlayConfirm,
          nowPlayingTuneId: listHighlightTuneId,
          onAddToTunebook: handleAddMediaToTunebook,
          onMediaError: handleMediaPlaybackError,
          onBrowseArtist: handleBrowseArtistFromMediaRow,
          accessToken: resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || '',
          resolverAvailable: resolverAvailable,
          searchIndex: props.searchIndex,
          loadTuneTexts: props.loadTuneTexts,
        }

        if (rows.length === 0) {
          return <div style={{clear:'both', width:'100%', marginTop: '1em'}} />
        }

        if (isPreview || isDetailed) {
          if (!usesPaginatedList()) {
            const rowNodes = rows.map(function(row, tk) {
              if (isSearchSectionHeaderRow(row)) {
                return (
                  <SearchListSectionHeader
                    key={getSearchRowKey(row, tk)}
                    label={row.label}
                  />
                )
              }
              if (isMediaSearchRow(row)) {
                return (
                  <MediaListRow
                    key={getSearchRowKey(row, tk)}
                    row={row}
                    rowKey={getSearchRowKey(row, tk)}
                    index={tk}
                    {...rowProps}
                  />
                )
              }
              return (
                <TuneListRow key={getSearchRowKey(row, tk)} row={row} index={tk} {...rowProps} />
              )
            })
            return (
              <ListGroup id="tune-index" style={{clear:'both', width: '100%'}}>
                {rowNodes}
              </ListGroup>
            )
          }
        }

        const rowHeight = (isPreview || isDetailed) ? DETAILED_ROW_HEIGHT : COMPACT_ROW_HEIGHT
        return (
          <VirtualizedTuneList
            rows={rows}
            listId="tune-index"
            rowHeight={rowHeight}
            maxHeight={Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220)}
            overscanCount={(isPreview || isDetailed) ? 12 : 8}
            isCompact={isCompact}
            isPreview={isPreview}
            showRowExtras={showRowExtras}
            showStarToggle={showStarToggle}
            showFilterChips={showFilterChips}
            selected={selected}
            tuneStatus={tuneStatus}
            tunebook={props.tunebook}
            setCurrentTune={props.setCurrentTune}
            currentTuneBook={props.currentTuneBook}
            tagFilter={props.tagFilter}
            onBookClick={rowProps.onBookClick}
            onTagClick={rowProps.onTagClick}
            onSelect={handleSelection}
            forceRefresh={props.forceRefresh}
            mediaControllerRef={mediaControllerRef}
            tunes={props.tunes}
            nowPlayingQueue={props.nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            setQueuePlayConfirm={props.setQueuePlayConfirm}
            nowPlayingTuneId={listHighlightTuneId}
            onAddToTunebook={handleAddMediaToTunebook}
            onMediaError={handleMediaPlaybackError}
            onBrowseArtist={handleBrowseArtistFromMediaRow}
            accessToken={resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''}
            resolverAvailable={resolverAvailable}
            searchIndex={props.searchIndex}
            loadTuneTexts={props.loadTuneTexts}
          />
        )
    }
    
    const queueHighlightTuneId = props.nowPlayingQueue ? getCurrentTuneId(props.nowPlayingQueue) : null
    const controllerHighlightTuneId = props.mediaController && props.mediaController.tune
      ? props.mediaController.tune.id
      : null
    const listHighlightTuneId = useMemo(function() {
      return getListHighlightTuneId(props.mediaController, props.nowPlayingQueue)
    }, [
      queueHighlightTuneId,
      controllerHighlightTuneId,
      props.mediaController && props.mediaController.isPlaying,
      props.mediaController && props.mediaController.isLoading,
      props.nowPlayingQueue && props.nowPlayingQueue.previewOnce && props.nowPlayingQueue.previewOnce.tuneId,
    ])

    var listPageTotal = getListScrollTotal()
    var listDisplayMode = props.listDisplayMode || 'compact'
    var tuneSearchPanelClass = fixedSingleMenu
        ? 'tune-search-panel tune-search-panel-fixed'
        : 'tune-search-panel'
    var freshSelectedCount = countSelected()
    var showListSelectionControls = listDisplayMode !== 'compact'

    const visibleListRows = useMemo(function() {
      return listRowsForTunes(filtered)
    }, [filtered, props.filter, mediaSearchResults])

    function getListTuneIds() {
        var selectedIds = Object.keys(selected).filter(function(id) {
            return selected[id]
        })
        return getPlayableTuneIdsFromListRows(filtered, props.tunes, props.tunebook, selectedIds, {
            grouped: grouped,
            groupBy: props.groupBy,
        })
    }

    function handlePlayFromList() {
        var tuneIds = getListTuneIds()
        if (!tuneIds.length) {
            toast.warn('No playable tunes found in the current list.')
            return
        }
        var playingSelection = freshSelectedCount > 0
        var queue = createQueue({
            tuneIds: tuneIds,
            name: playingSelection ? 'Selection' : 'Filter',
            source: playingSelection ? 'selection' : 'filter',
            followTune: false,
            repeatMode: 'off',
        })
        var mediaController = props.mediaController
        if (mediaController && mediaController.preparePlaybackFromUserGesture) {
            mediaController.preparePlaybackFromUserGesture()
        }
        if (props.tunebook.startNowPlayingQueue && mediaController) {
            props.tunebook.startNowPlayingQueue(queue, navigate, {
                startPlayback: true,
                mediaController: mediaController,
                navigate: true,
            })
            return
        }
        if (props.tunebook.startNowPlayingQueue) {
            props.tunebook.startNowPlayingQueue(queue, null, {
                startPlayback: false,
                navigate: false,
            })
        } else if (props.setNowPlayingQueue) {
            props.setNowPlayingQueue(queue)
        }

        var tuneId = tuneIds[0]
        var tune = props.tunes && props.tunes[tuneId]
        if (!mediaController || !tune) {
            navigate('/tunes/' + tuneId)
            return
        }

        var item = { tuneId: tuneId, prefer: 'auto' }
        playQueueItem(mediaController, props.tunebook, tune, item, { deferPlaybackEngine: true })
        navigateToQueueTune(navigate, tuneId, item, props.tunebook, props.tunes)
    }

    function handleAddAllToQueue(event) {
        event.preventDefault()
        event.stopPropagation()
        var tuneIds = getListTuneIds()
        if (!tuneIds.length) {
            toast.warn('No playable tunes found in the current list.')
            return
        }
        if (props.setNowPlayingQueue) {
            props.setNowPlayingQueue(appendTunesToQueue(props.nowPlayingQueue, tuneIds))
        }
    }

    function handlePlayAllNext(event) {
        event.preventDefault()
        event.stopPropagation()
        var tuneIds = getListTuneIds()
        if (!tuneIds.length) {
            toast.warn('No playable tunes found in the current list.')
            return
        }
        if (props.setNowPlayingQueue) {
            props.setNowPlayingQueue(insertTunesAfterCurrentInQueue(props.nowPlayingQueue, tuneIds))
        }
    }
     
    return <div className="index-layout"  >
      <div id="tune-search-panel" className={tuneSearchPanelClass} >
         <IndexSearchForm tunes={props.tunes} selected={Object.keys(selected).map(function(v) {
                if (selected[v]) {
                     return v
                } else {
                    return ''
                }
            }).join(",") 
            } nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} googleDocumentId={props.googleDocumentId} token={props.token}  tunesHash={props.tunesHash} filter={props.filter} setFilter={props.setFilter} forceRefresh={function() { setListHash(''); props.forceRefresh()}} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} groupBy={props.groupBy} setGroupBy={props.setGroupBy} filtered={filtered} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter} genreFilter={props.genreFilter} setGenreFilter={props.setGenreFilter} artistFilter={props.artistFilter} setArtistFilter={props.setArtistFilter} albumFilter={props.albumFilter} setAlbumFilter={props.setAlbumFilter} starredFilter={props.starredFilter} setStarredFilter={props.setStarredFilter}   setSelected={props.setSelected} lastSelected={props.lastSelected} setLastSelected={props.setLastSelected} selectedCount={props.selectedCount} setSelectedCount={props.setSelectedCount} setFiltered={props.setFiltered} grouped={props.grouped} setGrouped={props.setGrouped}  tuneStatus={props.tuneStatus} setTuneStatus={props.setTuneStatus}  listHash={props.listHash} setListHash={props.setListHash}  searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}  listDisplayMode={props.listDisplayMode} setListDisplayMode={props.setListDisplayMode} LIST_PROTECTION_LIMIT={LIST_PROTECTION_LIMIT} PREVIEW_LIST_LIMIT={PREVIEW_LIST_LIMIT} tagCollation={tagCollation} />
        
        {isAndroidLocalMediaAvailable()
          && deviceAudioNeedsPermission
          && String(props.filter || '').trim().length >= 3 ? (
          <Alert variant="info" className="mx-2 mt-2 mb-0">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span>
                Grant audio library access to include music on your device in search results.
              </span>
              <Button
                variant="outline-primary"
                size="sm"
                disabled={deviceAudioPermissionBusy}
                onClick={handleGrantDeviceAudioAccess}
              >
                {deviceAudioPermissionBusy ? 'Requesting…' : 'Allow audio access'}
              </Button>
            </div>
          </Alert>
        ) : null}

			{props.tunes && <div className={'tune-list-toolbar-row' + (showListSelectionControls ? '' : ' tune-list-toolbar-row--compact')}>
			
				{(showListSelectionControls && filtered && filtered.length > 0) && (
          <SelectAllToggle
            size="lg"
            totalCount={filtered.length}
            selectedCount={freshSelectedCount}
            onSelectAll={function() { selectAllToggle() }}
            onSelectNone={function() { selectAllToggle() }}
            ariaLabel="Select all tunes"
          />
        )}

        {filtered && filtered.length > 0 && (
          <ButtonGroup className="tune-list-toolbar-btn-group">
            {showListSelectionControls ? (
              freshSelectedCount > 0 ? (
                <SelectedItemsModal
                  mediaController={props.mediaController}
                  tunebook={props.tunebook}
                  token={props.token}
                  login={props.login}
                  tunesHash={props.tunesHash}
                  defaultOptions={props.tunebook.getTuneBookOptions}
                  searchOptions={props.tunebook.getSearchTuneBookOptions}
                  defaultTagOptions={props.tunebook.getTuneTagOptions}
                  searchTagOptions={props.tunebook.getSearchTuneTagOptions}
                  forceRefresh={function() { forceRefresh() }}
                  selected={selected}
                  setSelected={setSelected}
                  nowPlayingQueue={props.nowPlayingQueue}
                  setNowPlayingQueue={props.setNowPlayingQueue}
                  selectedCount={freshSelectedCount}
                  setSelectedCount={setSelectedCount}
                />
              ) : (
                <Button
                  variant="secondary"
                  disabled
                  className="tune-list-bulk-ops-btn tune-list-bulk-ops-btn--placeholder"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {props.tunebook.icons.dropdown}
                </Button>
              )
            ) : null}
            {showListSelectionControls && freshSelectedCount > 0 && (
              <Button variant="outline-secondary" disabled className="tune-list-selection-count">
                {freshSelectedCount}/{filtered.length} tunes selected
              </Button>
            )}
            {freshSelectedCount === 0 && (
              <Button variant="outline-secondary" disabled className="tune-list-selection-count">
                {listPageTotal} matching tunes
              </Button>
            )}
            <PlayWithQueueDropdown
              variant="toolbar"
              playVariant="success"
              playIcon={props.tunebook.icons.playwhite}
              playLabel={(
                <span className="tune-list-play-label">
                  <span className="tune-list-play-verb">Play </span>
                  {freshSelectedCount > 0 ? 'Selected' : 'All'}
                </span>
              )}
              testId="play-from-list-button"
              className="tune-list-play-btn-group"
              onPlay={handlePlayFromList}
              onAddToQueue={props.setNowPlayingQueue ? handleAddAllToQueue : null}
              onPlayNext={props.setNowPlayingQueue ? handlePlayAllNext : null}
              addToQueueLabel="Add all to queue"
              playNextLabel="Play all next"
            />
          </ButtonGroup>
        )}
			
			</div>}
        </div>
        <hr style={{width: '100%'}} />
        {props.waiting && (
          <div className="index-layout-waiting" style={{ padding: '0.5em', color: '#555' }}>
            Updating tune list...
          </div>
        )}
        {!isGroupedListView(grouped) && renderListItems(filtered, visibleListRows)}
        
        {isGroupedListView(grouped) && <div>{ Object.keys(grouped).sort(function(a,b) {
            return compareSearchGroupKeys(props.groupBy, a, b)
        }).map(function(groupKey,groupNum) {
            return (groupKey && grouped[groupKey].length > 0 && (props.filter.length == 0 ||props.filter.length > 2)) ? <Button style={{marginRight:'0.1em'}} variant='outline-success' onClick={function() {props.tunebook.utils.scrollTo('group-'+groupKey)}} >{groupKey}</Button> : null
        })}</div>}
        
        {isGroupedListView(grouped) && <div>{ Object.keys(grouped).sort(function(a,b) {
            return compareSearchGroupKeys(props.groupBy, a, b)
        }).map(function(groupKey,groupNum) {
            var filteredGroup = []
            if (Array.isArray(grouped[groupKey])) grouped[groupKey].forEach(function(itemKey) {
                filteredGroup.push(filtered[itemKey])
            })
            return (filteredGroup.length > 0  && (props.filter.length == 0 ||props.filter.length > 2)) ? <>
            <span id={"group-"+groupKey} aria-hidden="true"></span>
           
            <br/>
            {showListSelectionControls ? (
            <div className="tune-list-group-select-wrap">
              <SelectAllToggle
                size="lg"
                totalCount={filteredGroup.length}
                selectedCount={countSelected(groupKey)}
                onSelectAll={function() { selectAllToggle(groupKey) }}
                onSelectNone={function() { selectAllToggle(groupKey) }}
                ariaLabel={'Select all tunes in ' + groupKey}
              />
            </div>
            ) : null}
            <Badge style={{float:'right'}} >{filteredGroup.length}</Badge>
            <h3> {groupKey && <Button style={{float:'left'}} variant="outline-secondary" onClick={function() {props.tunebook.utils.scrollTo('topofpage')}} >{props.tunebook.icons.arrowup}</Button>}&nbsp;&nbsp;&nbsp;{groupKey} </h3>
            {renderListItems(filteredGroup)}
            </> : ''
            
        })}</div>}
       
        
    <ArtistDiscographyBrowseModal
      show={showDiscographyModal}
      onHide={handleCloseDiscographyModal}
      seedCandidate={discographySeedCandidate}
      tunebook={props.tunebook}
      mediaController={props.mediaController}
      tunes={props.tunes}
      setCurrentTune={props.setCurrentTune}
      nowPlayingQueue={props.nowPlayingQueue}
      setNowPlayingQueue={props.setNowPlayingQueue}
      accessToken={resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''}
      resolverAvailable={resolverAvailable}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      forceRefresh={props.forceRefresh}
    />
    </div>
}

export default memo(IndexLayout, function indexLayoutPropsAreEqual(prev, next) {
    const keys = Object.keys(prev)
    if (keys.length !== Object.keys(next).length) return false
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (key === 'mediaController') {
            const pm = prev.mediaController
            const nm = next.mediaController
            if (pm === nm) continue
            if (!pm || !nm) return false
            if (pm.isPlaying !== nm.isPlaying) return false
            if (pm.isLoading !== nm.isLoading) return false
            const pt = pm.tune && pm.tune.id
            const nt = nm.tune && nm.tune.id
            if (pt !== nt) return false
            continue
        }
        if (prev[key] !== next[key]) return false
    }
    return true
})
