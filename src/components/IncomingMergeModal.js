import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  buildDefaultFieldSelectionsForRecord,
  buildFieldSelectionsForRecord,
} from '../incomingMergeUtils';
import { toTuneUpdatedMs } from '../tuneBookSync';
import {
  buildTuneImportFieldRows,
  fieldValuesSemanticallyEqual,
  setAllTuneImportSelections,
  setRecommendedTuneImportSelections,
  tuneHasNotationContent,
} from '../tuneImportMergeUtils';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';
import { buildAbcFromTune, NotationPreview } from './SuggestionPreviewDialog';

function formatTuneTimestamp(ts) {
  const ms = toTuneUpdatedMs(ts);
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch (e) {
    return String(ms);
  }
}

function newerSideLabel(localTune, incomingTune) {
  const localMs = toTuneUpdatedMs(localTune && localTune.lastUpdated);
  const incomingMs = toTuneUpdatedMs(incomingTune && incomingTune.lastUpdated);
  if (incomingMs > localMs) return 'Incoming copy is newer (saved later on Google Drive).';
  if (localMs > incomingMs) return 'Your copy is newer on this device.';
  return 'Both copies share the same save timestamp; compare the previews below.';
}

function notationDiffersBetweenTunes(localTune, incomingTune) {
  if (!localTune || !incomingTune) return false;
  if (!fieldValuesSemanticallyEqual('voices', localTune.voices, incomingTune.voices)) return true;
  if (!fieldValuesSemanticallyEqual('notes', localTune.notes, incomingTune.notes)) return true;
  return false;
}

function IncomingNotationPreview(props) {
  const localTune = props.localTune;
  const incomingTune = props.incomingTune;
  const currentLabel = props.currentLabel || 'Current';
  const incomingLabel = props.incomingLabel || 'Incoming';
  if (!localTune || !incomingTune) return null;

  return (
    <div className="incoming-merge-notation-preview mt-3" data-testid="incoming-merge-notation-preview">
      <h6 className="mb-2">Notation preview</h6>
      <p className="small text-muted mb-2">{newerSideLabel(localTune, incomingTune)}</p>
      <div className="row g-2">
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">
            {currentLabel}
            {localTune.lastUpdated ? ' · ' + formatTuneTimestamp(localTune.lastUpdated) : ''}
          </div>
          <NotationPreview abc={buildAbcFromTune(localTune)} fitWidth={true} maxHeight="35vh" />
        </div>
        <div className="col-md-6" style={{ minWidth: 0 }}>
          <div className="small text-muted mb-1">
            {incomingLabel}
            {incomingTune.lastUpdated ? ' · ' + formatTuneTimestamp(incomingTune.lastUpdated) : ''}
          </div>
          <NotationPreview abc={buildAbcFromTune(incomingTune)} fitWidth={true} maxHeight="35vh" />
        </div>
      </div>
    </div>
  );
}

function IncomingNotationStatus(props) {
  const localTune = props.localTune;
  const incomingTune = props.incomingTune;
  const currentLabel = props.currentLabel || 'Current';
  const incomingLabel = props.incomingLabel || 'Incoming';
  if (!tuneHasNotationContent(localTune) && !tuneHasNotationContent(incomingTune)) {
    return null;
  }
  if (notationDiffersBetweenTunes(localTune, incomingTune)) {
    return (
      <IncomingNotationPreview
        localTune={localTune}
        incomingTune={incomingTune}
        currentLabel={currentLabel}
        incomingLabel={incomingLabel}
      />
    );
  }
  return (
    <Alert variant="secondary" className="mb-0 mt-3" data-testid="incoming-merge-notation-identical">
      Music (notation) matches on both copies.
    </Alert>
  );
}

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
  const fromSourceUrl = props.mergeKind === 'sourceUrl';
  const currentLabel = fromSourceUrl ? 'Your tunebook' : 'Current (this device)';
  const incomingLabel = fromSourceUrl ? 'Source file' : 'Incoming (Google Drive)';
  const differingRows = useMemo(function() {
    if (record.kind !== 'update') return [];
    return buildTuneImportFieldRows(record.localTune, record.incomingTune).filter(function(r) { return r.differs; });
  }, [record]);
  const fieldSelections = state.fieldSelections || {};
  const selectedDifferingCount = differingRows.filter(function(row) { return fieldSelections[row.key]; }).length;

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
          <IncomingNotationStatus
            localTune={record.localTune}
            incomingTune={record.incomingTune}
            currentLabel={currentLabel}
            incomingLabel={incomingLabel}
          />
        )}
        {record.kind === 'update' && (
          <div className="select-all-host" style={{ marginTop: '0.75em', display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'stretch' }}>
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
            <SelectAllToggle
              size="sm"
              totalCount={differingRows.length}
              selectedCount={selectedDifferingCount}
              onSelectAll={function() {
                updateRecordState(record.id, {
                  fieldSelections: buildFieldSelectionsForRecord(record, true),
                });
              }}
              onSelectNone={function() {
                updateRecordState(record.id, {
                  fieldSelections: setAllTuneImportSelections(differingRows, false),
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

export default function IncomingMergeModal(props) {
  const batch = props.batch;
  const show = !!(props.show && batch && Array.isArray(batch.records) && batch.records.length > 0);
  const [recordState, setRecordState] = useState({});

  useEffect(function() {
    if (!show || !batch) return;
    setRecordState(function(prev) {
      const next = Object.assign({}, prev);
      (batch.records || []).forEach(function(record) {
        if (!next[record.id]) {
          next[record.id] = {
            accept: true,
            fieldSelections: buildDefaultFieldSelectionsForRecord(record, true),
          };
        }
      });
      Object.keys(next).forEach(function(id) {
        if (!(batch.records || []).some(function(record) { return record.id === id; })) {
          delete next[id];
        }
      });
      return next;
    });
  }, [show, batch && batch.records && batch.records.map(function(r) { return r.id }).join('\0')]);

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
