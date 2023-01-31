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
    
     const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        var v = imageIsHidden
        v[key] = true
        setImageIsHidden(v)
        
    }
    
    var sortedOptions = Object.keys(options)
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  return (
    <>
      <span onClick={handleShow} >{props.triggerElement}</span>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title style={{width:'100%'}}>{props.title}
          
          <Button style={{float:'right'}} variant="danger" onClick={function() {props.onChange(''); handleClose()}} >Clear</Button>
          </Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <input type='search'  onFocus={function() {props.setBlockKeyboardShortcuts(true)}} onBlur={function() {props.setBlockKeyboardShortcuts(false)}}  value={filter} onChange={function(e) {filterChange(e.target.value)}}   />
          {(props.allowNew !== false)  && <Button key="newbook" onClick={function() {newBook(filter); handleClose()}}  >New Book</Button>}
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  style={{fontSize:'1.5em'}} key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); filterChange(''); handleClose()}} >{!imageIsHidden[tk] && <img style={{height:'50px'}} src={"/book_images/"+options[option].replaceAll(" ","")+".jpeg"} onError={function() {hideImage(tk)}} />} {options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookSelectorModal
