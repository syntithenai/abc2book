import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState} from 'react'
import IndexSearchForm from './IndexSearchForm'


export default function IndexLayout(props) {
    var [filter, setFilter] = useState('')
    var [bookFilter, setBookFilter] = useState('')
    return <div className="index-layout"  >
        <IndexSearchForm  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} filter={filter} setFilter={setFilter}  bookFilter={bookFilter} setBookFilter={setBookFilter} />
        <ListGroup id="tune-index"  style={{clear:'both', width: '100%'}}>
        {props.tunebook.tunes && Object.values(props.tunebook.tunes).filter(function(tune) {
            if (props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(filter)) !== -1)  {
                return true
            } else {
                return false
            }
        }).map(function(tune,tk) {
            return <ListGroup.Item key={tk} className={(tk%2 === 0) ? 'even': 'odd'} ><Link to={"/tunes/"+tune.id} onClick={function() {props.tunebook.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage',10)}} >{tune.name} {tune.type && <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b>}</Link></ListGroup.Item>
        })}
        </ListGroup>
        
    </div>
}
