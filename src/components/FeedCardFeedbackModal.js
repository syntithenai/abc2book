import { useEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { getFeedFeedbackEntry, upsertFeedFeedback } from '../feedFeedbackStore'

const AUTOSAVE_MS = 400

export default function FeedCardFeedbackModal(props) {
  const item = props.item || {}
  const show = !!props.show
  const [text, setText] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const timerRef = useRef(null)

  useEffect(function() {
    if (!show || !item.id) return
    const existing = getFeedFeedbackEntry(item.id)
    setText(existing && existing.feedback ? existing.feedback : '')
    setSavedAt(existing && existing.updatedAt ? existing.updatedAt : null)
  }, [show, item.id, props.feedbackSyncKey])

  function notifyChanged() {
    if (typeof props.onChanged === 'function') props.onChanged()
  }

  useEffect(function() {
    if (!show || !item.id) return undefined
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(function() {
      const entry = upsertFeedFeedback(item, text)
      if (entry && entry.updatedAt) setSavedAt(entry.updatedAt)
      notifyChanged()
    }, AUTOSAVE_MS)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show, item, text])

  function handleHide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    upsertFeedFeedback(item, text)
    notifyChanged()
    if (typeof props.onHide === 'function') props.onHide()
  }

  return (
    <Modal show={show} onHide={handleHide} centered data-testid="feed-feedback-modal">
      <Modal.Header closeButton>
        <Modal.Title>Card feedback</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="feed-feedback-modal-headline">{item.headline}</p>
        <Form.Group>
          <Form.Label htmlFor={'feed-feedback-text-' + item.id}>Notes</Form.Label>
          <Form.Control
            id={'feed-feedback-text-' + item.id}
            as="textarea"
            rows={5}
            value={text}
            onChange={function(e) { setText(e.target.value) }}
            data-testid="feed-feedback-text"
            placeholder="What works, what is confusing, or what to fix…"
          />
        </Form.Group>
        {savedAt ? (
          <p className="feed-feedback-modal-saved" data-testid="feed-feedback-saved">
            Autosaved
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={handleHide} data-testid="feed-feedback-done">
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
