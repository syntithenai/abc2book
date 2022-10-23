import {Link  } from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import IndexSearchForm from './IndexSearchForm'
import BoostSettingsModal from './BoostSettingsModal'
import SelectedItemsModal from './SelectedItemsModal'




export default function IndexLayout(props) {
    var [filter, setFilter] = useState('')
    var [filtered, setFiltered] = useState('')
    var [tuneStatus, setTuneStatus] = useState({})
    var [selected, setSelected] = useState({})
    var [selectedCount, setSelectedCount] = useState({})
    //var [bookFilter, setBookFilter] = useState('')
    //const [tunes, setTunes] = useState(props.tunes ? Object.values(props.tunes) : {})
    
    function filterSearchNoBooks(tune) {
        if (tune.books && tune.books.length > 0) {
            return false
        } else {
            return true
        }
    }

    function filterSearch(tune) {
        //console.log('filterSearch',props.currentTuneBook,filter)
        var filterOk = false
        var bookFilterOk = false
        var bookFilter = props.currentTuneBook
        // no filters means show tunes with NO book selected
        if (!bookFilter && (!filter) ) {
            if (tune.books && tune.books.length > 0) {
                return false
            } else {
                return true
            }
        }  else {
            if (!filter || filter.trim().length === 0) {
                filterOk = true
            } else {
                if (tune && tune.name && tune.name.length > 0 && filter.length > 0 && props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(filter)) !== -1) {
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
            //console.log('FILTER',tune,filter, bookFilter,tune.name, tune.books,(filterOk && bookFilterOk))
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
      setFiltered(filtered)
      setSelected({})
      setSelectedCount(0)
    },[])
    
    useEffect(function() {
      //console.log("IL currentTuneBook")
      if (filter.length === 1) {
          setFiltered({})
          setSelected({})
      } else if (filter.length > 1 || props.currentTuneBook) {
          var filtered = Object.values(props.tunes).filter(filterSearch)
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
            var filtered = Object.values(props.tunes).filter(filterSearchNoBooks)
            setFiltered(filtered)
            setSelected({})
          
        }
      //},100)
    },[filter,props.currentTuneBook])
    
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
    
    return <div className="index-layout"  >
        <IndexSearchForm tunes={props.tunes} googleDocumentId={props.googleDocumentId} token={props.token} tunes={props.tunes} tunesHash={props.tunesHash} sfilter={filter} setFilter={setFilter}  forceRefresh={forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  />
        {props.tunes && <div style={{float:'left',  backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}}  >
        
        {filtered.length > 0 &&<span  ><Button variant={countSelected() > 0 ? "secondary" : 'success'} onClick={function(e) {selectAllToggle()}}  >{props.tunebook.icons.checkdouble}</Button></span>}
        
        {selectedCount > 0 &&  <SelectedItemsModal tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} forceRefresh={function() {forceRefresh()}} selected={selected} setSelected={setSelected} />}
        
        {selectedCount > 0 && <span style={{marginLeft:'0.5em'}} >{selectedCount}/{filtered.length} tunes selected</span>}
        {selectedCount === 0 && <span style={{marginLeft:'0.5em'}} >{Object.keys(filtered).length} matching tunes</span>}
        
        </div>}
        
        
        {filtered.length > 0 ? <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {filtered.map(function(tune,tk) {
            //var l = (tune.name ? tune.name.length : 0) + (tune.type ? tune.type.length : 0)
            //var pad = <>{''.padStart(40 - - l,'&nbsp;_')}</>
            
            
            //var checkboxProps = {
                //type:"checkbox",
                //onClick: function(e) {handleSelection(e,tune.id)},
            //}
            //if (selected[tune.id]) checkboxProps['checked']=true
            //else  checkboxProps['checked']=false
            //checkboxProps['checked']=true
            //console.log(checkboxProps)
             //<span style={{ float:'right', position:'relative', top:'-9px'}} ><BoostSettingsModal badgeClickable={true} tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span>
            
            return <ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} >
                <span style={{ marginLeft:'0.3em', float:'right'}}>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasNotes) ? <Button variant="outline-primary" >{props.tunebook.icons.music}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasChords) ? <Button variant="outline-primary">{props.tunebook.icons.guitar}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLyrics) ? <Button variant="outline-primary">{props.tunebook.icons.words}</Button> : null}</span>
                </span> 
                {selected[tune.id] && <Button    variant={'success'} size="lg" onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                {!selected[tune.id] && <Button variant={'secondary'} size="lg"  onClick={function(e) {handleSelection(e,tune.id)}} >{props.tunebook.icons.check}</Button>}
                &nbsp;&nbsp;
                {(tune.books.length > 0) && <span style={{ marginRight:'1em', float:'right'}} >
                    {tune.books.map(function(book,count) {if (props.currentTuneBook && props.currentTuneBook === book) {return null} else { return <Button variant="info" style={{marginRight:'0.1em'}} >{book}</Button>}})}
                </span>}
                
                <span><Link key={tk} style={{textDecoration:'none', color:'black'}} to={"/tunes/"+tune.id} onClick={function() {props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} ><Button variant="primary" style={{minWidth:'30%'}} >{tune.name && tune.name.trim().length > 0 ? tune.name : 'Untitled Song'} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</Button></Link></span>
                
            </ListGroup.Item>
        })}
        </ListGroup> : <div style={{clear:'both', width:'100%', marginTop: '1em'}}>
       
        </div>}
        
    </div>
}
 //{Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div><div ><b>Try a book</b></div>
            //<div>{Object.keys(props.tunebook.getTuneBookOptions()).map(function(option, ok) {
                //return <span  key={ok}><Button style={{marginTop:'0.4em'}} onClick={function(e) {props.setCurrentTuneBook(option)}} >{option}</Button>&nbsp;&nbsp;</span>
            //})}</div>
        //</div>}
