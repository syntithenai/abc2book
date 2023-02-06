import {useState} from 'react'
import {Button, Modal, Tabs, Tab, ListGroup} from 'react-bootstrap'
import BoostSettingsModal from './BoostSettingsModal'
import TagsSelectorModal from './TagsSelectorModal'
import BulkChangeValueModal from './BulkChangeValueModal'
import {useNavigate} from 'react-router-dom'
    
    
export default function SelectedItemsModal(props) {
  //console.log(props)
  var navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [boost, setBoost] = useState(0);
  const [filterAdd, setFilterAdd] = useState('');
  const [filterRemove, setFilterRemove] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const [filterAddTag, setFilterAddTag] = useState('');
  const [filterRemoveTag, setFilterRemoveTag] = useState('');
  const [tagOptions, setTagOptions] = useState(props.defaultTagOptions());
  
  const handleClose = () => {
      setShow(false);
      
  }
  const handleShow = (e) => {
    setShow(true);
    setFilterAdd(''); 
    setFilterRemove(''); 
    setFilterAddTag(''); 
    setFilterRemoveTag(''); 
  }
  
  // TAGS
  var filterAddTagChangeTimeout = null
  
  function filterAddTagChange(value) {
    setFilterAddTag(value.toLowerCase())
    if (value.trim() === '') {
      setTagOptions(props.defaultTagOptions())
    } else {
      if (filterAddTagChangeTimeout) clearTimeout(filterAddTagChangeTimeout) 
      filterAddTagChangeTimeout = setTimeout(function() {
        setTagOptions(props.searchTagOptions(value))
      },500)
    }
  } 
  
  var filterRemoveTagChangeTimeout = null
  
  function filterRemoveTagChange(value) {
    setFilterRemoveTag(value.toLowerCase())
    if (value.trim() === '') {
      setTagOptions(props.defaultTagOptions())
    } else {
      if (filterRemoveTagChangeTimeout) clearTimeout(filterRemoveTagChangeTimeout) 
      filterRemoveTagChangeTimeout = setTimeout(function() {
        setTagOptions(props.searchTagOptions(value))
      },500)
    }
  } 
  
  function newTag() {
      if(filterAddTag && filterAddTag.trim()) {
        if (window.confirm("Are you sure that you want to add  the tag "+filterAddTag+" to all the selected tunes?")) {
        //console.log('new',filterAddTag)
        //console.log(props.tunebook)
          props.tunebook.indexes.addTagToIndex(filterAddTag); 
          props.tunebook.addTunesToTag(Object.keys(props.selected), filterAddTag)
          //console.log(props.tunebook.indexes)
          //props.onChange(filterAdd); 
          setFilterAddTag(''); 
          setFilterRemoveTag('');
          setTagOptions(props.defaultTagOptions()) 
          props.forceRefresh()
          handleClose()
        }
      }
  }
  
  function clickAddTagOption(option) {
    //console.log('add',option)
    if(option && option.trim()) {
       if (window.confirm("Are you sure that you want to add the tag "+option+" to all the selected tunes ?")) {
         //props.onChange(filterAdd); 
          props.tunebook.addTunesToTag(Object.keys(props.selected), option)
          setFilterAdd(''); 
          setFilterRemove(''); 
          props.forceRefresh()
          handleClose()
       }
    }
  }
  
  function clickRemoveTagOption(option) {
    //console.log('rem',option)
    if(option && option.trim()) {
      if (window.confirm("Are you sure that you want to remove the tag "+option+" from all the selected tunes ?")) {
        props.tunebook.removeTunesFromTag(Object.keys(props.selected), option)
        //props.onChange(filterRemove); 
        setFilterAdd(''); 
        setFilterRemove('');
        props.forceRefresh() 
        handleClose()
      }
    }
  }
  
  // BOOKS
  var filterAddChangeTimeout = null
  
  function filterAddChange(value) {
    setFilterAdd(value.toLowerCase())
    if (value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterAddChangeTimeout) clearTimeout(filterAddChangeTimeout) 
      filterAddChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(value))
      },500)
    }
  } 
  
  var filterRemoveChangeTimeout = null
  
  function filterRemoveChange(value) {
    setFilterRemove(value.toLowerCase())
    if (value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterRemoveChangeTimeout) clearTimeout(filterRemoveChangeTimeout) 
      filterRemoveChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(value))
      },500)
    }
  } 
  
  function newBook() {
      if(filterAdd && filterAdd.trim()) {
        if (window.confirm("Are you sure that you want to add all the selected tunes to the new book  "+filterAdd+" ?")) {
        //console.log('new',filterAdd)
        //console.log(props.tunebook)
          props.tunebook.indexes.addBookToIndex(filterAdd); 
          props.tunebook.addTunesToBook(Object.keys(props.selected), filterAdd)
          //console.log(props.tunebook.indexes)
          //props.onChange(filterAdd); 
          setFilterAdd(''); 
          setFilterRemove('');
          setOptions(props.defaultOptions()) 
          props.forceRefresh()
          handleClose()
        }
      }
  }
  
  function clickAddOption(option) {
    //console.log('add',option)
    if(option && option.trim()) {
       if (window.confirm("Are you sure that you want to add all the selected tunes to the book "+option+" ?")) {
         //props.onChange(filterAdd); 
          props.tunebook.addTunesToBook(Object.keys(props.selected), option)
          setFilterAdd(''); 
          setFilterRemove(''); 
          props.forceRefresh()
          handleClose()
       }
    }
  }
  
  function clickRemoveOption(option) {
    //console.log('rem',option)
    if(option && option.trim()) {
      if (window.confirm("Are you sure that you want to remove all the selected tunes from the book "+option+" ?")) {
        props.tunebook.removeTunesFromBook(Object.keys(props.selected), option)
        //props.onChange(filterRemove); 
        setFilterAdd(''); 
        setFilterRemove('');
        props.forceRefresh() 
        handleClose()
      }
    }
  }   
  
  function clickDelete(e) {
    if (window.confirm("Are you sure that you want to delete all the selected tunes?")) {
      props.tunebook.deleteTunes(Object.keys(props.selected))
      //setTimeout(function() {
        props.setSelected({})
        props.setSelectedCount(0)
        handleClose()
        props.forceRefresh()
        
      //},1000)
      
      
    }
  }
  
  function clickDownload() {
      props.tunebook.utils.download('selected.abc',props.tunebook.abcTools.tunesToAbc(props.tunebook.fromSelection(props.selected))) 
  }
  
  //function fillMediaPlaylist() {
    //var tunes=props.tunebook.mediaFromSelection(props.selected)
    //console.log(tunes)
    //props.setMediaPlaylist({currentTune: 0, book:'selection', tunes:Object.values(tunes)})
    //handleClose()
  //}

