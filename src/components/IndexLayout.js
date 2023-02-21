/* global window */
import {Link  } from 'react-router-dom'
import {Button, Dropdown, Badge} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import IndexSearchForm from './IndexSearchForm'
import BoostSettingsModal from './BoostSettingsModal'
import SelectedItemsModal from './SelectedItemsModal'

import Abc from './Abc'

var LIST_PROTECTION_LIMIT = 500

export default function IndexLayout(props) {
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
    
    
    function filterSearchNoBooks(tune) {
        if (tune.books && tune.books.length > 0) {
            return false
        } else {
            return true
        }
    }
    
    useEffect(function() {
        window.addEventListener("scroll", props.setScrollOffset);
        return () => {
            window.removeEventListener("scroll", props.setScrollOffset);
        };
    },[])

    // reset selection when grouping, book or tag filters change (but not text filter)
    useEffect(function() {
        //console.log('CLEAR SELECTION',props.groupBy,props.currentTuneBook, props.tagFilter)
        setSelected({})
        setSelectedCount(0)
    },[props.groupBy,props.currentTuneBook, props.tagFilter])
    
    function filterSearch(tune) {
       return props.tunebook.filterSearch(tune,props.filter, props.currentTuneBook, props.tagFilter)
    }
    
    useEffect(function() {
        //console.log("IL boot")
        if (true || filtered === null || filtered === undefined) {
          //console.log('RUN SEARCH on init')
          //var filtered = Object.values(props.tunes).filter(filterSearch)
          //console.log( 'F',props.filter,'B', props.currentTuneBook,"t", props.tagFilter,"G",props.groupBy)
          //filtered.sort(function(a,b) { 
              //return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
          //})
          
          //setFiltered(filtered)
          runFilter()
          //setSelected({})
          //setSelectedCount(0)
        } else {
            //console.log('RUN SEARCH init use cache')
            console.log( filtered, grouped,'F',props.filter,'B', props.currentTuneBook,"t", props.tagFilter,"G",props.groupBy)
        }
        setTimeout(function() {
            //console.log('doscrollSTART',props.scrollOffset)
            window.scroll(0,props.scrollOffset)
            props.stopWaiting()
        },300)
    },[])
    
    
    
    function runFilter() {
          setGrouped({})
          setFiltered({})
          props.startWaiting()
          var filtered = Object.values(props.tunes).filter(filterSearch)
          filtered.sort(function(a,b) { 
              return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
          })
          setFiltered(filtered)
          var tuneStatus = {}
          var tuneStatusGroups = {}
          filtered.forEach(function(tune, tuneKey) {
                if (filtered.length < LIST_PROTECTION_LIMIT) {
                    var hasNotes = false
                    var hasChords = false
                    if (tune.voices) {
                        Object.values(tune.voices).forEach(function(voice) {
                            if (Array.isArray(voice.notes)) {
                                for (var i=0 ; i < voice.notes.length; i++) {
                                    if (voice.notes[i]) {
                                        hasNotes = true
                                        if (voice.notes[i].indexOf('"') !== -1) {
                                            hasChords = true
                                        }
                                        if (hasNotes &&  hasChords) {
                                            break;
                                        } 
                                    }
                                }
                            }
                        })
                    }
                    var hasLyrics = props.tunebook.hasLyrics(tune)
                    tuneStatus[tune.id] = {
                      hasLyrics:hasLyrics,
                      hasNotes: hasNotes,
                      hasChords: hasChords
                    }
                    var tuneStatusKey = []
                    if (hasLyrics) tuneStatusKey.push('lyrics')
                    if (hasNotes) tuneStatusKey.push('notes')
                    if (hasChords) tuneStatusKey.push('chords')
                    if ((Array.isArray(tune.links) && tune.links.length > 0)) tuneStatusKey.push('media')
                    if (!tuneStatusGroups.hasOwnProperty(tuneStatusKey.join(","))) {
                        tuneStatusGroups[tuneStatusKey.join(",")] = []
                    }
                    tuneStatusGroups[tuneStatusKey.join(",")].push(tuneKey)
                }
          })
          setTuneStatus(tuneStatus)
          //console.log('runfilter',props.groupBy)
          if (props.groupBy && filtered.length < LIST_PROTECTION_LIMIT) {
              if (props.groupBy === "tuneStatus") {
                  setGrouped(tuneStatusGroups)
              } else {
                setGrouped(props.tunebook.groupTunes(filtered, props.groupBy))
              }
          } else {
              setGrouped(null)
          }
          var count = 0
          Object.keys(selected).forEach(function(tuneId) {
              if (!tuneStatus[tuneId])  {
                  selected[tuneId] = false
               } else  {
                   if (selected[tuneId]) {
                       count ++ 
                   }
               }
          })
          setSelected(selected)
          setSelectedCount(count)
        
    }
    
    useEffect(function() {
        var newHash = JSON.stringify([props.groupBy, props.filter,props.currentTuneBook, props.tagFilter])
      //console.log('CHANGE', 'OLD',listHash,'NEW', newHash)
      if (listHash !== newHash) {
          //console.log("IL currentTuneBook", props.currentTuneBook, props.filter,  props.tagFilter)
            if (props.filter && props.filter.trim().length > 2 || props.currentTuneBook|| (Array.isArray(props.tagFilter) && props.tagFilter.length > 0)) {
                //console.log('RUN SEARCH on change')
                runFilter()
            
                setTimeout(function() {
                    //console.log('doscroll',props.scrollOffset)
                    window.scroll(0,props.scrollOffset)
                    props.stopWaiting()
                },300)
                
            } else if (props.filter.length <= 2 && props.filter.length > 0) {
              //console.log("more input")
              setFiltered({})
              //setSelected({})
            } else  {
                //console.log("no books, tags or filter")
                var filtered = Object.values(props.tunes).filter(filterSearchNoBooks)
                filtered.sort(function(a,b) { 
                      return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
                })
                if (props.groupBy && props.groupBy !== 'tuneStatus') {
                      setGrouped(props.tunebook.groupTunes(filtered, props.groupBy))
                } else {
                      setGrouped(null)
                }

                setFiltered(filtered)
                //setSelected({})
              
            }
        }
         //else {
            ////console.log('HASHMATCH')
        //}
      setListHash(newHash)
    },[props.groupBy, props.filter,props.currentTuneBook, props.tagFilter, listHash])
    
    
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
            props.forceRefresh()
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
    
    function renderListItems(filtered) {
        return <>
        {filtered.length > 0 ? <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {filtered.map(function(tune,tk) {
          //<span style={{ float:'right', position:'relative', top:'-9px'}} ><BoostSettingsModal badgeClickable={true} tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span>
            
            return (tune && tune.id) ? <ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{borderTop:'2px solid black', borderLeft:'2px solid black', borderRight:'2px solid black'}} >
                
                {(Object.keys(filtered).length > 0 && Object.keys(filtered).length < LIST_PROTECTION_LIMIT) && <>
                    <span style={{ marginLeft:'0.3em', float:'right'}}>
                        <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasNotes) ? <Button variant="outline-primary" >{props.tunebook.icons.music}</Button> : null}</span>
                        <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasChords) ? <Button variant="outline-primary">{props.tunebook.icons.guitar}</Button> : null}</span>
                        <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLyrics) ? <Button variant="outline-primary">{props.tunebook.icons.quillpen}</Button> : null}</span>
                        <span>{(Array.isArray(tune.links) && tune.links.length > 0) ? <Button variant="outline-primary">{props.tunebook.icons.youtubeblack}</Button> : null}</span>
                    </span> 
                    {(tune && tune.id && selected && selected[tune.id]) && <Button    variant={'success'} size="lg" onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                    {(tune && tune.id && (!selected || !selected[tune.id])) && <Button variant={'secondary'} size="lg"  onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                    &nbsp;&nbsp;
                  
                </>}
                
                      {(tune.books && tune.books.length > 0) && <span style={{ marginRight:'1em', float:'right'}} >
                        {tune.books.map(function(book,count) {if (props.currentTuneBook && props.currentTuneBook === book) {return null} else { return <Button onClick={function() { props.setCurrentTune(book); props.setFilter(''); props.forceRefresh()}} key={book} variant="primary" style={{color:'white', marginRight:'0.1em', fontSize:'0.5em'}} >{book}</Button>}})}
                    </span>}
                    {(Array.isArray(tune.tags) && tune.tags.length > 0) && <span style={{ marginRight:'1em', float:'right'}} >
                        {tune.tags.map(function(tag,count) { return props.tagFilter.indexOf(tag) === -1 ? <Button  key={tag} variant="info" style={{marginRight:'0.1em', fontSize:'0.5em'}} >{tag}</Button> : ''})}
                    </span>}
                {(Object.keys(filtered).length > 0 && Object.keys(filtered).length < LIST_PROTECTION_LIMIT) && <>    
                    {tune.key && <Button style={{ marginRight:'1em', float:'right'}} variant={'outline-success'}   >{tune.key}</Button>}
                    {tune.meter && <Button style={{ marginRight:'0.1em', float:'right'}} variant={'outline-success'}   >{tune.meter}</Button>}
                    {tune.tempo ? <Button style={{ marginRight:'0.1em', float:'right'}} variant={'outline-info'}   >{tune.tempo}</Button> : ''}
                    <span style={{float:'right', marginRight:'0.5em'}}><BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}}  /></span  >
                </>}
                    
                <span><Link key={tk} style={{textDecoration:'none', color:'black'}} to={"/tunes/"+tune.id} onClick={function() {props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} ><Button variant="primary" style={{minWidth:'30%'}} >{tune.name && tune.name.trim().length > 0 ? tune.name : 'Untitled Song'} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{fontSize:'0.5em'}}>{tune.composer ? ' - ' + tune.composer : ''}</span></Button> </Link></span>
                
                {props.showPreviewInList && <Abc link={true} scale="0.7" abc={props.tunebook.abcTools.json2abc_cheatsheet(tune)}  tunebook={props.tunebook} />}
                
                {props.showPreviewInList && <div>{tune.words.slice(0,3).map(function(line) {return <div>{line}</div>})}</div>}
            
                
            </ListGroup.Item> : ''
        })}
        </ListGroup> : <div style={{clear:'both', width:'100%', marginTop: '1em'}}> </div>}
        
        </>
    }
    
    
    return <div className="index-layout"  >
    
        <div id={JSON.stringify(selected)} >
        <IndexSearchForm tunes={props.tunes} selected={Object.keys(selected).map(function(v) {
                if (selected[v]) {
                     return v
                } else {
                    return ''
                }
            }).join(",") 
            } abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} googleDocumentId={props.googleDocumentId} token={props.token}  tunesHash={props.tunesHash} filter={props.filter} setFilter={props.setFilter}   forceRefresh={forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} forceRefresh={function() { setListHash(''); props.forceRefresh()}}  groupBy={props.groupBy} setGroupBy={props.setGroupBy} token={props.token} filtered={filtered} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter}   setSelected={props.setSelected} lastSelected={props.lastSelected} setLastSelected={props.setLastSelected} selectedCount={props.selectedCount} setSelectedCount={props.setSelectedCount} filtered={props.filtered} setFiltered={props.setFiltered} grouped={props.grouped} setGrouped={props.setGrouped}  tuneStatus={props.tuneStatus} setTuneStatus={props.setTuneStatus}  listHash={props.listHash} setListHash={props.setListHash}  searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}  showPreviewInList={props.showPreviewInList} setShowPreviewInList={props.setShowPreviewInList}LIST_PROTECTION_LIMIT={LIST_PROTECTION_LIMIT} />
        </div>
        
        {props.tunes && <div style={{float:'left',  backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}}  >
        
        {(filtered && filtered.length > 0) &&<span  ><Button variant={countSelected() > 0 ? "secondary" : 'success'} onClick={function(e) {selectAllToggle()}}  >{props.tunebook.icons.checkdouble}</Button></span>}
        
        {countSelected() > 0 &&  <SelectedItemsModal tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} defaultTagOptions={props.tunebook.getTuneTagOptions} searchTagOptions={props.tunebook.getSearchTuneTagOptions} forceRefresh={function() {forceRefresh()}} selected={selected} setSelected={setSelected}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} selectedCount={selectedCount} setSelectedCount={setSelectedCount} />}
        
        {selectedCount > 0 && <span style={{marginLeft:'0.5em'}} >{selectedCount}/{filtered.length} tunes selected</span>}
        {selectedCount === 0 && <span style={{marginLeft:'0.5em'}} >{Object.keys(filtered).length} matching tunes</span>}
        
        </div>}
        
        <hr style={{width: '100%'}} />    
        {!grouped && renderListItems(filtered)}
        
        {grouped && <div>{ Object.keys(grouped).sort(function(a,b) {
            if (parseInt(a) > 0 && parseInt(b) > 0) {
                return parseInt(a) > parseInt(b)  ? 1 : -1
            } else {
                return a > b ? 1 : -1
            }
        }).map(function(groupKey,groupNum) {
            return (groupKey && grouped[groupKey].length > 0 && (props.filter.length == 0 ||props.filter.length > 2)) ? <Button style={{marginRight:'0.1em'}} variant='outline-success' onClick={function() {props.tunebook.utils.scrollTo('group-'+groupKey)}} >{groupKey}</Button> : null
        })}</div>}
        
        {grouped && <div>{ Object.keys(grouped).sort(function(a,b) {
            if (!a || a.trim() === '') return -1
            if (parseInt(a) > 0 && parseInt(b) > 0) {
                return parseInt(a) > parseInt(b) ? 1 : -1
            } else {
                return a > b ? 1 : -1
            }
        }).map(function(groupKey,groupNum) {
            var filteredGroup = []
            if (Array.isArray(grouped[groupKey])) grouped[groupKey].forEach(function(itemKey) {
                filteredGroup.push(filtered[itemKey])
            })
            return (filteredGroup.length > 0  && (props.filter.length == 0 ||props.filter.length > 2)) ? <>
            <a id={"group-"+groupKey} ></a>
           
            <br/>
            <div style={{float:'left', marginRight:'1em'}}>
            {(countSelected(groupKey) === filteredGroup.length) && <Button    variant={'success'} size="lg" onClick={function(e) {selectAllToggle(groupKey)}} >{props.tunebook.icons.checkdouble}</Button>}
            {(countSelected(groupKey) < filteredGroup.length) && <Button variant={'secondary'} size="lg"  onClick={function(e) {selectAllToggle(groupKey)}} >{props.tunebook.icons.checkdouble}</Button>}
            </div>
            <Badge style={{float:'right'}} >{filteredGroup.length}</Badge>
            <h3> {groupKey && <Button style={{float:'left'}} variant="outline-secondary" onClick={function() {props.tunebook.utils.scrollTo('topofpage')}} >{props.tunebook.icons.arrowup}</Button>}&nbsp;&nbsp;&nbsp;{groupKey} </h3>
            {renderListItems(filteredGroup)}
            </> : ''
            
        })}</div>}
       
        
    </div>
}
 //{Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div><div ><b>Try a book</b></div>
            //<div>{Object.keys(props.tunebook.getTuneBookOptions()).map(function(option, ok) {
                //return <span  key={ok}><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(option)}} >{option}</Button>&nbsp;&nbsp;</span>
            //})}</div>
        //</div>}
