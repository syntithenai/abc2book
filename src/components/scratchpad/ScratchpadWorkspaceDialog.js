import { useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'

export default function ScratchpadWorkspaceDialog(props) {
  const [name, setName] = useState('')

  function handleShow() {
    setName('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = String(name || '').trim()
    if (!trimmed) return
    if (props.onCreate) props.onCreate(trimmed)
    setName('')
    if (props.onHide) props.onHide()
  }

  return (
    <Modal show={!!props.show} onHide={props.onHide} onShow={handleShow} centered>
      <Modal.Header closeButton>
        <Modal.Title>New workspace</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Workspace name</Form.Label>
            <Form.Control
              autoFocus
              value={name}
              onChange={function(e) { setName(e.target.value) }}
              placeholder="e.g. Gig prep"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!String(name || '').trim()}>
            Create
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
