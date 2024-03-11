import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import ImagesManager from './ImagesManager'

export default function ImagesManagerModal({tunebook, tune, login, logout, token, fileManager}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
 
  const handleClose = () => {
	  setShow(false);
	  fileManager.setWarning('');
	}
  const handleShow = () => setShow(true);
  
  
  return (
    <>
      <Button variant='success'  onClick={handleShow} style={{position:'relative', width:'2.6em', height:'2.4em', marginLeft:'0.2em'}} >
        <span style={{position:'absolute', top:'1px', left:'1.2em', opacity: 0.9, fontSize:'0.5em'}} >{tunebook.icons.camera}</span>
        {(fileManager && fileManager.filtered ) && <Badge bg="secondary"  style={{position:'absolute', top:'26px', left:'1.6em',  fontSize:'0.5em'}}>{fileManager.filtered.length}</Badge>}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
        </Modal.Header>
        <Modal.Body>
            <ImagesManager handleClose={handleClose} logout={logout} login={login} token={token} tunebook={tunebook} tune={tune}  fileManager={fileManager} previewAsLink={true} />
        </Modal.Body>
      </Modal>
   </>
  );
}
   //<Modal.Title>{"Files Editor"}</Modal.Title>
       
//setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} 
