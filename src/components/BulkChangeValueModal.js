import {useMemo, useRef, useState} from 'react'
import {Button, Modal, Form, Row, Col} from 'react-bootstrap'
import CreatableSelect from 'react-select/creatable'
import { FormLabelWithHelp } from './FormFieldHelp'
import { BULK_FIELD_HELP } from '../formFieldHelpText'
import { genreSelectValue } from '../musicGenreOptions'
import {
  BULK_EDIT_FIELDS,
  getBulkEditField,
  getBulkEditSelectOptions,
  isBulkChangeRowComplete,
  prepareBulkChanges,
} from '../bulkEditFields'

var nextRowId = 1

function createEmptyRow() {
  return { id: 'bulk-row-' + (nextRowId++), field: '', value: '' }
}

function BulkFieldValueInput({fieldKey, value, onChange, tunebook}) {
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

  if (field.type === 'genre') {
    var genreOptions = getBulkEditSelectOptions(field, tunebook)
    return (
      <CreatableSelect
        value={genreSelectValue(value)}
        onChange={function(val) { onChange(val ? val.label : '') }}
        options={genreOptions}
        isClearable={field.allowEmpty}
        blurInputOnSelect={true}
        createOptionPosition="first"
        allowCreateWhileLoading={true}
        placeholder={field.allowEmpty ? 'Choose or type a genre' : 'Choose or type a genre'}
      />
    )
  }

  return (
    <Form.Control
      type="text"
      placeholder={field.allowEmpty ? 'Leave blank to clear' : ''}
      value={value}
      onChange={function(e) { onChange(e.target.value) }}
    />
  )
}

export default function BulkChangeValueModal({tunebook, selected, onClose, forceRefresh}) {
  const [show, setShow] = useState(false)
  const [rows, setRows] = useState([createEmptyRow()])
  const listRef = useRef(null)

  const selectedCount = Object.keys(selected).filter(function(item) {
    return (selected[item] ? true : false)
  }).length

  const preparedChanges = useMemo(function() {
    return prepareBulkChanges(rows)
  }, [rows])

  const canApply = preparedChanges.length > 0

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
          next.value = ''
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

  function apply() {
    var changes = prepareBulkChanges(rows)
    if (!changes.length) return

    var currentSelection = Object.keys(selected).filter(function(item) {
      return (selected[item] ? true : false)
    })
    tunebook.bulkChangeTunes(currentSelection, changes)
    forceRefresh()
    handleClose()
  }

  function fieldsUsedExcept(rowId) {
    var used = {}
    rows.forEach(function(row) {
      if (row.id !== rowId && row.field) used[row.field] = true
    })
    return used
  }

  return (
    <>
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
                        {BULK_EDIT_FIELDS.map(function(field) {
                          return (
                            <option
                              key={field.key}
                              value={field.key}
                              disabled={!!usedFields[field.key]}
                            >
                              {field.label}
                            </option>
                          )
                        })}
                      </Form.Select>
                    </Col>
                    <Col xs={12} md={5}>
                      {index === 0 ? <Form.Label className="bulk-change-row-label">New value</Form.Label> : null}
                      <BulkFieldValueInput
                        fieldKey={row.field}
                        value={row.value}
                        tunebook={tunebook}
                        onChange={function(nextValue) { updateRow(row.id, { value: nextValue }) }}
                      />
                    </Col>
                    <Col xs={12} md={2} className="bulk-change-row-actions">
                      <Button
                        variant="outline-danger"
                        aria-label="Remove change row"
                        title="Remove change"
                        disabled={rows.length === 1 && !row.field && row.value === ''}
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
              <Button variant="success" onClick={apply}>
                Apply {preparedChanges.length} change{preparedChanges.length === 1 ? '' : 's'}
              </Button>
            ) : (
              <Button variant="secondary" disabled>Apply changes</Button>
            )}
            <Button variant="danger" onClick={handleClose}>Cancel</Button>
          </div>
        </Modal.Body>
      </Modal>
    </>
  )
}
