import {Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import BookSelectorModal from './BookSelectorModal'
import GroupBySelectorModal from './GroupBySelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import AddSongModal from './AddSongModal'
import ImportOptionsModal from './ImportOptionsModal'
import {useParams, useNavigate} from 'react-router-dom'
import useKeyPress from '../useKeyPress';

export default function IndexSearchForm(props) {
    //console.log('BOOKINDEX',props.tunebook.indexes.bookIndex)
    //var [filter, setFilter] = useState('')
    var navigate = useNavigate()
    var [inputColor, setInputColor] = useState('#e9ecef')
    //var [tuneBook, setTuneBook] = useState('')
    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }
    
    //useEffect(function() {
        //console.log('change sel',props.selected)
    //},[props.selected])    
    //
    const onKeyPress = (event) => {
        if (!props.blockKeyboardShortcuts && event.key === 'n') {
            //console.log('new',event.ctrlKey)
            document.getElementById('tunebookbuttons').children[0].click()
        } 
        //console.log(`key pressed: ${event.key}`);
    };
    //useKeyPress(['n'], onKeyPress);

    //const [blockKeyboardShortcuts, setBlockKeyboardShortcuts] = useState(false)
    
    //console.log("SP",getShowParam())
// props.updateList(e.target.value)
    const showImport = (getShowParam() === "importList" || getShowParam() === "importAbc" || getShowParam() === "importCollection")
    
    
    return <div id="tunesearchform" style={{padding:'0.3em', minHeight:'4em', clear:'both', backgroundColor: '#d3d3d385'}} >
      <span style={{float:'right', backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
            <AddSongModal setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} tunes={props.tunes} show={getShowParam()} forceRefresh={props.forceRefresh} filter={props.filter} setFilter={props.setFilter}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter}  searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}/>
            <ImportOptionsModal show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} token={props.token}  />
            <Button onClick={function() {props.tunebook.fillMediaPlaylist(props.currentTuneBook,props.selected,navigate)}} variant={"danger"} size="small" >{props.tunebook.icons.youtube}</Button>
            <Button onClick={function() {props.tunebook.fillAbcPlaylist(props.currentTuneBook,props.selected,navigate)}} variant={"success"} size="small" >{props.tunebook.icons.play}</Button>
        </span>
         <Button onClick={function() {props.setFilter(''); props.setCurrentTuneBook(''); props.setGroupBy(''); props.setTagFilter([]); props.setSelected({}); props.setSelectedCount(0); props.setFiltered(''); props.setGrouped({}); props.setListHash('')}} variant={"danger"} size="small" style={{marginRight:'0.1em'}} >{props.tunebook.icons.closecircle }</Button>
         
         <input onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}} style={{width:'30%', backgroundColor: inputColor  }} type='search' value={props.filter ? props.filter : ''} onChange={function(e) {props.setFilter(e.target.value);  if (e.target.value.length > 1) {setInputColor('#e8fff4') } else {setInputColor('#e9ecef')} }} />
         
           <BookSelectorModal blockKeyboardShortcuts={props.blockKeyboardShortcuts} forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh();}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >{props.tunebook.icons.book} {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>} />
          
          <span style={{ marginLeft:'0.1em'}} >
          
                <TagsSearchSelectorModal  setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={props.tagFilter} onChange={function(val) { 
                    props.setTagFilter(val)
                    props.forceRefresh()
                    //console.log('change search filter ',val)
                          //var currentSelection = Object.keys(props.selected).filter(function(item) {
                            //return (props.selected[item] ? true : false)
                          //})
                          //props.tunebook.bulkChangeTunes(currentSelection, 'tags', val)
                          //navigate('/blank')
                          //setTimeout(function() {
                              //navigate('/tunes')
                          //},500)
                     
                    } }
               />
              </span>
           
         <>{(props.tunes && props.filtered.length < 1500) && <GroupBySelectorModal onChange={function(val) { props.setGroupBy(val)}}  value={props.groupBy} tunebook={props.tunebook}  showPreviewInList={props.showPreviewInList} setShowPreviewInList={props.setShowPreviewInList} />}</>
        
         
    </div>
        
}


 

//{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}
 //<div style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}   id="tunesearchextras" >
           
        //</div>
       

  //<span style={{float:'right', backgroundColor:'lightgrey', padding:'0.2em', clear:'both'}} id="tunebookbuttons" >
            //<AddSongModal show={getShowParam()} forceRefresh={props.forceRefresh} filter={props.filter} setFilter={props.setFilter}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            //<ImportOptionsModal  token={props.token} show={showImport}  tunesHash={props.tunesHash}  forceRefresh={props.forceRefresh}   tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
        //</span>
 //<select value={props.bookFilter} onChange={function(e) {props.setBookFilter(e.target.value)}}  >
                //<option>a is a very long option so that it takes</option>
                //<option>b</option>
            //</select>

//<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.folderadd}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.folderopen}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.save}</Button>
            //<Button variant="info" style={{marginLeft:'0.3em'}} onClick={function(e) {}} >{props.icons.deletebin}</Button>
            //<Button variant="info" style={{color: 'black',marginLeft:'0.3em'}}  onClick={function(e) {}} >...</Button>
