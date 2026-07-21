import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup, Badge} from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import VoiceFillInput from './VoiceFillInput'

function BookMultiSelectorModal(props) {
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(show)
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [show, props.setBlockKeyboardShortcuts]);
  
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
     
       <Button onClick={handleShow} className="tune-meta-modal-btn" aria-label="Books" variant="primary" >
        <span className="tune-meta-modal-icon" >{props.tunebook.icons.book}</span>
        <Badge bg="secondary" className="tune-meta-modal-badge" >{props.value ? props.value.length : ''}</Badge>
      </Button>
     
      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Add Tune to Books</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <Button onClick={handleClose} variant="success" style={{float:'right', marginBottom:'0.3em'}}>OK</Button>
          <div>{Array.isArray(props.value) && props.value.map(function(selectedBook) {
              return <Button key={selectedBook} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectBook(selectedBook)}} >{props.tunebook.icons.closecircle}&nbsp;{selectedBook}</Button>
            })}</div>
            
          <VoiceFillInput
            layout="wrap"
            useFormControl={false}
            type="search"
            value={filter}
            onChange={filterChange}
            onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}}
            onBlur={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)}}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
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
