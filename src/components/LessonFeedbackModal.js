import { useEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { LESSON_FEEDBACK_PRESETS } from '../lessonFeedbackPresets'
import { formatLessonFeedbackPosition } from '../lessonFeedbackUtils'
import { getLessonFeedbackEntry, upsertLessonFeedback } from '../lessonFeedbackStore'

const AUTOSAVE_MS = 400

export default function LessonFeedbackModal(props) {
  const draft = props.draft || {}
  const show = !!props.show
  const [presets, setPresets] = useState([])
  const [notes, setNotes] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const timerRef = useRef(null)

  useEffect(function() {
    if (!show || !draft.itemId) return
    const existing = getLessonFeedbackEntry(draft.itemId)
    setPresets(existing && Array.isArray(existing.presets) ? existing.presets.slice() : [])
    setNotes(existing && existing.notes ? existing.notes : '')
    setSavedAt(existing && existing.updatedAt ? existing.updatedAt : null)
  }, [show, draft.itemId, props.feedbackSyncKey])

  function notifyChanged() {
    if (typeof props.onChanged === 'function') props.onChanged()
  }

  function saveNow(nextPresets, nextNotes) {
    const entry = upsertLessonFeedback(Object.assign({}, draft, {
      presets: nextPresets,
      notes: nextNotes,
    }))
    if (entry && entry.updatedAt) setSavedAt(entry.updatedAt)
    notifyChanged()
    return entry
  }

  useEffect(function() {
    if (!show || !draft.itemId) return undefined
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(function() {
      saveNow(presets, notes)
    }, AUTOSAVE_MS)
    return function() {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [show, draft, presets, notes])

  function togglePreset(presetId) {
    setPresets(function(prev) {
      const next = prev.slice()
      const idx = next.indexOf(presetId)
      if (idx >= 0) next.splice(idx, 1)
      else next.push(presetId)
      return next
    })
  }

  function handleHide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    saveNow(presets, notes)
    if (typeof props.onHide === 'function') props.onHide()
  }

  const headline = draft.type === 'lesson_quiz'
    ? (draft.questionPrompt || draft.title || 'Quiz question')
    : (draft.sectionTitle || draft.title || 'Lesson content')

  return (
    <Modal show={show} onHide={handleHide} centered size="lg" data-testid="lesson-feedback-modal">
      <Modal.Header closeButton>
        <Modal.Title>Lesson feedback</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="lesson-feedback-modal-headline">{headline}</p>
        {draft.selectedText ? (
          <blockquote className="lesson-feedback-selected" data-testid="lesson-feedback-selected">
            {draft.selectedText}
          </blockquote>
        ) : null}
        {draft.position ? (
          <p className="lesson-feedback-position small text-muted" data-testid="lesson-feedback-position">
            {formatLessonFeedbackPosition(draft.position)}
          </p>
        ) : null}
        <div className="lesson-feedback-presets" data-testid="lesson-feedback-presets">
          {LESSON_FEEDBACK_PRESETS.map(function(preset) {
            const active = presets.indexOf(preset.id) >= 0
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={active ? 'primary' : 'outline-secondary'}
                className="lesson-feedback-preset"
                data-testid={'lesson-feedback-preset-' + preset.id}
                onClick={function() { togglePreset(preset.id) }}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
        <Form.Group className="mt-3">
          <Form.Label htmlFor={'lesson-feedback-notes-' + draft.itemId}>Notes</Form.Label>
          <Form.Control
            id={'lesson-feedback-notes-' + draft.itemId}
            as="textarea"
            rows={5}
            value={notes}
            onChange={function(e) { setNotes(e.target.value) }}
            data-testid="lesson-feedback-notes"
            placeholder="What to fix, sources to add, or why this block is not useful for generation…"
          />
        </Form.Group>
        {savedAt ? (
          <p className="lesson-feedback-modal-saved" data-testid="lesson-feedback-saved">
            Autosaved
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={handleHide} data-testid="lesson-feedback-done">
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
