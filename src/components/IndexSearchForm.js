import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState} from 'react'
import BookSelectorModal from './BookSelectorModal'

import AddSongModal from './AddSongModal'
import ImportOptionsModal from './ImportOptionsModal'
import TuneBookOptionsModal from './TuneBookOptionsModal'

export default function IndexSearchForm(props) {
    //console.log('BOOKINDEX',props.tunebook.indexes.bookIndex)
    var [filter, setFilter] = useState('')
    //var [tuneBook, setTuneBook] = useState('')
    
    
// props.updateList(e.target.value)
    
    return <div id="tunesearchform" style={{padding:'0.3em', minHeight:'4em', clear:'both', backgroundColor: '#d3d3d385'}} >
        <span style={{float:'right', backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
            <AddSongModal forceRefresh={props.forceRefresh} filter={props.filter} setFilter={props.setFilter}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            <ImportOptionsModal  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        </span>
        <input autoFocus style={{width:'30%'}} type='search' value={props.filter} onChange={function(e) {props.setFilter(e.target.value); props.forceRefresh() ;  }} />
        <div style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}   id="tunesearchextras" >
           {props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh();}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>} /><TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}/>
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
