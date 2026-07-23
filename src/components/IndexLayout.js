/* global window */
import { useNavigate } from 'react-router-dom'
import { Button, Badge } from 'react-bootstrap'
import { ListGroup } from 'react-bootstrap'
import { useState, useEffect, useRef, memo } from 'react'
import IndexSearchForm from './IndexSearchForm'
import SelectedItemsModal from './SelectedItemsModal'
import VirtualizedTuneList, { COMPACT_ROW_HEIGHT } from './VirtualizedTuneList'
import TuneListRow from './TuneListRow'
    
import {buildSearchPageTitle, DEFAULT_APP_TITLE, SEARCH_PAGE_TITLE_BASE, setDocumentTitle} from '../pageTitle'
import { compareSearchGroupKeys } from '../searchListOrder'
import { playQueueItem, navigateToQueueTune } from '../nowPlayingQueuePlayback'
import { toast } from 'react-toastify'
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
} from '../tuneListFilter'

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
    var filterRunIdRef = useRef(0)
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
        //console.log('CLEAR SELECTION',props.groupBy,props.currentTuneBook, props.tagFilter)
        setSelected({})
        setSelectedCount(0)
    },[props.groupBy,props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter, setSelected, setSelectedCount])
    
    function filterSearch(tune) {
       return props.tunebook.filterSearch(tune, props.filter, props.currentTuneBook, props.tagFilter, props.genreFilter, props.artistFilter, props.starredFilter)
    }

    function applyFilterResult(result) {
      if (!result) return
      setFiltered(result.filtered)
      setGrouped(result.grouped)
      setTuneStatus(result.tuneStatus)
      setTagCollation(result.tagCollation)
      const pruned = pruneSelectionForStatus(selected, result.tuneStatus)
      setSelected(pruned.selected)
      setSelectedCount(pruned.selectedCount)
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
        //console.log("IL boot")
        setTimeout(function() {
            window.scroll(0, scrollOffset)
            stopWaiting()
        },300)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore scroll position once on mount
    },[])
    
    const lastScrollTopRef = useRef(0);
	const [fixedSingleMenu, setFixedSingleMenu] = useState(false)
	useEffect(() => {
		//console.log('scroll init')
		const handleScroll = (e) => {
			//console.log('scroll e')
			//console.log('scrolld e',e, e.currentTarget, e.target)
				const currentScrollTop = window.scrollY;
				if (currentScrollTop > lastScrollTopRef.current) {
				  // Scrolling down
				  //console.log('Scrolling down',window.scrollY);
				  setFixedSingleMenu(false)
				} else {
				  // Scrolling up
				  //console.log('Scrolling up',window.scrollY);
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
      return expandPdfSnapshotSearchRows(list, props.filter)
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
                //console.log('HS sele')
                filtered.forEach(function(tune) {
                    selected[tune.id] = false
                })
            } else {
                //console.log('HS NO sele')
                filtered.forEach(function(tune) {
                    selected[tune.id] = true
                })
            }
            setSelected(selected)
            setSelectedCount(countSelected())
            props.forceRefresh()
        } else {
             //console.log('select all toggle group',groupKey)
             if (grouped && Array.isArray(grouped[groupKey])) {
                var count = 0
                if (grouped[groupKey].length === countSelected(groupKey)) {
                    //console.log('select all ON')
                    // all off
                    grouped[groupKey].forEach(function(id) {
                        if (filtered[id] && filtered[id].id) selected[filtered[id].id] = false
                    })
                } else {
                    //console.log('select all OFF')
                    // all on
                    grouped[groupKey].forEach(function(id) {
                        if (filtered[id] && filtered[id].id) selected[filtered[id].id] = true
                    })
                }
                setSelectedCount(countSelected())
                props.forceRefresh()
                //console.log('count grouepd',selected,grouped)
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
            
            setSelected(selected)
            setSelectedCount(countSelected())
            props.forceRefresh()
        }
    }
    
    function handleSelection(e,tuneId) {
        // TODO grouped
        
        //console.log('HS',e, tuneId,selected[tuneId],selected)
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
            
            setSelected(selected)
            setSelectedCount(countSelected())
            //props.forceRefresh()
        }
        
        //console.log('HSend',tuneId,selected[tuneId],selected)
    }
    
    function countSelected(groupKey = null) {
        if (grouped && Array.isArray(grouped[groupKey])) {
            var count = 0
            //console.log('count grouepd',selected,grouped)
            grouped[groupKey].forEach(function(id) {
                if (filtered[id] && filtered[id].id && selected[filtered[id].id]) count++ 
            })
            return count
        } else {
            var count = 0
            Object.keys(selected).forEach(function(key) {
                if (selected[key]) count++ 
            })
            //console.log("CCC",count)
            return count
        }
    }
    
    
    //function gatherSelected() {
        //var count = 0
        //var final = {}
        //return selected.split(",").forEach(function(key) {
            //if (key && props.tunes[key] && props.tunes[key]._id) final[props.tunes[key]._id] = props.tunes[key] 
        //})
        //console.log("CCC",props.selected,final )
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
        var rowProps = {
          isCompact: isCompact,
          isPreview: isPreview,
          showRowExtras: showRowExtras,
          showStarToggle: showStarToggle,
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
        }

        if (rows.length === 0) {
          return <div style={{clear:'both', width:'100%', marginTop: '1em'}} />
        }

        if (isPreview || isDetailed) {
          return (
            <ListGroup id="tune-index" style={{clear:'both', width: '100%'}}>
              {rows.map(function(row, tk) {
                return (
                  <TuneListRow key={(row.tune && row.tune.id ? row.tune.id : tk) + '-' + tk} row={row} index={tk} {...rowProps} />
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
          />
        )
    }
    
    var tuneSearchPanelClass = fixedSingleMenu
        ? 'tune-search-panel tune-search-panel-fixed'
        : 'tune-search-panel'
    var freshSelectedCount = countSelected()
    var listDisplayMode = props.listDisplayMode || 'compact'
    var showListSelectionControls = listDisplayMode !== 'compact'

    function handlePlayFromList() {
        var selectedIds = Object.keys(selected).filter(function(id) {
            return selected[id]
        }).join(',')
        var tuneId = props.tunebook.fillAnyPlaylist(
            props.currentTuneBook,
            selectedIds,
            props.tagFilter,
            null,
            props.genreFilter,
            props.artistFilter
        )
        if (!tuneId) {
            toast.warn('No playable tunes found in the current list.')
            return
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
        

			{props.tunes && <div style={{ height:'3em', padding:'0.2em', clear:'both'}}  >
			
				{(showListSelectionControls && filtered && filtered.length > 0) &&<span  ><Button variant={freshSelectedCount > 0 ? "secondary" : 'success'} onClick={function(e) {selectAllToggle()}}  >{props.tunebook.icons.checkdouble}</Button></span>}
				
				{(showListSelectionControls && freshSelectedCount > 0) &&  <span style={{marginLeft:'0.35em'}}><SelectedItemsModal mediaController={props.mediaController} tunebook={props.tunebook} token={props.token} tunesHash={props.tunesHash} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} defaultTagOptions={props.tunebook.getTuneTagOptions} searchTagOptions={props.tunebook.getSearchTuneTagOptions} forceRefresh={function() {forceRefresh()}} selected={selected} setSelected={setSelected}  nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} selectedCount={freshSelectedCount} setSelectedCount={setSelectedCount} /></span>}
				
				{(showListSelectionControls && freshSelectedCount > 0 && filtered)  && <span style={{marginLeft:'0.5em'}} >{freshSelectedCount}/{filtered.length} tunes selected</span>}
				{(freshSelectedCount === 0 && filtered) && <span style={{marginLeft:'0.5em'}} >{Object.keys(filtered).length} matching tunes</span>}
				{(filtered && filtered.length > 0) && <span className="tune-list-play-wrap"><Button className="tune-list-play-btn" variant="success" data-testid="play-from-list-button" aria-label={freshSelectedCount > 0 ? 'Play Selected' : 'Play All'} onClick={handlePlayFromList}>{props.tunebook.icons.playwhite}<span className="tune-list-play-label"><span className="tune-list-play-verb">Play </span>{freshSelectedCount > 0 ? 'Selected' : 'All'}</span></Button></span>}
			
			</div>}
        </div>
        <hr style={{width: '100%'}} />
        {props.waiting && (
          <div className="index-layout-waiting" style={{ padding: '0.5em', color: '#555' }}>
            Updating tune list...
          </div>
        )}
        {!grouped && renderListItems(filtered)}
        
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
            <div style={{float:'left', marginRight:'1em'}}>
            {showListSelectionControls && (countSelected(groupKey) === filteredGroup.length) && <Button    variant={'success'} size="lg" onClick={function(e) {selectAllToggle(groupKey)}} >{props.tunebook.icons.checkdouble}</Button>}
            {showListSelectionControls && (countSelected(groupKey) < filteredGroup.length) && <Button variant={'secondary'} size="lg"  onClick={function(e) {selectAllToggle(groupKey)}} >{props.tunebook.icons.checkdouble}</Button>}
            </div>
            <Badge style={{float:'right'}} >{filteredGroup.length}</Badge>
            <h3> {groupKey && <Button style={{float:'left'}} variant="outline-secondary" onClick={function() {props.tunebook.utils.scrollTo('topofpage')}} >{props.tunebook.icons.arrowup}</Button>}&nbsp;&nbsp;&nbsp;{groupKey} </h3>
            {renderListItems(filteredGroup)}
            </> : ''
            
        })}</div>}
       
        
    </div>
}

export default memo(IndexLayout)
