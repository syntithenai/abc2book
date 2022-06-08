import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import IndexSearchForm from './IndexSearchForm'
import BoostSettingsModal from './BoostSettingsModal'

export default function IndexLayout(props) {
    var [filter, setFilter] = useState('')
    var [filtered, setFiltered] = useState('')
    var [tuneStatus, setTuneStatus] = useState({})
    //var [bookFilter, setBookFilter] = useState('')
    //const [tunes, setTunes] = useState(props.tunes ? Object.values(props.tunes) : {})
    
    function filterSearch(tune) {
        console.log('filterSearch',props.currentTuneBook,filter)
        var filterOk = false
        var bookFilterOk = false
        var bookFilter = props.currentTuneBook
        // no filters means show tunes with NO book selected
        if (!filter && !bookFilter) {
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
                        if (props.tunebook.utils.toSearchText(book).indexOf(bookFilter) !== -1) {
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
        console.log("IL boot")
      var filtered = Object.values(props.tunes).filter(filterSearch)
      setFiltered(filtered)
    },[])
    useEffect(function() {
      console.log("IL currentTuneBook")
      var filtered = Object.values(props.tunes).filter(filterSearch)
      setFiltered(filtered)
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
                                if (voice.notes[i].indexOf('"' !== -1)) {
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
      //},100)
    },[filter,props.currentTuneBook])
    
    
    return <div className="index-layout"  >
        <IndexSearchForm  tunes={props.tunes} tunesHash={props.tunesHash} sfilter={filter} setFilter={setFilter}  forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  />
        {props.tunes && <div style={{float:'left',  backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}}  >
        {filtered.length} matching tunes
        </div>}
        {filtered.length > 0 ? <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {filtered.map(function(tune,tk) {
            //var l = (tune.name ? tune.name.length : 0) + (tune.type ? tune.type.length : 0)
            //var pad = <>{''.padStart(40 - - l,'&nbsp;_')}</>
            
            
            return <Link key={tk} style={{textDecoration:'none' }} to={"/tunes/"+tune.id} onClick={function() {props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} ><ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} >
                <span style={{ float:'right', position:'relative', top:'-9px'}} ><BoostSettingsModal badgeClickable={false} tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span>
                
                <span >{tune.name} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br/></span>
                <span style={{ marginLeft:'0.3em'}}>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasNotes) ? <Button>{props.tunebook.icons.music}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasChords) ? <Button>{props.tunebook.icons.guitar}</Button> : null}</span>
                    <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLyrics) ? <Button>{props.tunebook.icons.words}</Button> : null}</span>
                </span>
            </ListGroup.Item></Link>
        })}
        </ListGroup> : <div style={{clear:'both', width:'100%', marginTop: '1em'}}>
        {Object.keys(props.tunebook.getTuneBookOptions()).length > 0 && <div><div ><b>Try a book</b></div>
            <div>{Object.keys(props.tunebook.getTuneBookOptions()).map(function(option, ok) {
                return <span key={ok}><Button onClick={function(e) {props.setCurrentTuneBook(option)}} >{option}</Button>&nbsp;&nbsp;</span>
            })}</div>
        </div>}
        </div>}
        
    </div>
}
