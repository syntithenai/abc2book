import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'

function BookSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(e.target.value))
      },500)
    }
  } 
  
    function newBook(filter) {
        if(filter && filter.trim()) {
            props.tunebook.indexes.addBookToIndex(filter); 
            props.setCurrentTuneBook(filter); 
            props.forceRefresh()
        }
    }
  
  return (
    <>
      <span onClick={handleShow} >{props.triggerElement}</span>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{props.title}</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <input type='search' value={filter} onChange={filterChange}  autoFocus />
          <Button key="newbook" onClick={function() {newBook(filter); handleClose()}}  >New Book</Button>
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); handleClose()}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookSelectorModal
