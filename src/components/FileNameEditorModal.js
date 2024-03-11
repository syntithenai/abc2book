import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import ImagesManager from './ImagesManager'

export default function FileNameEditorModal({tunebook, initvalue, onChange}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
  const [value, setValue] = useState(initvalue ? initvalue : '')
 
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  
  return (
    <>
      <Button variant='warning'  onClick={handleShow} style={{ marginRight:'1em'}} >
        <span >{tunebook.icons.pencil}</span>
      </Button>
		
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
        <Modal.Title>{"Edit Filename"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
			<input type="text" value={value} onChange={function(e) {setValue(e.target.value)}} />
        </Modal.Body>
        <Modal.Footer>
			<Button style={{marginRight:'3em'}} onClick={function() {handleClose(); onChange(value) }} variant="success" >Save</Button>
			<Button onClick={handleClose} variant="danger" >Cancel</Button>
        </Modal.Footer>
      </Modal>
   </>
  );
}
   //
       
//setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} forceRefresh={props.forceRefresh} 
