import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'


export default function LinksEditorModal({tunebook, tune, setBlockKeyboardShortcuts}) {
  const [show, setShow] = useState(false);
 
  const handleClose = () => {
      setShow(false);
      
  }
  const handleShow = () => {
      setShow(true);
  }
  
  //useEffect(function() {
    ////if (setBlockKeyboardShortcuts) 
    //setBlockKeyboardShortcuts(true)
  //}, [])

  return (
    <>
      <Button variant="danger"   onClick={function() {
          handleShow()
        }}>{tunebook.icons.dropdown}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Links</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <LinksEditor tunebook={tunebook} tune={tune} setBlockKeyboardShortcuts={setBlockKeyboardShortcuts} handleClose={handleClose} />
        </Modal.Body>
      </Modal>
    </>
  );
}
