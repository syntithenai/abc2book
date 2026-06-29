import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import MediaImportWizard from './MediaImportWizard'
import MediaImportEntryButton from './MediaImportEntryButton'

function WizardOptionsModal(props) {
  const [show, setShow] = useState(false);
  const [showMediaWizard, setShowMediaWizard] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  function openMediaWizard() {
    setShow(false);
    setShowMediaWizard(true);
  }
  
  //function saveNotes(noteVals) {
    //var tune = props.tune
    //tune.notes = noteVals.split("\n")
    //props.tunebook.saveTune(tune); 
    //console.log('saved',tune.notes)
    //handleClose()
  //}
  
  function applyToNotes(applyFunction) {
     var tune = props.tune
     if (tune && tune.voices) {
       //console.log('applyVVVV',tune.voices)
       
       Object.keys(tune.voices).map(function(voice) {
         var hasTailingBar = false
         if (voice.notes) voice.notes.forEach(function(noteLine) {
           if (noteLine.trim()) {
              if (noteLine.trim().endsWith("|")) {
                hasTailingBar = true
              } else {
                hasTailingBar = false
              }
           }
         })
         var newNotes = applyFunction("X:8\nK:G\n"+tune.voices[voice].notes.join("\n")+(hasTailingBar ? "|" : ''))
         //console.log('apply',tune.voices[voice].notes, newNotes)
         tune.voices[voice].notes = newNotes.split('\n')
       })
       props.tunebook.saveTune(tune)
     }
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center' }}>
            {/* Temporarily hidden until transcription accuracy improves. Re-enable by
                restoring <MediaImportEntryButton tune={props.tune} onOpen={openMediaWizard} /> */}
            {false && <MediaImportEntryButton tune={props.tune} onOpen={openMediaWizard} />}
            <Button variant="primary" onClick={function(e) {
                applyToNotes(function(v) { 
                  return props.tunebook.abcTools.fixNotesBang(v)
                }) }}>
              Auto Fix
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function(e) {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.multiplyAbcTiming(0.5,v)
                }) }}>
              Halve Note Lengths
            </Button>
            <Button variant="primary" onClick={function(e) {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.multiplyAbcTiming(2,v)
                }) }} >
              Double Note Lengths
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function(e) {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.fixNotes(v,4)
                }) }} >
              4 Bar Layout
            </Button>
            <Button variant="primary" onClick={function(e) {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.fixNotes(v,6)
                }) }} >
              6 Bar Layout
            </Button>
            <Button variant="primary" onClick={function(e) {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.fixNotes(v,8)
                }) }} >
              8 Bar Layout
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <MediaImportWizard
        show={showMediaWizard}
        onClose={function() { setShowMediaWizard(false); }}
        tune={props.tune}
        tunebook={props.tunebook}
        abc={props.abc}
        forceRefresh={props.forceRefresh}
      />
    </>
  );
}
export default WizardOptionsModal
