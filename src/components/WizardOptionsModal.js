import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'

function WizardOptionsModal(props) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  function applyToNotes(applyFunction) {
     var tune = props.tune
     if (tune && tune.voices) {
       Object.keys(tune.voices).forEach(function(voiceKey) {
         var voiceNotes = tune.voices[voiceKey].notes
         if (!Array.isArray(voiceNotes)) {
           voiceNotes = voiceNotes ? [String(voiceNotes)] : ['']
         }
         var hasTailingBar = false
         voiceNotes.forEach(function(noteLine) {
           if (noteLine.trim()) {
              if (noteLine.trim().endsWith("|")) {
                hasTailingBar = true
              } else {
                hasTailingBar = false
              }
           }
         })
         var newNotes = applyFunction("X:8\nK:G\n"+voiceNotes.join("\n")+(hasTailingBar ? "|" : ''))
         tune.voices[voiceKey].notes = newNotes.split('\n')
       })
       props.tunebook.saveTune(tune)
       if (props.forceRefresh) props.forceRefresh()
     }
  }

  return (
    <>
      {props.triggerOnly ? null : (
        <Button variant="warning" onClick={handleShow}>
          {props.tunebook.icons.wizard}
        </Button>
      )}

      <Modal show={props.show != null ? props.show : show} onHide={props.onHide || handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Wizards</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center' }}>
            <Button variant="primary" onClick={function() {
                applyToNotes(function(v) { 
                  return props.tunebook.abcTools.fixNotesBang(v)
                }) }}>
              Auto Fix
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function() {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.multiplyAbcTiming(0.5,v)
                }) }}>
              Halve Note Lengths
            </Button>
            <Button variant="primary" onClick={function() {
              applyToNotes(function(v) { 
                  return props.tunebook.abcTools.multiplyAbcTiming(2,v)
                }) }} >
              Double Note Lengths
            </Button>
          </div>
          
          <br/>
          <div>
            <Button variant="primary" onClick={function() {
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
    </>
  );
}
export default WizardOptionsModal
