import {useMemo, useRef, useState} from 'react'
import {Button, Modal, Form, Row, Col} from 'react-bootstrap'
import { FormLabelWithHelp } from './FormFieldHelp'
import { BULK_FIELD_HELP } from '../formFieldHelpText'
import TuneGenresField from './TuneGenresField'
import {
  BULK_EDIT_FIELDS,
  getBulkEditField,
  getBulkEditSelectOptions,
  isBulkChangeRowComplete,
  prepareBulkActions,
  prepareBulkChanges,
} from '../bulkEditFields'
import { applyBulkCacheAction } from '../bulkCacheActions'
import useMediaCacheQueue from '../useMediaCacheQueue'
import KeySignatureInput from './KeySignatureInput'
import VoiceFillInput from './VoiceFillInput'
import BulkOperationProgressModal from './BulkOperationProgressModal'
import useBulkOperationProgress from '../useBulkOperationProgress'
import { shouldShowBulkOperationProgress } from '../bulkOperationProgress'
import MediaCacheQueueModal, { useMediaCacheQueueModal } from './MediaCacheQueueModal'

var nextRowId = 1

function createEmptyRow() {
  return { id: 'bulk-row-' + (nextRowId++), field: '', value: '' }
}

function defaultValueForField(field) {
  if (!field) return ''
  if (field.type === 'genres') return []
  if (field.type === 'toggle') return 'true'
  return ''
}

