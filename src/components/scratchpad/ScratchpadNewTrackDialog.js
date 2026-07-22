import { useState } from 'react'
import { Button, Modal, Form } from 'react-bootstrap'
import { createDefaultAudioTrack, createDefaultMidiTrack } from '../../scratchpadAudioProject'

export default function ScratchpadNewTrackDialog(props) {
  const [show, setShow] = useState(false)
  const icons = props.icons || {}

  function handleClose() {
    setShow(false)
  }

  function addAudioTrack() {
    if (props.onAddTrack) {
      props.onAddTrack(createDefaultAudioTrack(props.itemId, 'Track ' + ((props.trackCount || 0) + 1)))
    }
    handleClose()
  }

  function addMidiTrack() {
    if (props.onAddTrack) {
      props.onAddTrack(createDefaultMidiTrack(props.itemId, 'MIDI ' + ((props.trackCount || 0) + 1)))
    }
    handleClose()
  }

  function fileSelected(event) {
    const file = event.target.files && event.target.files[0]
    if (file && props.ee) {
      props.ee.emit('newtrack', file)
      if (props.onImport) props.onImport(file)
    }
    handleClose()
  }

  return (
    <>
      <Button size="sm" variant="success" onClick={function() { setShow(true) }} title="Add track">
        {icons.plus || '+'} Track
      </Button>
      <Modal show={show} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>New track</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button variant="primary" onClick={addAudioTrack}>Audio track</Button>
            <Button variant="info" onClick={addMidiTrack}>MIDI lane</Button>
            <Button
              variant="danger"
              onClick={function() {
                if (props.ee) props.ee.emit('record')
                handleClose()
              }}
            >
              {icons.recordcircle || 'Record'}
            </Button>
          </div>
          <Form.Group>
            <Form.Label>Import audio file</Form.Label>
            <Form.Control type="file" accept="audio/*" onChange={fileSelected} />
          </Form.Group>
        </Modal.Body>
      </Modal>
    </>
  )
}
