import { Modal, Button, ButtonGroup } from 'react-bootstrap'

export default function QueuePlayConfirmModal(props) {
  const request = props.request
  if (!request) return null

  function handleClose() {
    if (props.onCancel) props.onCancel()
  }

  return (
    <Modal show={true} onHide={handleClose} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title>Playlist is playing</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ marginBottom: 0 }}>
          A playlist is already playing. What would you like to do with
          {request.tuneName ? ' "' + request.tuneName + '"' : ' this tune'}?
        </p>
      </Modal.Body>
      <Modal.Footer>
        <ButtonGroup>
          <Button variant="primary" onClick={function() { if (props.onReplace) props.onReplace() }}>
            Replace queue
          </Button>
          <Button variant="secondary" onClick={function() { if (props.onPreviewOnce) props.onPreviewOnce() }}>
            Play once
          </Button>
          <Button variant="outline-secondary" onClick={handleClose}>
            Cancel
          </Button>
        </ButtonGroup>
      </Modal.Footer>
    </Modal>
  )
}
