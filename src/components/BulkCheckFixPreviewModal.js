import { useState } from 'react'
import { Button, Modal } from 'react-bootstrap'

export default function BulkCheckFixPreviewModal(props) {
  const [confirmed, setConfirmed] = useState(false)

  function handleClose() {
    setConfirmed(false)
    if (props.onHide) props.onHide()
  }

  function handleConfirm() {
    setConfirmed(true)
    if (props.onConfirm) props.onConfirm()
    handleClose()
  }

  const preview = props.preview || null
  const actionLabel = props.actionLabel || 'Apply fix'

  return (
    <Modal show={props.show} onHide={handleClose} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{actionLabel}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {props.warning ? (
          <p className="text-warning">{props.warning}</p>
        ) : null}
        <p className="text-muted">Review the ABC changes before applying. You can undo from tune history.</p>
        <div className="bulk-check-fix-preview">
          <div className="bulk-check-fix-preview-pane">
            <h6>Before</h6>
            <pre className="bulk-check-fix-preview-abc">{preview ? preview.before : ''}</pre>
          </div>
          <div className="bulk-check-fix-preview-pane">
            <h6>After</h6>
            <pre className="bulk-check-fix-preview-abc">{preview ? preview.after : ''}</pre>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={confirmed}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={confirmed || !preview}>
          Apply fix
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
