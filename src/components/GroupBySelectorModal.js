import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'

function GroupBySelectorModal(props) {
  const [show, setShow] = useState(false);
  const options = {boost:'confidence', key: 'key',tuning: 'tuning', meter:'meter',  rhythm:'rhythm',composer:'composer', books: 'books', tags: 'tags'} //, tags: 'tags'}
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
  }
  return (
    <> 
      <Button  style={{color:'black', fontWeight:'bold'}} onClick={handleShow} >{props.tunebook.icons.stack} {props.value&& options[props.value] ? options[props.value] : ''}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Group By</Modal.Title>
          
        </Modal.Header>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
          
            <ListGroup.Item  style={{fontSize:'1.5em'}} key={'first'} className='odd'  onClick={function(e) {props.onChange(''); handleClose()}} >No Grouping</ListGroup.Item>
            <>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  style={{fontSize:'1.5em', border: (props.value && props.value == options[option]) ? '2px solid black' : '' }} key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); handleClose()}} > {options[option]} </ListGroup.Item>
            })}
            </>
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default GroupBySelectorModal
