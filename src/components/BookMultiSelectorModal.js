import {useState} from 'react'
import {Button, Modal, ListGroup, Badge} from 'react-bootstrap'

function BookMultiSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value.toLowerCase())
    if (e.target.value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(e.target.value))
      },500)
    }
  } 
  
    function newBook(book) {
        if(book && book.trim()) {
            props.tunebook.indexes.addBookToIndex(book); 
            var newValue = Array.isArray(props.value) ? props.value : []
            newValue.push(book)
            var uniqueBooksSelected = props.tunebook.utils.uniquifyArray(newValue)
            setFilter('')
            props.onChange(uniqueBooksSelected)
            props.forceRefresh()
        }
    }
    
    function selectBook(book) {
      var newValue = Array.isArray(props.value) ? props.value : []
      newValue.push(book)
      var uniqueBooksSelected = props.tunebook.utils.uniquifyArray(newValue)
      props.onChange(uniqueBooksSelected)
      props.forceRefresh()
    }
    
    function deselectBook(book) {
      var uniqueBooksSelected = props.value.filter(function(selectedBook) {
        if (selectedBook === book) {
          return false
        } else {
          return true
        }
      })
      props.onChange(uniqueBooksSelected)
      props.forceRefresh()
    }
  var sortedOptions = Object.keys(options)
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  return (
    <>
     
       <Button onClick={handleShow} style={{position:'relative', float:'left', marginLeft:'0.1em', width:'2.6em', height:'2.37em'}} variant="primary" >
        <span  style={{position:'absolute', top:'1px', left:'1.3em', opacity: 0.9, fontSize:'0.5em'}} >{props.tunebook.icons.book}</span> 
        <Badge bg="secondary"  style={{position:'absolute', top:'26px', left:'1.4em',  fontSize:'0.5em'}} >{props.value ? props.value.length : ''}</Badge>
      </Button>
     
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Add Tune to Books</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <Button onClick={handleClose} variant="success" style={{float:'right', marginBottom:'0.3em'}}>OK</Button>
          <div>{Array.isArray(props.value) && props.value.map(function(selectedBook) {
              return <Button key={selectedBook} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectBook(selectedBook)}} >{props.tunebook.icons.closecircle}&nbsp;{selectedBook}</Button>
            })}</div>
            
          <input type='search' value={filter} onChange={filterChange}   onFocus={function() {props.setBlockKeyboardShortcuts(true)}} onBlur={function() {props.setBlockKeyboardShortcuts(false)}}  />
          <Button key="newbook" onClick={function() {newBook(filter)}}  >New Book</Button>
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectBook(option)}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookMultiSelectorModal
