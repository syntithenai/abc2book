/* global window */
import {Link  } from 'react-router-dom'
import {Button, Dropdown, Badge} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import IndexSearchForm from './IndexSearchForm'
import BoostSettingsModal from './BoostSettingsModal'
import SelectedItemsModal from './SelectedItemsModal'




export default function IndexLayout(props) {
    //var [filter, setFilter] = useState('')
    var [filtered, setFiltered] = useState('')
    var [grouped, setGrouped] = useState({})
    var [tuneStatus, setTuneStatus] = useState({})
    var [selected, setSelected] = useState({})
    var [selectedCount, setSelectedCount] = useState({})
    //var [groupBy, setGroupBy] = useState('')
    //var [bookFilter, setBookFilter] = useState('')
    //const [tunes, setTunes] = useState(props.tunes ? Object.values(props.tunes) : {})
    
    function filterSearchNoBooks(tune) {
        if (tune.books && tune.books.length > 0) {
            return false
        } else {
            return true
        }
    }
    
    useEffect(function() {
        //var onScroll = function(e) {console.log('scrolled',e)}
        // restore scroll on load
        //function dt(offset) {
          //setTimeout(() => {
            //console.log('dosdcroll',offset)
            //window.scroll(window, 0, offset)
          //},500)
        //}
        //dt(props.scrollOffset)
        window.addEventListener("scroll", props.setScrollOffset);
          //window.scroll(0,props.scrollOffset)
        //console.log('add scroll and restore to ',props.scrollOffset)
        return () => {
            //console.log('remove scroll')
            window.removeEventListener("scroll", props.setScrollOffset);
        };
    },[])

    function filterSearch(tune) {
        //console.log('filterSearch',props.currentTuneBook,filter)
        var filterOk = false
        var bookFilterOk = false
        var bookFilter = props.currentTuneBook
        // no filters means show tunes with NO book selected
        if (!bookFilter && (!props.filter) ) {
            if (tune.books && tune.books.length > 0) {
                return false
            } else {
                return true
            }
        }  else {
            if (!props.filter || props.filter.trim().length === 0) {
                filterOk = true
            } else {
                if (tune && ((tune.name && tune.name.length > 0  && props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(props.filter)) !== -1) || (tune.composer && tune.composer.length > 0  && props.tunebook.utils.toSearchText(tune.composer).indexOf(props.tunebook.utils.toSearchText(props.filter)) !== -1))) {
                    filterOk = true
                } 
            }
            if (!bookFilter || bookFilter.trim().length === 0) {
                bookFilterOk = true
            } else {
                if (tune && tune.books && tune.books.length > 0 && bookFilter.length > 0) {
                    tune.books.forEach(function(book) {
                        if (book.toLowerCase() === bookFilter.toLowerCase()) {
                            bookFilterOk = true
                        }
                    })
                } 
            }
            //console.log('FILTER',tune,props.filter, bookFilter,tune.name, tune.books,(filterOk && bookFilterOk))
            return (filterOk && bookFilterOk)
        }
    }
    
    //function updateList(filterIn, bookIn) {
       //return
       //console.log('YL', filterIn, bookIn)
        //var filter = filterIn ? props.tunebook.utils.toSearchText(filterIn) : ''
        //var bookFilter = bookIn ? props.tunebook.utils.toSearchText(bookIn) : ''
        //setTunes(Object.values(props.tunebook.tunes).filter(filterSearch)) 
    //}
    
    
    function hasLyrics(tune) {
        //return props.tunebook.hasLyrics(tune)
        if (tune && tune.words) {
            //console.log("HL",tune)
            var found = false
            var wordList = Object.values(tune.words)
            for (var i = 0; i < wordList.length; i++) {
                var word =  wordList[i]
                if (word && word.trim()) {
                    found = true
                    break
                }
            }
        }
        return found
    }
    useEffect(function() {
        //console.log("IL boot")
      var filtered = Object.values(props.tunes).filter(filterSearch)
      filtered.sort(function(a,b) { 
          return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
      })
      
      setFiltered(filtered)
      setSelected({})
      setSelectedCount(0)
    },[])
    
    // create an index of list items collated by props.groupBy
    function groupTunes(items) {
        var collated = {}
        if (props.groupBy) {
            items.forEach(function(item,itemKey) {
                var key = ''
                if (Array.isArray(item[props.groupBy])) {
                    key = item[props.groupBy].sort().filter(function(a) {console.log(a); return (props.currentTuneBook && a != props.currentTuneBook)  }).join(", ")
                } else {
                    key = (item[props.groupBy] && item[props.groupBy].trim) ? item[props.groupBy].trim() : ''
                }
                if (key) {
                    if (!collated.hasOwnProperty(key)) {
                        collated[key] = []
                        collated[key].push(itemKey)
                    } else {
                        collated[key].push(itemKey)
                    }
                } else {
                    if (!collated.hasOwnProperty('')) {
                        collated[''] = []
                    }
                    collated[''].push(itemKey)  
                }
            })
        }
        
        return collated
    }
    
    useEffect(function() {
      //console.log("IL currentTuneBook", props.currentTuneBook, props.filter)
      if (props.filter.length <= 2 && props.filter.length > 0) {
          //console.log("more input")
          setFiltered({})
          setSelected({})
      } else if (props.filter && props.filter.trim().length > 2 || props.currentTuneBook) {
          //console.log("filter")
          var filtered = Object.values(props.tunes).filter(filterSearch)
          filtered.sort(function(a,b) { 
              return (a.name && b.name && a.name.trim() < b.name.trim()) ? -1 : 1
          })
          if (props.groupBy) {
              setGrouped(groupTunes(filtered))
          } else {
              setGrouped(null)
          }
          
          //console.log("filterd", filtered)
          //if (groupBy) {
              
          //} 
          setFiltered(filtered)
          setSelected({})
          setSelectedCount(0)
          var tuneStatus = {}
          //setTimeout(function() {
              filtered.forEach(function(tune) {
                var hasNotes = false
                var hasChords = false
                if (tune.voices) {
                    Object.values(tune.voices).forEach(function(voice) {
                        if (Array.isArray(voice.notes)) {
                            for (var i=0 ; i < voice.notes.length; i++) {
                                if (voice.notes[i]) {
                                    hasNotes = true
                                    //console.log('has chords',(voice.notes[i].indexOf('"') !== -1),voice.notes[i])
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
                tuneStatus[tune.id] = {
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                }
              })
              setTuneStatus(tuneStatus)
        } else {
            console.log("no books")
            var filtered = Object.values(props.tunes).filter(filterSearchNoBooks)
            if (props.groupBy) {
                  setGrouped(groupTunes(filtered))
            } else {
                  setGrouped(null)
            }

            setFiltered(filtered)
            setSelected({})
          
        }
        
        setTimeout(function() {
            //console.log('dosdcroll',props.scrollOffset)
            window.scroll(0,props.scrollOffset)
        },300)
        //props.tunebook.utils.scrollTo("topofpage",props.scrollOffset)
        
      //},100)
    },[props.groupBy, props.filter,props.currentTuneBook, props.tunes])
    
    function selectAllToggle() {
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
    }
    
    function handleSelection(e,tuneId) {
        //console.log('HS',tuneId,selected[tuneId],selected)
        e.preventDefault(); 
        e.stopPropagation();
        if (selected[tuneId] === true) {
            selected[tuneId] = false
        } else {
            selected[tuneId] = true
        }
        setSelected(selected)
        setSelectedCount(countSelected())
        props.forceRefresh()
        //console.log('HSend',tuneId,selected[tuneId],selected)
    }
    
    function countSelected() {
        var count = 0
        Object.keys(selected).forEach(function(key) {
            if (selected[key]) count++ 
        })
        //console.log("CCC",count)
        return count
    }
    

    
    function forceRefresh() {
        var filtered = Object.values(props.tunes).filter(filterSearch)
        setFiltered(filtered)
        props.forceRefresh()
    }
    
    function renderListItems(filtered) {
        return <>
        {filtered.length > 0 ? <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {filtered.map(function(tune,tk) {
          //<span style={{ float:'right', position:'relative', top:'-9px'}} ><BoostSettingsModal badgeClickable={true} tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span>
            
            return <ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{borderTop:'2px solid black'}} >
                <span style={{ marginLeft:'0.3em', float:'right'}}>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasNotes) ? <Button variant="outline-primary" >{props.tunebook.icons.music}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasChords) ? <Button variant="outline-primary">{props.tunebook.icons.guitar}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLyrics) ? <Button variant="outline-primary">{props.tunebook.icons.quillpen}</Button> : null}</span>
                    <span>{(Array.isArray(tune.links) && tune.links.length > 0) ? <Button variant="outline-primary">{props.tunebook.icons.youtubeblack}</Button> : null}</span>
                </span> 
                {selected[tune.id] && <Button    variant={'success'} size="lg" onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                {!selected[tune.id] && <Button variant={'secondary'} size="lg"  onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                &nbsp;&nbsp;
                {(tune.books.length > 0) && <span style={{ marginRight:'1em', float:'right'}} >
                    {tune.books.map(function(book,count) {if (props.currentTuneBook && props.currentTuneBook === book) {return null} else { return <Button onClick={function() {console.log('setbook',book); props.setCurrentTune(book); props.setFilter(''); props.forceRefresh()}} key={book} variant="info" style={{marginRight:'0.1em'}} >{book}</Button>}})}
                </span>}
                {tune.key && <Button style={{ marginRight:'1em', float:'right'}} variant={'outline-success'}   >{tune.key}</Button>}
                {tune.meter && <Button style={{ marginRight:'1em', float:'right'}} variant={'outline-success'}   >{tune.meter}</Button>}
                
                <span><Link key={tk} style={{textDecoration:'none', color:'black'}} to={"/tunes/"+tune.id} onClick={function() {props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} ><Button variant="primary" style={{minWidth:'30%'}} >{tune.name && tune.name.trim().length > 0 ? tune.name : 'Untitled Song'} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</Button></Link></span>
                
            </ListGroup.Item>
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
            } abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} googleDocumentId={props.googleDocumentId} token={props.token} tunes={props.tunes} tunesHash={props.tunesHash} filter={props.filter} setFilter={props.setFilter}   forceRefresh={forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} forceRefresh={props.forceRefresh}  groupBy={props.groupBy} setGroupBy={props.setGroupBy} />
        </div>
        
        {props.tunes && <div style={{float:'left',  backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}}  >
        
        {filtered.length > 0 &&<span  ><Button variant={countSelected() > 0 ? "secondary" : 'success'} onClick={function(e) {selectAllToggle()}}  >{props.tunebook.icons.checkdouble}</Button></span>}
        
        {selectedCount > 0 &&  <SelectedItemsModal tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} forceRefresh={function() {forceRefresh()}} selected={selected} setSelected={setSelected}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />}
        
        {selectedCount > 0 && <span style={{marginLeft:'0.5em'}} >{selectedCount}/{filtered.length} tunes selected</span>}
        {selectedCount === 0 && <span style={{marginLeft:'0.5em'}} >{Object.keys(filtered).length} matching tunes</span>}
        
        </div>}
        
        <hr style={{width: '100%'}} />    
        {!grouped && renderListItems(filtered)}
        
        {grouped && <div>{ Object.keys(grouped).sort().map(function(groupKey,groupNum) {
            return groupKey ? <Button style={{marginRight:'0.1em'}} variant='outline-success' onClick={function() {props.tunebook.utils.scrollTo('group-'+groupKey)}} >{groupKey}</Button> : null
        })}</div>}
        
        {grouped && <div>{ Object.keys(grouped).sort().map(function(groupKey,groupNum) {
            var filteredGroup = []
            if (Array.isArray(grouped[groupKey])) grouped[groupKey].forEach(function(itemKey) {
                filteredGroup.push(filtered[itemKey])
            })
            return <>
            <a id={"group-"+groupKey} ></a>
           
            <br/>

            <Badge style={{float:'right'}} >{filteredGroup.length}</Badge>
            <h3> {groupKey && <Button style={{float:'left'}} variant="outline-secondary" onClick={function() {props.tunebook.utils.scrollTo('topofpage')}} >{props.tunebook.icons.arrowup}</Button>}&nbsp;&nbsp;&nbsp;{groupKey} </h3>
            {renderListItems(filteredGroup)}
            </>
            
        })}</div>}
       
        
    </div>
}
 //{Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div><div ><b>Try a book</b></div>
            //<div>{Object.keys(props.tunebook.getTuneBookOptions()).map(function(option, ok) {
                //return <span  key={ok}><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(option)}} >{option}</Button>&nbsp;&nbsp;</span>
            //})}</div>
        //</div>}
