import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  buildDefaultFieldSelectionsForSetRecord,
  buildFieldSelectionsForSetRecord,
} from '../performanceSetIncomingMergeUtils';
import {
  buildPerformanceSetFieldRows,
  setAllPerformanceSetSelections,
  setRecommendedPerformanceSetSelections,
} from '../performanceSetMergeUtils';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';

function SetRecordFieldTable(props) {
  const record = props.record;
  const tunesById = props.tunesById || {};
  const onlyDiffering = props.onlyDiffering !== false;
  const rows = useMemo(function() {
    const all = buildPerformanceSetFieldRows(record.localSet, record.incomingSet, tunesById);
    return onlyDiffering ? all.filter(function(row) { return row.differs; }) : all;
  }, [record, onlyDiffering, tunesById]);

  const selections = props.selections || {};
  const onChange = props.onChange;

  if (record.kind === 'insert') {
    return (
      <Alert variant="info" className="mb-0">
        New set list from remote source: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-set-insert-' + record.id}
          label="Add this set list"
          checked={props.accept !== false}
          onChange={function(e) {
            if (typeof props.onAcceptChange === 'function') {
              props.onAcceptChange(e.target.checked);
            }
          }}
        />
      </Alert>
    );
  }

  if (record.kind === 'delete') {
    return (
      <Alert variant="warning" className="mb-0">
        Set list removed on another source: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-set-delete-' + record.id}
          label="Remove from this device"
          checked={props.accept !== false}
          onChange={function(e) {
            if (typeof props.onAcceptChange === 'function') {
              props.onAcceptChange(e.target.checked);
            }
          }}
        />
      </Alert>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <Table bordered size="sm" className="performance-set-field-table" style={{ backgroundColor: 'white' }}>
      <thead>
        <tr>
          <th style={{ width: '4%' }}>Import</th>
          <th style={{ width: '16%' }}>Field</th>
          <th style={{ width: '40%' }}>Your set list</th>
          <th style={{ width: '40%' }}>Incoming</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(function(row) {
          return (
            <tr key={row.key} className={row.differs ? 'table-warning' : undefined}>
              <td className="text-center align-middle">
                <CheckToggleButton
                  size="sm"
                  checked={!!selections[row.key]}
                  ariaLabel={'Import ' + row.label}
                  onClick={function() {
                    if (typeof onChange === 'function') {
                      onChange(Object.assign({}, selections, { [row.key]: !selections[row.key] }));
                    }
                  }}
                />
              </td>
              <td className="align-middle">{row.label}</td>
              <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.originalDisplay}</td>
              <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.importedDisplay}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function recordKindLabel(kind) {
  if (kind === 'insert') return 'Add';
  if (kind === 'delete') return 'Remove';
  return 'Update';
}

function recordKindVariant(kind) {
  if (kind === 'insert') return 'success';
  if (kind === 'delete') return 'danger';
  return 'primary';
}

function SetMergeRecordSection(props) {
  const record = props.record;
  const state = props.state || {};
  const updateRecordState = props.updateRecordState;
  const tunesById = props.tunesById || {};
  const differingRows = useMemo(function() {
    if (record.kind !== 'update') return [];
    return buildPerformanceSetFieldRows(record.localSet, record.incomingSet, tunesById).filter(function(r) { return r.differs; });
  }, [record, tunesById]);
  const fieldSelections = state.fieldSelections || {};
  const selectedDifferingCount = differingRows.filter(function(row) { return fieldSelections[row.key]; }).length;

  return (
    <div className="performance-set-merge-record border rounded mb-3 overflow-hidden">
      <div
        className="performance-set-merge-record-header px-3 py-2 d-flex align-items-center gap-2 flex-wrap"
        style={{ backgroundColor: 'var(--bs-light, #f8f9fa)', borderBottom: '1px solid var(--bs-border-color, #dee2e6)' }}
      >
        <strong>{record.label || record.id}</strong>
        <Badge bg={recordKindVariant(record.kind)}>{recordKindLabel(record.kind)}</Badge>
        {state.accept === false && <Badge bg="secondary">Skipped</Badge>}
      </div>
      <div className="performance-set-merge-record-body p-3">
        <SetRecordFieldTable
          record={record}
          tunesById={tunesById}
          onlyDiffering
          accept={state.accept}
          selections={state.fieldSelections}
          onAcceptChange={function(checked) {
            updateRecordState(record.id, { accept: checked });
          }}
          onChange={function(nextSelections) {
            updateRecordState(record.id, { fieldSelections: nextSelections });
          }}
        />
        {record.kind === 'update' && (
          <div className="select-all-host" style={{ marginTop: '0.75em', display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() {
                updateRecordState(record.id, {
                  fieldSelections: setRecommendedPerformanceSetSelections(
                    buildPerformanceSetFieldRows(record.localSet, record.incomingSet, tunesById).filter(function(r) { return r.differs; })
                  ),
                });
              }}
            >
              Recommended fields
            </Button>
            <SelectAllToggle
              size="sm"
              totalCount={differingRows.length}
              selectedCount={selectedDifferingCount}
              onSelectAll={function() {
                updateRecordState(record.id, {
                  fieldSelections: buildFieldSelectionsForSetRecord(record, true, tunesById),
                });
              }}
              onSelectNone={function() {
                updateRecordState(record.id, {
                  fieldSelections: setAllPerformanceSetSelections(differingRows, false),
                });
              }}
              ariaLabel="Select all differing fields"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function PerformanceSetMergeModal(props) {
  const batch = props.batch;
  const show = !!(props.show && batch && batch.prepared && Array.isArray(batch.prepared.records) && batch.prepared.records.length > 0);
  const [recordState, setRecordState] = useState({});

  useEffect(function() {
    if (!show || !batch || !batch.prepared) return;
    const next = {};
    batch.prepared.records.forEach(function(record) {
      next[record.id] = {
        accept: true,
        fieldSelections: buildDefaultFieldSelectionsForSetRecord(record, true, batch.prepared.tunesById),
      };
    });
    setRecordState(next);
  }, [show, batch]);

  function updateRecordState(recordId, patch) {
    setRecordState(function(prev) {
      return Object.assign({}, prev, {
        [recordId]: Object.assign({}, prev[recordId] || {}, patch),
      });
    });
  }

  if (!show) return null;

  const prepared = batch.prepared;

  return (
    <Modal
      show={show}
      onHide={props.onClose}
      dialogClassName="performance-set-merge-modal"
      contentClassName="performance-set-merge-content"
      backdrop="static"
      keyboard={false}
      size="xl"
    >
      <Modal.Header closeButton>
        <Modal.Title>{batch.sourceLabel || 'Review set list changes'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '1em' }}>
          <Button variant="success" size="sm" onClick={function() {
            if (typeof props.onApply === 'function') props.onApply(recordState, { acceptAllFromSource: false });
          }}>Accept All</Button>
          <Button variant="outline-success" size="sm" onClick={function() {
            if (typeof props.onApply === 'function') props.onApply(recordState, { acceptAllFromSource: true });
          }}>Accept All From This Source</Button>
          <Button variant="secondary" size="sm" onClick={function() {
            if (typeof props.onReject === 'function') props.onReject({ rejectAllFromSource: false });
          }}>Reject All</Button>
          <Button variant="outline-secondary" size="sm" onClick={function() {
            if (typeof props.onReject === 'function') props.onReject({ rejectAllFromSource: true });
          }}>Reject All From This Source</Button>
        </div>

        {prepared.summary && <Alert variant="info">{prepared.summary}</Alert>}

        <div className="performance-set-merge-records-list">
          {prepared.records.map(function(record) {
            return (
              <SetMergeRecordSection
                key={record.id}
                record={record}
                tunesById={prepared.tunesById}
                state={recordState[record.id]}
                updateRecordState={updateRecordState}
              />
            );
          })}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onClose}>Close</Button>
        <Button variant="success" onClick={function() {
          if (typeof props.onApply === 'function') props.onApply(recordState, { acceptAllFromSource: false });
        }}>
          Apply selected
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
