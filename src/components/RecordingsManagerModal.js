import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import RecordingsManager from './RecordingsManager'
import RepeatsEditorModal from './RepeatsEditorModal'
export default function RecordingsManagerModal({tunebook, tune, login, logout, token, fileManager}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
 
  const handleClose = () => {
	  setShow(false);
	  fileManager.setWarning('');
	}
  const handleShow = () => setShow(true);
  
  
  return (
    <>
      <Button variant="danger" onClick={handleShow} style={{marginLeft:'0.2em',position:'relative', width:'2.6em', height:'2.4em'}} >
        <span style={{position:'absolute', top:'2px', left:'1.2em', opacity: 0.9, fontSize:'0.5em'}} >{tunebook.icons.recordcircle}</span>
        {<Badge bg="secondary"  style={{position:'absolute', top:'28px', left:'1.6em',  fontSize:'0.5em'}}>{(fileManager && fileManager.filtered ) ? fileManager.filtered.length : 0}</Badge>}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
        </Modal.Header>
        <Modal.Body>
                 <RecordingsManager handleClose={handleClose} logout={logout} login={login} token={token} tunebook={tunebook} tune={tune} fileManager={fileManager}  previewAsLink={true} />
        </Modal.Body>
      </Modal>
   </>
  );
}
//setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} 