var sortedOptions = Object.keys(options)
sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
var sortedTagOptions = Object.keys(tagOptions)
sortedTagOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  
  return (
    <>
      <Button  variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.dropdown}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>With {props.selectedCount} selected tunes ..</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          
          <div style={{clear:'both', width:'100%', height:'4em', borderBottom:'1px solid black'}} >
             <div style={{float:'left'}} ><BulkChangeValueModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} onClose={handleClose} selected={props.selected} selectedCount={props.selectedCount} /></div>

             <div style={{float:'left'}} ><BoostSettingsModal tunebook={props.tunebook} value={''} onChange={function(val) {
                     var currentSelection = Object.keys(props.selected).filter(function(item) {
                        return (props.selected[item] ? true : false)
                      })
                      props.tunebook.bulkChangeTunes(currentSelection, 'boost', val)
                      navigate('/blank')
                      setTimeout(function() {
                          navigate('/tunes')
                      },500)
              
                 }} explicitSave={true} selected={props.selected} forceRefresh={props.forceRefresh} handleClose={handleClose} selectedCount={props.selectedCount} />
                 
             </div>
             
              <Button style={{float:'right', marginLeft:'0.2em'}} variant="success" onClick={clickDownload} >Download</Button>
              <Button style={{float:'right'}} variant="danger" onClick={clickDelete} >Delete</Button>
          </div>    
         
         <Tabs defaultActiveKey="books" >
             <Tab  eventKey="books" title="Books">
                  <Tabs defaultActiveKey="addbook" >
                    <Tab  eventKey="addbook" title="Add">
                      <input type='search' value={filterAdd} onChange={function(e) {filterAddChange(e.target.value)}}   />
                      {(props.allowNew !== false)  && <Button style={{float:'right'}} key="newbook" onClick={newBook}  >New Book</Button>}
                      <ListGroup  style={{clear:'both', width: '100%'}}>
                        {sortedOptions.map(function(option,tk) {
                          return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickAddOption(options[option])}} >{options[option]}</ListGroup.Item>
                        })}
                      </ListGroup>
                    </Tab>
                    <Tab  eventKey="removebook" title="Remove">
                      <input type='search' value={filterRemove} onChange={function(e) {filterRemoveChange(e.target.value)}}   />
                      <Button variant="success" onClick={function() {clickRemoveOption(filterRemove)}} >Remove</Button>
                      <ListGroup  style={{clear:'both', width: '100%'}}>
                        {sortedOptions.map(function(option,tk) {
                          return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickRemoveOption(options[option])}} >{options[option]}</ListGroup.Item>
                        })}
                      </ListGroup>
                    </Tab>
                  </Tabs>
              </Tab>
              
              <Tab  eventKey="tags" title="Tags">
                  <Tabs defaultActiveKey="addtag" >
                    <Tab  eventKey="addtag" title="Add">
                      <input type='search' value={filterAddTag} onChange={function(e) {filterAddTagChange(e.target.value)}}   />
                      {(props.allowNew !== false)  && <Button key="newtagk" onClick={newTag}  >New Tag</Button>}
                      <ListGroup  style={{clear:'both', width: '100%'}}>
                        {sortedTagOptions.map(function(option,tk) {
                          return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickAddTagOption(tagOptions[option])}} >{tagOptions[option]}</ListGroup.Item>
                        })}
                      </ListGroup>
                    </Tab>
                    <Tab  eventKey="removebook" title="Remove">
                       <input type='search' value={filterRemoveTag} onChange={function(e) {filterRemoveTagChange(e.target.value)}}   />
                      <Button variant="success" onClick={function() {clickRemoveTagOption(filterRemoveTag)}} >Remove</Button>
                      <ListGroup  style={{clear:'both', width: '100%'}}>
                        {sortedTagOptions.map(function(option,tk) {
                          return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickRemoveTagOption(tagOptions[option])}} >{tagOptions[option]}</ListGroup.Item>
                        })}
                      </ListGroup>
                    </Tab>
                  </Tabs>
                </Tab>
              </Tabs>
            </Modal.Body>

      </Modal>
    </>
  );
}

 //<span style={{float:'left', marginLeft:'0.1em'}} ><TagsSelectorModal selectedCount={props.selectedCount} explicitSave={true} forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={[]} onChange={function(val) { 
                      //var currentSelection = Object.keys(props.selected).filter(function(item) {
                        //return (props.selected[item] ? true : false)
                      //})
                      //props.tunebook.bulkChangeTunes(currentSelection, 'tags', val)
                      //navigate('/blank')
                      //setTimeout(function() {
                          //navigate('/tunes')
                      //},500)
                 
              //} } /></span>
             

//tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()
//<Modal.Body>
          //<input type='search' value={filter} onChange={function(e) {filterChange(e.target.value)}}   />
          //{(props.allowNew !== false)  && <Button key="newbook" onClick={function() {newBook(filter); handleClose()}}  >New Book</Button>}
        //</Modal.Body>
        //<Modal.Footer>
          //<ListGroup  style={{clear:'both', width: '100%'}}>
            //{Object.keys(options).map(function(option,tk) {
              //return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); filterChange(''); handleClose()}} >{options[option]}</ListGroup.Item>
            //})}
          //</ListGroup>
        //</Modal.Footer>
