import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import IndexSearchForm from './IndexSearchForm'


export default function IndexLayout(props) {
    var [filter, setFilter] = useState('')
    //var [bookFilter, setBookFilter] = useState('')
    const [tunes, setTunes] = useState(props.tunebook.tunes ? Object.values(props.tunebook.tunes) : {})
    
    function filterSearch(tune) {
        var filterOk = false
        var bookFilterOk = false
        var bookFilter = props.currentTuneBook
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
    
    //function updateList(filterIn, bookIn) {
       //return
       //console.log('YL', filterIn, bookIn)
        //var filter = filterIn ? props.tunebook.utils.toSearchText(filterIn) : ''
        //var bookFilter = bookIn ? props.tunebook.utils.toSearchText(bookIn) : ''
        //setTunes(Object.values(props.tunebook.tunes).filter(filterSearch)) 
    //}
    
    return <div className="index-layout"  >
        <IndexSearchForm filter={filter} setFilter={setFilter}  forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook}  />
        <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {props.tunebook.tunes && Object.values(props.tunebook.tunes)
        .filter(filterSearch)
        //function(tune) {
            //if (props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(filter)) !== -1)  {
                //return true
            //} else {
                //return false
            //}
        //})
        .map(function(tune,tk) {
            return <ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} ><Link to={"/tunes/"+tune.id} onClick={function() {props.tunebook.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} >{tune.name} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}</Link></ListGroup.Item>
        })}
        </ListGroup>
        
    </div>
}
