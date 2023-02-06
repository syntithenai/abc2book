import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'

export default function ViewModeSelectorModal(props) {
  const [show, setShow] = useState(false);
  const handleClose = () => {
    setShow(false);
    if (props.closeParent) props.closeParent()
  }
  const handleShow = () => setShow(true);
  
  return (
    <>
      <Button onClick={handleShow} variant="secondary" >{props.tunebook.icons.eye}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>View Mode</Modal.Title>
          
        </Modal.Header>
        
        <Modal.Body>
            <Button onClick={function() {props.onChange('music'); handleClose()}} >{props.tunebook.icons.music} Music Notation</Button>
            <Button style={{marginLeft:'0.3em'}}  onClick={function() {props.onChange('chords'); handleClose()}}>{props.tunebook.icons.guitar} Lyrics and Chords</Button>
        </Modal.Body>
        
      </Modal>
    </>
  );
}

