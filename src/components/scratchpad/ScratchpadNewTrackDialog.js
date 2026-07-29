import { useState } from 'react'
import { Button, Modal, Form } from 'react-bootstrap'
import { createDefaultAudioTrack, createDefaultMidiTrack } from '../../scratchpadAudioProject'

export default function ScratchpadNewTrackDialog(props) {
  const [show, setShow] = useState(false)
  const icons = props.icons || {}
  const advancedFeatures = !!props.advancedFeatures

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

  function startRecordTrack() {
    const track = createDefaultAudioTrack(props.itemId, 'Track ' + ((props.trackCount || 0) + 1))
    handleClose()
    if (props.onAddTrackAndRecord) {
      props.onAddTrackAndRecord(track)
    } else if (props.onAddTrack) {
      props.onAddTrack(track)
      if (props.onRecord) props.onRecord()
    }
  }

  function fileSelected(event) {
    const file = event.target.files && event.target.files[0]
    if (file && props.onImportFile) {
      props.onImportFile(file)
    }
    event.target.value = ''
    handleClose()
  }

  return (
    <>
      <Button
        size="sm"
        variant={props.iconOnly ? 'outline-secondary' : 'success'}
        onClick={function() { setShow(true) }}
        title="Add track"
      >
        {props.iconOnly ? (icons.plus || '+') : ((icons.plus ? icons.plus + ' ' : '+ ') + 'Track')}
      </Button>
      <Modal show={show} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>New track</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button variant="primary" onClick={addAudioTrack}>Audio track</Button>
            {advancedFeatures ? (
              <Button variant="info" onClick={addMidiTrack}>MIDI lane</Button>
            ) : null}
            <Button variant="danger" onClick={startRecordTrack}>
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
