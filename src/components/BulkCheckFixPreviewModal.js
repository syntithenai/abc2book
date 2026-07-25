import { useMemo, useState } from 'react'
import { Badge, Button, Modal, Table } from 'react-bootstrap'
import { NotationPreview } from './SuggestionPreviewDialog'
import {
  buildAbcRecordDiffRows,
  buildPreviewDiffSummary,
  splitLineDiffHighlight,
} from '../abcRecordDiffDisplay'

function HighlightedLine(props) {
  const parts = props.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return <span className="text-muted">—</span>
  }
  return (
    <code className="bulk-check-fix-diff-code">
      {parts.map(function(part, index) {
        if (!part || typeof part === 'string') {
          return <span key={index}>{part}</span>
        }
        if (part.changed) {
          return <mark key={index} className="bulk-check-fix-diff-mark">{part.text}</mark>
        }
        return <span key={index}>{part.text}</span>
      })}
    </code>
  )
}

function DiffValueCell(props) {
  const row = props.row
  const side = props.side
  if (row.type === 'added' && side === 'before') {
    return <span className="text-muted">—</span>
  }
  if (row.type === 'removed' && side === 'after') {
    return <span className="text-muted">—</span>
  }
  if (row.type === 'changed' && row.highlight) {
    return (
      <HighlightedLine parts={side === 'before' ? row.highlight.before : row.highlight.after} />
    )
  }
  const text = side === 'before'
    ? (row.existing || '')
    : (row.transcribed || '')
  if (!text) return <span className="text-muted">—</span>
  const highlight = splitLineDiffHighlight(
    side === 'before' ? text : '',
    side === 'after' ? text : ''
  )
  const parts = side === 'before' ? highlight.before : highlight.after
  return <HighlightedLine parts={parts} />
}

function changeVariant(type) {
  if (type === 'added') return 'success'
  if (type === 'removed') return 'danger'
  return 'warning'
}

function DifferencesBlock(props) {
  const [open, setOpen] = useState(true)
  const fieldDiffs = Array.isArray(props.fieldDiffs) ? props.fieldDiffs : []
  const abcRows = useMemo(function() {
    return buildAbcRecordDiffRows(props.beforeAbc, props.afterAbc)
  }, [props.beforeAbc, props.afterAbc])
  const summary = buildPreviewDiffSummary(fieldDiffs, abcRows)
  const hasDiffs = fieldDiffs.length > 0 || abcRows.length > 0

  if (!hasDiffs) return null

  return (
    <div className="bulk-check-fix-differences">
      <button
        type="button"
        className="bulk-check-fix-differences-toggle"
        aria-expanded={open}
        onClick={function() { setOpen(function(value) { return !value }) }}
      >
        <span className="bulk-check-fix-differences-title">Differences</span>
        <span className="bulk-check-fix-differences-summary">{summary}</span>
        <span className="bulk-check-fix-differences-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="bulk-check-fix-differences-panel">
          <p className="bulk-check-fix-differences-help text-muted">
            Compare what will change in tune fields and the ABC record before you apply this fix.
            Highlighted text shows the exact characters that differ.
          </p>

          {fieldDiffs.length > 0 ? (
            <div className="bulk-check-fix-differences-section">
              <h6 className="bulk-check-fix-differences-section-title">Tune fields</h6>
              <Table bordered size="sm" responsive className="bulk-check-fix-differences-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldDiffs.map(function(diff) {
                    return (
                      <tr key={diff.field} className="table-warning">
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

          {abcRows.length > 0 ? (
            <div className="bulk-check-fix-differences-section">
              <h6 className="bulk-check-fix-differences-section-title">ABC record lines</h6>
              <Table bordered size="sm" responsive className="bulk-check-fix-differences-table">
                <thead>
                  <tr>
                    <th style={{ width: '18%' }}>What</th>
                    <th style={{ width: '10%' }}>Change</th>
                    <th style={{ width: '36%' }}>Before</th>
                    <th style={{ width: '36%' }}>After</th>
                  </tr>
                </thead>
                <tbody>
                  {abcRows.map(function(row) {
                    return (
                      <tr key={row.id} className={'table-' + changeVariant(row.type)}>
                        <td>{row.label}</td>
                        <td>
                          <Badge bg={changeVariant(row.type)} className="bulk-check-fix-diff-badge">
                            {row.changeLabel}
                          </Badge>
                        </td>
                        <td className="bulk-check-fix-diff-value">
                          <DiffValueCell row={row} side="before" />
                        </td>
                        <td className="bulk-check-fix-diff-value">
                          <DiffValueCell row={row} side="after" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

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
  const beforeAbc = abcDiff ? abcDiff.before : (preview ? preview.before : '')
  const afterAbc = abcDiff ? abcDiff.after : (preview ? preview.after : '')
  const showNotation = !!(beforeAbc || afterAbc)

  return (
    <Modal
      show={props.show}
      onHide={handleClose}
      fullscreen
      scrollable
      className="bulk-check-fix-preview-modal"
      contentClassName="bulk-check-fix-preview-modal-content"
    >
      <Modal.Header closeButton>
        <Modal.Title>{actionLabel}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bulk-check-fix-preview-body">
        <div className="bulk-check-fix-preview-actions">
          <Button variant="secondary" onClick={handleClose} disabled={confirmed}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={confirmed || !preview}>
            Apply fix
          </Button>
        </div>

        {showNotation ? (
          <DifferencesBlock
            fieldDiffs={scalarDiffs}
            beforeAbc={beforeAbc}
            afterAbc={afterAbc}
          />
        ) : null}

        {showNotation ? (
          <div className="bulk-check-fix-preview-notation-grid">
            <div className="bulk-check-fix-preview-pane">
              <h6>Before</h6>
              <NotationPreview abc={beforeAbc} maxHeight={null} />
            </div>
            <div className="bulk-check-fix-preview-pane">
              <h6>After</h6>
              <NotationPreview abc={afterAbc} maxHeight={null} />
            </div>
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
