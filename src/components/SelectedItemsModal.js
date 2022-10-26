import {useState} from 'react'
import {Button, Modal, Tabs, Tab, ListGroup} from 'react-bootstrap'

export default function SelectedItemsModal(props) {
  console.log(props)
  const [show, setShow] = useState(false);
  const [filterAdd, setFilterAdd] = useState('');
  const [filterRemove, setFilterRemove] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
    setFilterAdd(''); 
    setFilterRemove(''); 
  }
  
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
    setFilterAdd(value.toLowerCase())
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
        if (window.confirm("Are you sure that you want to add all the selected tunes to the new book - "+filterAdd+" ?")) {
        console.log('new',filterAdd)
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
       if (window.confirm("Are you sure that you want to add all the selected tunes to the book - "+option+" ?")) {
         //props.onChange(filterAdd); 
          props.tunebook.addTunesToBook(Object.keys(props.selected), option)
          setFilterAdd(''); 
          setFilterRemove(''); 
          handleClose()
       }
    }
  }
  
  function clickRemoveOption(option) {
    //console.log('rem',option)
    if(option && option.trim()) {
      if (window.confirm("Are you sure that you want to remove all the selected tunes to the book - "+option+" ?")) {
        props.tunebook.removeTunesFromBook(Object.keys(props.selected), option)
        //props.onChange(filterRemove); 
        setFilterAdd(''); 
        setFilterRemove(''); 
        handleClose()
      }
    }
  }   
  
  function clickDelete(e) {
    if (window.confirm("Are you sure that you want to delete all the selected tunes?")) {
      props.tunebook.deleteTunes(Object.keys(props.selected))
      //setTimeout(function() {
        props.forceRefresh()
        handleClose()
        props.setSelected({})
      //},1000)
      
      
    }
  }
  function fillMediaPlaylist() {
    var tunes=props.tunebook.mediaFromSelection(props.selected)
    console.log(tunes)
    props.setMediaPlaylist({currentTune: 0, book:'selection', tunes:Object.values(tunes)})
    handleClose()
  }


  return (
    <>
      <Button  variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.dropdown}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>With selected tunes ..</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <Button style={{float:'right', marginLeft:'0.4em'}} variant="danger" onClick={clickDelete} >Delete</Button>
          <Button style={{float:'right'}} variant="success" onClick={fillMediaPlaylist} >{props.tunebook.icons.youtube}</Button>
          <Tabs defaultActiveKey="addbook" >
            <Tab  eventKey="addbook" title="Add">
              <input type='search' value={filterAdd} onChange={function(e) {filterAddChange(e.target.value)}}   />
              {(props.allowNew !== false)  && <Button key="newbook" onClick={newBook}  >New Book</Button>}
              <ListGroup  style={{clear:'both', width: '100%'}}>
                {Object.keys(options).map(function(option,tk) {
                  return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickAddOption(options[option])}} >{options[option]}</ListGroup.Item>
                })}
              </ListGroup>
            </Tab>
            <Tab  eventKey="removebook" title="Remove">
              <input type='search' value={filterRemove} onChange={function(e) {filterRemoveChange(e.target.value)}}   />
              <ListGroup  style={{clear:'both', width: '100%'}}>
                {Object.keys(options).map(function(option,tk) {
                  return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function() {clickRemoveOption(options[option])}} >{options[option]}</ListGroup.Item>
                })}
              </ListGroup>
            </Tab>
          </Tabs>
        </Modal.Body>

      </Modal>
    </>
  );
}
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
