import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  buildDefaultFieldSelectionsForRecord,
  buildFieldSelectionsForRecord,
} from '../incomingMergeUtils';
import {
  buildTuneImportFieldRows,
  setAllTuneImportSelections,
  setRecommendedTuneImportSelections,
} from '../tuneImportMergeUtils';

function RecordFieldTable(props) {
  const record = props.record;
  const onlyDiffering = props.onlyDiffering !== false;
  const fromSourceUrl = props.mergeKind === 'sourceUrl';
  const currentLabel = fromSourceUrl ? 'Your tunebook' : 'Current';
  const incomingLabel = fromSourceUrl ? 'Source file' : 'Incoming';
  const rows = useMemo(function() {
    const all = buildTuneImportFieldRows(record.localTune, record.incomingTune);
    return onlyDiffering ? all.filter(function(row) { return row.differs; }) : all;
  }, [record, onlyDiffering]);

  const selections = props.selections || {};
  const onChange = props.onChange;

  if (record.kind === 'insert') {
    return (
      <Alert variant="info" className="mb-0">
        {fromSourceUrl ? 'New tune in source file' : 'New tune from remote source'}: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-insert-' + record.id}
          label="Add this tune"
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
        Tune removed on another device: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-delete-' + record.id}
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
    return <Alert variant="secondary" className="mb-0">No differing fields for this tune.</Alert>;
  }

  return (
    <Table bordered size="sm" className="tune-import-field-table" style={{ backgroundColor: 'white' }}>
      <thead>
        <tr>
          <th style={{ width: '4%' }}>Import</th>
          <th style={{ width: '16%' }}>Field</th>
          <th style={{ width: '40%' }}>{currentLabel}</th>
          <th style={{ width: '40%' }}>{incomingLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(function(row) {
          return (
            <tr key={row.key} className={row.differs ? 'table-warning' : undefined}>
              <td className="text-center align-middle">
                <Form.Check
                  type="checkbox"
                  id={'incoming-merge-' + record.id + '-' + row.key}
                  checked={!!selections[row.key]}
                  onChange={function(e) {
                    if (typeof onChange === 'function') {
                      onChange(Object.assign({}, selections, { [row.key]: e.target.checked }));
                    }
                  }}
                  aria-label={'Import ' + row.label}
                />
              </td>
              <td className="align-middle">
                <div>{row.label}</div>
                <small className="text-muted">{row.group}</small>
              </td>
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

function MergeRecordSection(props) {
  const record = props.record;
  const state = props.state || {};
  const updateRecordState = props.updateRecordState;

  return (
    <div className="incoming-merge-record border rounded mb-3 overflow-hidden">
      <div
        className="incoming-merge-record-header px-3 py-2 d-flex align-items-center gap-2 flex-wrap"
        style={{ backgroundColor: 'var(--bs-light, #f8f9fa)', borderBottom: '1px solid var(--bs-border-color, #dee2e6)' }}
      >
        <strong>{record.label || record.id}</strong>
        <Badge bg={recordKindVariant(record.kind)}>{recordKindLabel(record.kind)}</Badge>
        {state.accept === false && <Badge bg="secondary">Skipped</Badge>}
      </div>
      <div className="incoming-merge-record-body p-3">
        <RecordFieldTable
          record={record}
          mergeKind={props.mergeKind}
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
          <div style={{ marginTop: '0.75em', display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() {
                updateRecordState(record.id, {
                  fieldSelections: setRecommendedTuneImportSelections(
                    buildTuneImportFieldRows(record.localTune, record.incomingTune).filter(function(r) { return r.differs; })
                  ),
                });
              }}
            >
              Recommended fields
            </Button>
            <Button
              size="sm"
              variant="outline-success"
              onClick={function() {
                updateRecordState(record.id, {
                  fieldSelections: buildFieldSelectionsForRecord(record, true),
                });
              }}
            >
              Select all differing
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={function() {
                updateRecordState(record.id, {
                  fieldSelections: setAllTuneImportSelections(
                    buildTuneImportFieldRows(record.localTune, record.incomingTune).filter(function(r) { return r.differs; }),
                    false
                  ),
                });
              }}
            >
              Select none
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IncomingMergeModal(props) {
  const batch = props.batch;
  const show = !!(props.show && batch && Array.isArray(batch.records) && batch.records.length > 0);
  const [recordState, setRecordState] = useState({});

  useEffect(function() {
    if (!show || !batch) return;
    const next = {};
    batch.records.forEach(function(record) {
      next[record.id] = {
        accept: true,
        fieldSelections: buildDefaultFieldSelectionsForRecord(record, true),
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

  // "Accept All" must take every differing incoming field, not the recommended
  // defaults. Otherwise fields like tags/links stay different from the remote
  // copy and the same tunes keep coming back as updates to merge.
  function buildAcceptAllRecordState() {
    const next = {};
    (batch && batch.records ? batch.records : []).forEach(function(record) {
      next[record.id] = {
        accept: true,
        fieldSelections: buildFieldSelectionsForRecord(record, true),
      };
    });
    return next;
  }

  function handleAcceptAll() {
    if (typeof props.onApply === 'function') {
      props.onApply(buildAcceptAllRecordState(), { acceptAllFromSource: false });
    }
  }

  function handleAcceptAllFromSource() {
    const label = batch && batch.sourceLabel ? batch.sourceLabel : 'this source';
    const isDrive = batch && batch.kind === 'drive';
    const msg = isDrive
      ? 'Always accept all updates from Google Drive tunebook automatically? This applies remote changes from other devices without asking.'
      : 'Always accept all updates from ' + label + ' automatically?';
    if (!window.confirm(msg)) return;
    if (typeof props.onApply === 'function') {
      props.onApply(buildAcceptAllRecordState(), { acceptAllFromSource: true });
    }
  }

  function handleRejectAll() {
    if (typeof props.onReject === 'function') props.onReject({ rejectAllFromSource: false });
  }

  function handleRejectAllFromSource() {
    const label = batch && batch.sourceLabel ? batch.sourceLabel : 'this source';
    if (!window.confirm('Silently ignore future updates from ' + label + '?')) return;
    if (typeof props.onReject === 'function') props.onReject({ rejectAllFromSource: true });
  }

  if (!show) return null;

  return (
    <Modal
      show={show}
      onHide={props.onClose}
      dialogClassName="incoming-merge-modal"
      contentClassName="incoming-merge-content"
      backdrop="static"
      keyboard={false}
      size="xl"
    >
      <Modal.Header closeButton>
        <Modal.Title>{batch.sourceLabel || 'Review incoming changes'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '1em' }}>
          <Button variant="success" size="sm" onClick={handleAcceptAll}>Accept All</Button>
          <Button variant="outline-success" size="sm" onClick={handleAcceptAllFromSource}>Accept All From This Source</Button>
          <Button variant="secondary" size="sm" onClick={handleRejectAll}>Reject All</Button>
          <Button variant="outline-secondary" size="sm" onClick={handleRejectAllFromSource}>Reject All From This Source</Button>
          {props.tunebook && (
            <Button
              variant="outline-primary"
              size="sm"
              style={{ marginLeft: 'auto' }}
              onClick={function() { props.tunebook.downloadTuneBookAbc(); }}
            >
              {props.tunebook.icons && props.tunebook.icons.save} Download backup
            </Button>
          )}
        </div>

        {batch.summary && <Alert variant="info">{batch.summary}</Alert>}

        <div className="incoming-merge-records-list">
          {batch.records.map(function(record) {
            return (
              <MergeRecordSection
                key={record.id}
                record={record}
                mergeKind={batch.kind}
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
          if (typeof props.onApply === 'function') {
            props.onApply(recordState, { acceptAllFromSource: false });
          }
        }}>
          Apply selected
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
