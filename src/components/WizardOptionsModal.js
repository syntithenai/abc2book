import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function WizardOptionsModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  
  function saveNotes(noteVals) {
    var tune = props.tune
    tune.notes = noteVals.split("\n")
    props.tunebook.saveTune(tune); 
    console.log('saved',tune.notes)
    
    handleClose()
  }

  return (
    <>
      <Button  variant="warning" onClick={handleShow}>
        {props.tunebook.icons.wizard}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Wizards</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.fixNotesBang(props.abc))}}>
              Auto Fix
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.multiplyAbcTiming(0.5,props.abc))}}>
              Halve Note Lengths
            </Button>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.multiplyAbcTiming(2,props.abc))}} >
              Double Note Lengths
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.fixNotes(props.abc,4)) }}>
              4 Bar Layout
            </Button>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.fixNotes(props.abc,6)) }}>
              6 Bar Layout
            </Button>
            <Button variant="primary" onClick={function(e) {saveNotes(props.tunebook.abcTools.fixNotes(props.abc,8))} }>
              8 Bar Layout
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default WizardOptionsModal
