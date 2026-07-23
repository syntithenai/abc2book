import { useState } from 'react'
import { Button, Modal, Table } from 'react-bootstrap'

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
  const fieldDiffs = Array.isArray(props.fieldDiffs) ? props.fieldDiffs : []
  const abcDiff = fieldDiffs.find(function(item) { return item.field === 'abc' })
  const scalarDiffs = fieldDiffs.filter(function(item) { return item.field !== 'abc' })

  return (
    <Modal show={props.show} onHide={handleClose} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{actionLabel}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {props.warning ? (
          <p className="text-warning">{props.warning}</p>
        ) : null}
        <p className="text-muted">Review the changes before applying. You can undo from tune history.</p>

        {typeof props.onOpenTune === 'function' && props.tuneId ? (
          <div className="bulk-check-fix-preview-toolbar">
            <Button variant="outline-primary" size="sm" onClick={function() { props.onOpenTune(props.tuneId) }}>
              Open tune
            </Button>
          </div>
        ) : null}

        {scalarDiffs.length > 0 ? (
          <div className="bulk-check-fix-preview-fields">
            <h6>Changed fields</h6>
            <Table bordered size="sm" className="bulk-check-fix-preview-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {scalarDiffs.map(function(diff) {
                  return (
                    <tr key={diff.field}>
                      <td>{diff.label}</td>
                      <td className="bulk-check-fix-preview-cell">{diff.before || '—'}</td>
                      <td className="bulk-check-fix-preview-cell">{diff.after || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        ) : null}

        {abcDiff || (preview && preview.before !== preview.after) ? (
          <div className="bulk-check-fix-preview">
            <div className="bulk-check-fix-preview-pane">
              <h6>Before</h6>
              <pre className="bulk-check-fix-preview-abc">{abcDiff ? abcDiff.before : (preview ? preview.before : '')}</pre>
            </div>
            <div className="bulk-check-fix-preview-pane">
              <h6>After</h6>
              <pre className="bulk-check-fix-preview-abc">{abcDiff ? abcDiff.after : (preview ? preview.after : '')}</pre>
            </div>
          </div>
        ) : null}
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