function BulkFieldValueInput({fieldKey, value, onChange, tunebook, rowId, token, setBlockKeyboardShortcuts}) {
  var field = getBulkEditField(fieldKey)
  if (!field) {
    return (
      <Form.Control
        type="text"
        disabled
        placeholder="Choose a field first"
        value=""
        onChange={function() {}}
      />
    )
  }

  if (field.type === 'toggle') {
    var locked = value === true || value === 'true'
    return (
      <Form.Check
        type="switch"
        id={(rowId || 'bulk') + '-' + field.key}
        label={locked ? 'Locked' : 'Unlocked'}
        checked={locked}
        onChange={function(e) { onChange(e.target.checked ? 'true' : 'false') }}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <Form.Control
        type="number"
        min={field.min}
        max={field.max}
        placeholder={field.allowEmpty ? 'Leave blank to clear' : ''}
        value={value}
        onChange={function(e) { onChange(e.target.value) }}
      />
    )
  }

  if (field.type === 'select' || field.type === 'meter' || field.type === 'rhythm') {
    var options = getBulkEditSelectOptions(field, tunebook)
    return (
      <Form.Select value={value} onChange={function(e) { onChange(e.target.value) }}>
        {field.allowEmpty ? <option value="">(clear)</option> : <option value="">Choose…</option>}
        {options.map(function(option) {
          return <option key={option.value || option.label} value={option.value}>{option.label}</option>
        })}
      </Form.Select>
    )
  }

  if (field.type === 'genres') {
    return (
      <TuneGenresField
        label=""
        className="mb-0"
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'key') {
    return (
      <KeySignatureInput
        value={value}
        onChange={onChange}
        isClearable={field.allowEmpty}
        placeholder={field.allowEmpty ? 'Leave blank to clear' : ''}
      />
    )
  }

  return (
    <VoiceFillInput
      type="text"
      placeholder={field.allowEmpty ? 'Leave blank to clear' : ''}
      value={value}
      onChange={function(e) { onChange(e.target.value) }}
      fieldKind="search"
      token={token}
      setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
    />
  )
}

export default function BulkChangeValueModal({tunebook, selected, onClose, forceRefresh, token}) {
  const [show, setShow] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rows, setRows] = useState([createEmptyRow()])
  const listRef = useRef(null)
  const mediaCacheQueue = useMediaCacheQueue()
  const bulkProgress = useBulkOperationProgress()
  const mediaCacheQueueModal = useMediaCacheQueueModal()

  const selectedCount = Object.keys(selected).filter(function(item) {
    return (selected[item] ? true : false)
  }).length

  const preparedChanges = useMemo(function() {
    return prepareBulkChanges(rows)
  }, [rows])

  const preparedActions = useMemo(function() {
    return prepareBulkActions(rows)
  }, [rows])

  const canApply = preparedChanges.length > 0 || preparedActions.length > 0

  function resetForm() {
    setRows([createEmptyRow()])
  }

  const handleClose = function() {
    setShow(false)
    resetForm()
    if (onClose) onClose()
  }

  const handleShow = function() {
    resetForm()
    setShow(true)
  }

  function updateRow(rowId, updates) {
    setRows(function(prev) {
      return prev.map(function(row) {
        if (row.id !== rowId) return row
        var next = Object.assign({}, row, updates)
        if (updates.field !== undefined && updates.field !== row.field) {
          next.value = defaultValueForField(getBulkEditField(updates.field))
        }
        return next
      })
    })
  }

  function addRow() {
    setRows(function(prev) {
      return prev.concat([createEmptyRow()])
    })
    setTimeout(function() {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }, 0)
  }

  function removeRow(rowId) {
    setRows(function(prev) {
      if (prev.length <= 1) {
        return [createEmptyRow()]
      }
      return prev.filter(function(row) { return row.id !== rowId })
    })
  }

  function selectedTuneIds() {
    return Object.keys(selected).filter(function(item) {
      return selected[item] ? true : false
    })
  }

  async function apply() {
    var changes = prepareBulkChanges(rows)
    var actions = prepareBulkActions(rows)
    if (!changes.length && !actions.length) return

    var currentSelection = selectedTuneIds()
    var tunes = tunebook.fromSelection(selected)
    setApplying(true)

    try {
      if (changes.length) {
        const deferOpts = { deferSave: true }
        if (shouldShowBulkOperationProgress(currentSelection.length)) {
          await bulkProgress.runTunebook({
            tunebook: tunebook,
            items: currentSelection,
            title: 'Applying bulk update',
            messageForIndex: function(current, total) {
              return 'Updating tune ' + current + ' of ' + total
            },
            processChunk: function(chunk) {
              tunebook.bulkChangeTunes(chunk, changes, null, deferOpts)
            },
          })
        } else {
          tunebook.bulkChangeTunes(currentSelection, changes)
        }
      }

      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i]
        if (action.key === 'cache') {
          await applyBulkCacheAction({
            action: action.value,
            tunes: tunes,
            tuneIds: currentSelection,
            tunebook: tunebook,
            token: token,
            mediaCacheQueue: mediaCacheQueue,
            bulkProgress: bulkProgress,
            onOpenMediaCacheQueue: mediaCacheQueueModal.openQueueModal,
          })
        }
      }

      forceRefresh()
      handleClose()
    } finally {
      setApplying(false)
    }
  }

  function fieldsUsedExcept(rowId) {
    var used = {}
    rows.forEach(function(row) {
      if (row.id !== rowId && row.field) used[row.field] = true
    })
    return used
  }

  var applyCount = preparedChanges.length + preparedActions.length

  return (
    <>
      <BulkOperationProgressModal
        show={bulkProgress.show}
        title={bulkProgress.title}
        progress={bulkProgress.progress}
      />
      <MediaCacheQueueModal
        show={mediaCacheQueueModal.show}
        onHide={mediaCacheQueueModal.closeQueueModal}
        tunebook={tunebook}
        title="Media download queue"
      />
      <Button
        className="bulk-ops-action-btn"
        variant="warning"
        aria-label="Bulk Update"
        title="Bulk Update"
        onClick={handleShow}
      >
        {tunebook.icons.pencil}
        <span className="bulk-ops-btn-label"> Bulk Update</span>
      </Button>

      <Modal show={show} onHide={handleClose} size="lg" dialogClassName="bulk-change-modal">
        <Modal.Header closeButton>
          <Modal.Title>Bulk Update</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Text className="bulk-change-intro">
            Apply one or more field changes to {selectedCount} selected tune{selectedCount === 1 ? '' : 's'} in a single step.
          </Form.Text>

          <FormLabelWithHelp
            label="Changes to apply"
            helpBody={BULK_FIELD_HELP.changesToApply.body}
            helpTitle={BULK_FIELD_HELP.changesToApply.title}
          />

          <div className="bulk-change-rows" ref={listRef}>
            {rows.map(function(row, index) {
              var usedFields = fieldsUsedExcept(row.id)
              return (
                <div className="bulk-change-row" key={row.id}>
                  <Row className="g-2 align-items-end">
                    <Col xs={12} md={5}>
                      {index === 0 ? <Form.Label className="bulk-change-row-label">Field</Form.Label> : null}
                      <Form.Select
                        value={row.field}
                        onChange={function(e) { updateRow(row.id, { field: e.target.value }) }}
                      >
                        <option value="">Choose field…</option>
                        {BULK_EDIT_FIELDS.map(function(editField) {
                          return (
                            <option
                              key={editField.key}
                              value={editField.key}
                              disabled={!!usedFields[editField.key]}
                            >
                              {editField.label}
                            </option>
                          )
                        })}
                      </Form.Select>
                    </Col>
                    <Col xs={12} md={5}>
                      {index === 0 ? (
                        <Form.Label className="bulk-change-row-label">New value</Form.Label>
                      ) : null}
                      <BulkFieldValueInput
                        fieldKey={row.field}
                        value={row.value}
                        rowId={row.id}
                        tunebook={tunebook}
                        token={token}
                        onChange={function(nextValue) { updateRow(row.id, { value: nextValue }) }}
                      />
                    </Col>
                    <Col xs={12} md={2} className="bulk-change-row-actions">
                      <Button
                        variant="outline-danger"
                        aria-label="Remove change row"
                        title="Remove change"
                        disabled={rows.length === 1 && !row.field && (row.value === '' || (Array.isArray(row.value) && row.value.length === 0))}
                        onClick={function() { removeRow(row.id) }}
                      >
                        {tunebook.icons.deletebin}
                      </Button>
                    </Col>
                  </Row>
                  {row.field && !isBulkChangeRowComplete(row) ? (
                    <div className="bulk-change-row-hint text-muted">Enter a value for this field.</div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <Button variant="outline-primary" className="bulk-change-add-row" onClick={addRow}>
            {tunebook.icons.add}
            <span className="bulk-ops-btn-label"> Add another field</span>
          </Button>

          <div className="bulk-change-footer">
            {canApply ? (
              <Button variant="success" onClick={apply} disabled={applying}>
                {applying ? 'Applying…' : ('Apply ' + applyCount + ' change' + (applyCount === 1 ? '' : 's'))}
              </Button>
            ) : (
              <Button variant="secondary" disabled>Apply changes</Button>
            )}
            <Button variant="danger" onClick={handleClose} disabled={applying}>Cancel</Button>
          </div>
        </Modal.Body>
      </Modal>
    </>
  )
}
