import { Button, Modal } from 'react-bootstrap'
import ScratchpadAudioEditorHelp from './ScratchpadAudioEditorHelp'

export default function ScratchpadAudioEditorHelpModal(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} fullscreen scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Scratchpad audio editor guide</Modal.Title>
      </Modal.Header>
      <Modal.Body className="scratchpad-audio-editor-help-modal-body">
        <ScratchpadAudioEditorHelp />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
