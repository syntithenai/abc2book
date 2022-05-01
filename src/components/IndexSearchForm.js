import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState} from 'react'
import ListSelectorModal from './ListSelectorModal'
import ImportAbcModal from './ImportAbcModal'
import ImportListModal from './ImportListModal'
import AddSongModal from './AddSongModal'

export default function IndexSearchForm(props) {
    
    var [filter, setFilter] = useState('')
    var [tuneBook, setTuneBook] = useState('')
    
    function getOptions() {
        return {'a':'a ver a ','b is a nother key': 'bbbbbbbbbbbbbbbbbs'}
    }
    
    function getSearchOptions(filter) {
        var opts = getOptions()
        var filtered = {}
        Object.keys(opts).forEach(function(key) {
            var val = opts[key]
            if (val && val.indexOf(filter) !== -1) {
                filtered[key] = val
            }
        })
        return filtered
    }
    
    
    return <div id="tunesearchform" style={{padding:'0.3em', minHeight:'4em', clear:'both', backgroundColor: '#d3d3d385'}} >
        <input autoFocus style={{width:'30%'}} type='text' value={filter} onChange={function(e) {setFilter(e.target.value)}} />
        <span style={{ clear:'both'}} id="tunesearchextras" >
           <ListSelectorModal title={'Select a Book'} value={tuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={getOptions} searchOptions={getSearchOptions} triggerElement={<Button style={{marginLeft:'1em'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>}  extraButtons={[<Button key="newbook" >New Book</Button>, <Button key="collections" >Collections</Button>]}  />
            <Button style={{marginLeft:'1em'}} >...</Button>
        </span>
        <span style={{float:'right', backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
            <AddSongModal filter={filter} setFilter={setFilter}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            <ImportAbcModal tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} />
            <ImportListModal  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} />
        </span>
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
