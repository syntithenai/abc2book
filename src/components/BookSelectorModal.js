import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'

function BookSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
    filterChange('')
  }
  
  var filterChangeTimeout = null
  function filterChange(value) {
    setFilter(value.toLowerCase())
    if (value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(value))
      },500)
    }
  } 
  
    function newBook(filter) {
        if(filter && filter.trim()) {
          //console.log(props.tunebook)
            props.tunebook.indexes.addBookToIndex(filter); 
            props.onChange(filter); 
            setFilter('')
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
          <input type='search' value={filter} onChange={function(e) {filterChange(e.target.value)}}   />
          {(props.allowNew !== false)  && <Button key="newbook" onClick={function() {newBook(filter); handleClose()}}  >New Book</Button>}
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); filterChange(''); handleClose()}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookSelectorModal
