import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import ImagesEditor from './ImagesEditor'

export default function ImagesEditorModal({tunebook, tune, login, logout, token}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
 
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  
  return (
    <>
      <Button onClick={handleShow}>
        {tunebook.icons.camera}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{"Image Editor"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
                 <ImagesEditor logout={logout} login={login} token={token} tunebook={tunebook} tune={tune} />
        </Modal.Body>
      </Modal>
   </>
  );
}
//setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} 
