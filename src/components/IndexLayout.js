/* global window */
import { useNavigate } from 'react-router-dom'
import { Button, Badge, ButtonGroup, Alert } from 'react-bootstrap'
import { ListGroup } from 'react-bootstrap'
import { useState, useEffect, useRef, memo } from 'react'
import IndexSearchForm from './IndexSearchForm'
import SelectedItemsModal from './SelectedItemsModal'
import VirtualizedTuneList, { COMPACT_ROW_HEIGHT } from './VirtualizedTuneList'
import TuneListRow from './TuneListRow'
import MediaListRow from './MediaListRow'
import { searchMainMediaSources } from '../mainMediaSearchClient'
import {
  isAndroidLocalMediaAvailable,
  requestAndroidAudioPermission,
} from '../androidLocalMediaSearchClient'
import { tuneRowsFromTunes, mergeSearchListRows, getSearchRowKey, isMediaSearchRow } from '../searchListRows'
import { stageMediaCandidateToTunebook } from '../stageMediaCandidateToTunebook'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
    
import {buildSearchPageTitle, DEFAULT_APP_TITLE, SEARCH_PAGE_TITLE_BASE, setDocumentTitle} from '../pageTitle'
import { compareSearchGroupKeys } from '../searchListOrder'
import { playQueueItem, navigateToQueueTune } from '../nowPlayingQueuePlayback'
import { appendTunesToQueue, createQueue, insertTunesAfterCurrentInQueue } from '../nowPlayingQueue'
import { getPlayableTuneIdsFromListRows } from '../collectionQueueUtils'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'
import SelectAllToggle from './SelectAllToggle'
import { toast } from 'react-toastify'
import { getActivePlaybackTuneId } from '../playbackNavigationUtils'
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

