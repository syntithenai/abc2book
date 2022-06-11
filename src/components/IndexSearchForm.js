import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState} from 'react'
import BookSelectorModal from './BookSelectorModal'

import AddSongModal from './AddSongModal'
import ImportOptionsModal from './ImportOptionsModal'
import TuneBookOptionsModal from './TuneBookOptionsModal'
import {useParams} from 'react-router-dom'
export default function IndexSearchForm(props) {
    //console.log('BOOKINDEX',props.tunebook.indexes.bookIndex)
    var [filter, setFilter] = useState('')
    //var [tuneBook, setTuneBook] = useState('')
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    //console.log("SP",getShowParam())
// props.updateList(e.target.value)
    const showImport = (getShowParam() === "importList" || getShowParam() === "importAbc" || getShowParam() === "importCollection")
    return <div id="tunesearchform" style={{padding:'0.3em', minHeight:'4em', clear:'both', backgroundColor: '#d3d3d385'}} >
        
        <span style={{float:'right', backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
            <AddSongModal show={getShowParam()} forceRefresh={props.forceRefresh} filter={props.filter} setFilter={props.setFilter}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            <ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        </span>
        <input  style={{width:'30%'}} type='search' value={props.filter} onChange={function(e) {props.setFilter(e.target.value);   }} />
        <div style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}   id="tunesearchextras" >
           {props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh();}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>} /><TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} />
        </div>
        
    </div>
        
}

 //<select value={props.bookFilter} onChange={function(e) {props.setBookFilter(e.target.value)}}  >
                //<option>a is a very long option so that it takes</option>
                //<option>b</option>
            //</select>

//<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.folderadd}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.folderopen}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.save}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.deletebin}</Button>
            //<Button variant="info" style={{color: 'black',marginLeft:'0.3em'}}  onClick={function(e) {}} >...</Button>
