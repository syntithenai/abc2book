import { useEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'

export default function ScratchpadCopyModal(props) {
  const [title, setTitle] = useState('')
  const inputRef = useRef(null)

  useEffect(function() {
    if (!props.show) return
    const next = props.defaultTitle || ''
    setTitle(next)
    const t = setTimeout(function() {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      try {
        el.setSelectionRange(len, len)
      } catch (e) { /* ignore */ }
    }, 50)
    return function() { clearTimeout(t) }
  }, [props.show, props.defaultTitle])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = String(title || '').trim()
    if (!trimmed) return
    if (props.onConfirm) props.onConfirm(trimmed)
  }

  return (
    <Modal show={props.show} onHide={props.onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Duplicate item</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Title for the copy</Form.Label>
            <Form.Control
              ref={inputRef}
              value={title}
              onChange={function(e) { setTitle(e.target.value) }}
              placeholder="Title"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!String(title || '').trim()}>
            Duplicate
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