function IndexLayout(props) {
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
    var [listPageOffset, setListPageOffset] = useState(0)
    var [listPageMeta, setListPageMeta] = useState(null)
    var [mediaSearchResults, setMediaSearchResults] = useState([])
    var [mediaSearchBusy, setMediaSearchBusy] = useState(false)
    var [deviceAudioNeedsPermission, setDeviceAudioNeedsPermission] = useState(false)
    var [deviceAudioPermissionBusy, setDeviceAudioPermissionBusy] = useState(false)
    var [deviceAudioPermissionRevision, setDeviceAudioPermissionRevision] = useState(0)
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
        setDocumentTitle(buildSearchPageTitle(props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, base))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.searchTitleBase])

    // reset selection when grouping, book, tag or genre filters change (but not text filter)
    useEffect(function() {
        setSelected({})
        setSelectedCount(0)
        setListPageOffset(0)
    },[props.groupBy,props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter, props.filter, setSelected, setSelectedCount])

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
       return props.tunebook.filterSearch(tune, props.filter, props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter)
    }

    function applyFilterResult(result) {
      if (!result) return
      setFiltered(result.filtered)
      setGrouped(result.grouped)
      setTuneStatus(result.tuneStatus)
      setTagCollation(result.tagCollation)
      setListPageMeta(result.listPage || null)
      setListPageOffset(0)
      const pruned = pruneSelectionForStatus(selected, result.tuneStatus)
      setSelected(pruned.selected)
      setSelectedCount(pruned.selectedCount)
    }

    function usesPaginatedList() {
      if (isCatalogStorageEnabled()) return true
      if (listPageMeta && listPageMeta.total > CATALOG_PAGE_SIZE) return true
      return Array.isArray(filtered) && filtered.length > CATALOG_PAGE_SIZE
    }

    function getVisibleFilteredTunes() {
      if (!Array.isArray(filtered) || filtered.length === 0) return filtered
      if (!usesPaginatedList()) return filtered
      const offset = listPageOffset
      const limit = CATALOG_PAGE_SIZE
      return filtered.slice(offset, offset + limit)
    }

    function getListPageTotal() {
      if (listPageMeta && listPageMeta.total) return listPageMeta.total
      return Array.isArray(filtered) ? filtered.length : 0
    }

    function runFilter() {
      const runId = filterRunIdRef.current + 1
      filterRunIdRef.current = runId
      setGrouped({})
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
          starredFilter: props.starredFilter,
          filter: props.filter,
          textFilter: props.filter,
        },
      }).then(function(result) {
        if (!result || filterRunIdRef.current !== runId) return
        applyFilterResult(result)
        props.stopWaiting()
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
          starredFilter: props.starredFilter,
          filter: props.filter,
          textFilter: props.filter,
        },
      })
      setGrouped(result.grouped)
      setFiltered(result.filtered)
      setTuneStatus(result.tuneStatus)
      setTagCollation(result.tagCollation)
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
        var tuneCount = props.tunes ? Object.keys(props.tunes).length : 0
        var newHash = buildListHashKey([
          props.groupBy,
          props.filter,
          props.currentTuneBook,
          props.tagFilter,
          props.genreFilter,
          props.artistFilter,
          props.starredFilter,
          tuneCount,
          props.tunesContentRevision || 0,
        ])
      if (listHash !== newHash) {
            if (props.filter && props.filter.trim().length > 2 || props.currentTuneBook|| props.starredFilter || (Array.isArray(props.tagFilter) && props.tagFilter.length > 0) || (Array.isArray(props.genreFilter) && props.genreFilter.length > 0) || (Array.isArray(props.artistFilter) && props.artistFilter.length > 0)) {
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
    },[props.groupBy, props.filter, props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter, listHash, props.tunes ? Object.keys(props.tunes).length : 0, props.tunesContentRevision])

    useEffect(function() {
      const displayMode = props.listDisplayMode || 'compact'
      if (displayMode !== 'detailed' && displayMode !== 'preview') {
        listSelectionCurtailedToastKeyRef.current = null
        return
      }
      ensureTuneStatusForVisibleList(filtered)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild status metadata when detailed/preview list is shown
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

    function handleAddMediaToTunebook(candidate) {
      stageMediaCandidateToTunebook(candidate, {
        book: props.currentTuneBook || '',
        tags: Array.isArray(props.tagFilter) ? props.tagFilter : [],
      }).catch(function(err) {
        toast.error(err && err.message ? err.message : 'Could not open Add to Tunebook')
      })
    }

    function handleMediaPlaybackError(err) {
      toast.error(err && err.message ? err.message : 'Could not play media')
    }

    function isListSelectionCurtailed(tunes) {
      const rows = listRowsForTunes(tunes)
      return rows.length > 0 && rows.length >= LIST_PROTECTION_LIMIT
    }

    function selectionCurtailedInCurrentView() {
      const displayMode = props.listDisplayMode || 'compact'
      if (displayMode !== 'detailed' && displayMode !== 'preview') return false
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
            if (countSelected() > 0) {
                filtered.forEach(function(tune) {
                    selected[tune.id] = false
                })
            } else {
                var selectedCount = 0
                getVisibleFilteredTunes().forEach(function(tune) {
                    if (selectedCount >= BULK_SELECTION_LIMIT) return
                    selected[tune.id] = true
                    selectedCount += 1
                })
            }
            setSelected(enforceSelectionLimit(selected))
            setSelectedCount(countSelected())
            props.forceRefresh()
        } else {
             if (grouped && Array.isArray(grouped[groupKey])) {
                var count = 0
                if (grouped[groupKey].length === countSelected(groupKey)) {
                    // all off
                    grouped[groupKey].forEach(function(id) {
                        if (filtered[id] && filtered[id].id) selected[filtered[id].id] = false
                    })
                } else {
                    // all on
                    grouped[groupKey].forEach(function(id) {
                        if (filtered[id] && filtered[id].id) selected[filtered[id].id] = true
                    })
                }
                setSelected(enforceSelectionLimit(selected))
                setSelectedCount(countSelected())
                props.forceRefresh()
                //grouped[groupKey].forEach(function(id) {
                    //if (filtered[id] && filtered[id].id && selected[filtered[id].id]) count++ 
                //})
                //Object.keys(selected).forEach(function(key) {
             }
        }
    }
    
    function selectBetween(startId,endId) {
        if (startId && endId) {
            var started = false
            filtered.forEach(function(tune) {
                if (tune.id === startId || tune.id === endId) {
                    started = !started
                    selected[tune.id] = true
                }
                if (started) {
                    selected[tune.id] = true
                }
            })
            
            setSelected(enforceSelectionLimit(selected))
            setSelectedCount(countSelected())
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
            if (selected[tuneId] === true) {
                selected[tuneId] = false
                setLastSelected(null)
            } else {
                selected[tuneId] = true
                setLastSelected(tuneId)
            }
            
            setSelected(enforceSelectionLimit(selected))
            setSelectedCount(countSelected())
            //props.forceRefresh()
        }
        
    }
    
    function countSelected(groupKey = null) {
        if (grouped && Array.isArray(grouped[groupKey])) {
            var count = 0
            grouped[groupKey].forEach(function(id) {
                if (filtered[id] && filtered[id].id && selected[filtered[id].id]) count++ 
            })
            return count
        } else {
            var count = 0
            Object.keys(selected).forEach(function(key) {
                if (selected[key]) count++ 
            })
            return count
        }
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

    function renderListItems(items) {
        var displayMode = props.listDisplayMode || 'compact'
        var previewAllowed = !(props.filtered && props.filtered.length > PREVIEW_LIST_LIMIT)
        var isCompact = displayMode === 'compact'
        var isPreview = displayMode === 'preview' && previewAllowed
        var isDetailed = displayMode === 'detailed' || (displayMode === 'preview' && !previewAllowed)
        var rows = listRowsForTunes(items)
        var showRowExtras = (isDetailed || isPreview) && rows.length > 0 && rows.length < LIST_PROTECTION_LIMIT
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
          onBookClick: function(book) { props.setCurrentTuneBook(book); props.setFilter(''); props.forceRefresh() },
          onTagClick: function(tag) { props.setTagFilter([tag]); props.setFilter(''); props.forceRefresh() },
          onSelect: handleSelection,
          forceRefresh: props.forceRefresh,
          mediaController: props.mediaController,
          tunes: props.tunes,
          nowPlayingQueue: props.nowPlayingQueue,
          setNowPlayingQueue: props.setNowPlayingQueue,
          setQueuePlayConfirm: props.setQueuePlayConfirm,
          nowPlayingTuneId: getActivePlaybackTuneId(props.mediaController, props.nowPlayingQueue),
          onAddToTunebook: handleAddMediaToTunebook,
          onMediaError: handleMediaPlaybackError,
          accessToken: resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || '',
        }

        if (rows.length === 0) {
          return <div style={{clear:'both', width:'100%', marginTop: '1em'}} />
        }

        if (isPreview || isDetailed) {
          return (
            <ListGroup id="tune-index" style={{clear:'both', width: '100%'}}>
              {rows.map(function(row, tk) {
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
              })}
            </ListGroup>
          )
        }

        return (
          <VirtualizedTuneList
            rows={rows}
            listId="tune-index"
            rowHeight={COMPACT_ROW_HEIGHT}
            maxHeight={Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220)}
            isCompact={isCompact}
            isPreview={false}
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
            mediaController={props.mediaController}
            tunes={props.tunes}
            nowPlayingQueue={props.nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            setQueuePlayConfirm={props.setQueuePlayConfirm}
            nowPlayingTuneId={getActivePlaybackTuneId(props.mediaController, props.nowPlayingQueue)}
            onAddToTunebook={handleAddMediaToTunebook}
            onMediaError={handleMediaPlaybackError}
            accessToken={resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''}
          />
        )
    }
    
    var visibleFiltered = getVisibleFilteredTunes()
    var listPageTotal = getListPageTotal()
    var showPagination = usesPaginatedList() && listPageTotal > CATALOG_PAGE_SIZE
    var tuneSearchPanelClass = fixedSingleMenu
        ? 'tune-search-panel tune-search-panel-fixed'
        : 'tune-search-panel'
    var freshSelectedCount = countSelected()
    var listDisplayMode = props.listDisplayMode || 'compact'
    var showListSelectionControls = listDisplayMode !== 'compact'

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
        var tuneId = tuneIds[0]
        var playingSelection = freshSelectedCount > 0
        var queue = createQueue({
            tuneIds: tuneIds,
            name: playingSelection ? 'Selection' : 'Filter',
            source: playingSelection ? 'selection' : 'filter',
        })
        if (props.tunebook.startNowPlayingQueue) {
            props.tunebook.startNowPlayingQueue(queue, null, {
                startPlayback: false,
                navigate: false,
            })
        } else if (props.setNowPlayingQueue) {
            props.setNowPlayingQueue(queue)
        }

        var mediaController = props.mediaController
        var tune = props.tunes && props.tunes[tuneId]
        if (!mediaController || !tune) {
            navigate('/tunes/' + tuneId)
            return
        }

        if (mediaController.preparePlaybackFromUserGesture) {
            mediaController.preparePlaybackFromUserGesture()
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
            } nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} googleDocumentId={props.googleDocumentId} token={props.token}  tunesHash={props.tunesHash} filter={props.filter} setFilter={props.setFilter} forceRefresh={function() { setListHash(''); props.forceRefresh()}} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} groupBy={props.groupBy} setGroupBy={props.setGroupBy} filtered={filtered} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter} genreFilter={props.genreFilter} setGenreFilter={props.setGenreFilter} artistFilter={props.artistFilter} setArtistFilter={props.setArtistFilter} starredFilter={props.starredFilter} setStarredFilter={props.setStarredFilter}   setSelected={props.setSelected} lastSelected={props.lastSelected} setLastSelected={props.setLastSelected} selectedCount={props.selectedCount} setSelectedCount={props.setSelectedCount} setFiltered={props.setFiltered} grouped={props.grouped} setGrouped={props.setGrouped}  tuneStatus={props.tuneStatus} setTuneStatus={props.setTuneStatus}  listHash={props.listHash} setListHash={props.setListHash}  searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}  listDisplayMode={props.listDisplayMode} setListDisplayMode={props.setListDisplayMode} LIST_PROTECTION_LIMIT={LIST_PROTECTION_LIMIT} PREVIEW_LIST_LIMIT={PREVIEW_LIST_LIMIT} tagCollation={tagCollation} />
        
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

				{showPagination ? (
          <span className="d-inline-flex align-items-center gap-2" style={{ marginRight: '0.5em' }}>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={listPageOffset <= 0}
              onClick={function() { setListPageOffset(Math.max(0, listPageOffset - CATALOG_PAGE_SIZE)) }}
            >Previous</Button>
            <span className="app-text-muted">
              Page {Math.floor(listPageOffset / CATALOG_PAGE_SIZE) + 1} of {Math.ceil(listPageTotal / CATALOG_PAGE_SIZE)}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={listPageOffset + CATALOG_PAGE_SIZE >= listPageTotal}
              onClick={function() { setListPageOffset(listPageOffset + CATALOG_PAGE_SIZE) }}
            >Next</Button>
          </span>
        ) : null}
			
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
        {!grouped && renderListItems(visibleFiltered)}
        
        {grouped && <div>{ Object.keys(grouped).sort(function(a,b) {
            return compareSearchGroupKeys(props.groupBy, a, b)
        }).map(function(groupKey,groupNum) {
            return (groupKey && grouped[groupKey].length > 0 && (props.filter.length == 0 ||props.filter.length > 2)) ? <Button style={{marginRight:'0.1em'}} variant='outline-success' onClick={function() {props.tunebook.utils.scrollTo('group-'+groupKey)}} >{groupKey}</Button> : null
        })}</div>}
        
        {grouped && <div>{ Object.keys(grouped).sort(function(a,b) {
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
       
        
    </div>
}

export default memo(IndexLayout)
