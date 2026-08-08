import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  buildDefaultFieldSelectionsForPlaylistRecord,
  buildFieldSelectionsForPlaylistRecord,
} from '../playlistIncomingMergeUtils';
import {
  buildPlaylistFieldRows,
  setAllPlaylistSelections,
  setRecommendedPlaylistSelections,
} from '../playlistMergeUtils';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';

function PlaylistRecordFieldTable(props) {
  const record = props.record;
  const tunesById = props.tunesById || {};
  const onlyDiffering = props.onlyDiffering !== false;
  const rows = useMemo(function() {
    const all = buildPlaylistFieldRows(record.localPlaylist, record.incomingPlaylist, tunesById);
    return onlyDiffering ? all.filter(function(row) { return row.differs; }) : all;
  }, [record, onlyDiffering, tunesById]);

  const selections = props.selections || {};
  const onChange = props.onChange;

  if (record.kind === 'insert') {
    return (
      <Alert variant="info" className="mb-0">
        New playlist from remote source: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-playlist-insert-' + record.id}
          label="Add this playlist"
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
        Playlist removed on another source: <strong>{record.label}</strong>
        {' '}
        <Form.Check
          type="checkbox"
          id={'accept-playlist-delete-' + record.id}
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
    <Table bordered size="sm" className="playlist-field-table" style={{ backgroundColor: 'white' }}>
      <thead>
        <tr>
          <th style={{ width: '4%' }}>Import</th>
          <th style={{ width: '16%' }}>Field</th>
          <th style={{ width: '40%' }}>Your playlist</th>
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

function PlaylistMergeRecordSection(props) {
  const record = props.record;
  const state = props.state || {};
  const updateRecordState = props.updateRecordState;
  const tunesById = props.tunesById || {};
  const differingRows = useMemo(function() {
    if (record.kind !== 'update') return [];
    return buildPlaylistFieldRows(record.localPlaylist, record.incomingPlaylist, tunesById).filter(function(r) { return r.differs; });
  }, [record, tunesById]);
  const fieldSelections = state.fieldSelections || {};
  const selectedDifferingCount = differingRows.filter(function(row) { return fieldSelections[row.key]; }).length;

  return (
    <div className="playlist-merge-record border rounded mb-3 overflow-hidden">
      <div
        className="playlist-merge-record-header px-3 py-2 d-flex align-items-center gap-2 flex-wrap"
        style={{ backgroundColor: 'var(--bs-light, #f8f9fa)', borderBottom: '1px solid var(--bs-border-color, #dee2e6)' }}
      >
        <strong>{record.label || record.id}</strong>
        <Badge bg={recordKindVariant(record.kind)}>{recordKindLabel(record.kind)}</Badge>
        {state.accept === false && <Badge bg="secondary">Skipped</Badge>}
      </div>
      <div className="playlist-merge-record-body p-3">
        <PlaylistRecordFieldTable
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
                  fieldSelections: setRecommendedPlaylistSelections(
                    buildPlaylistFieldRows(record.localPlaylist, record.incomingPlaylist, tunesById).filter(function(r) { return r.differs; })
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
                  fieldSelections: buildFieldSelectionsForPlaylistRecord(record, true, tunesById),
                });
              }}
              onSelectNone={function() {
                updateRecordState(record.id, {
                  fieldSelections: setAllPlaylistSelections(differingRows, false),
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

export default function PlaylistMergeModal(props) {
  const batch = props.batch;
  const show = !!(props.show && batch && batch.prepared && Array.isArray(batch.prepared.records) && batch.prepared.records.length > 0);
  const [recordState, setRecordState] = useState({});

  useEffect(function() {
    if (!show || !batch || !batch.prepared) return;
    const records = batch.prepared.records || [];
    setRecordState(function(prev) {
      const next = Object.assign({}, prev);
      records.forEach(function(record) {
        if (!next[record.id]) {
          next[record.id] = {
            accept: true,
            fieldSelections: buildDefaultFieldSelectionsForPlaylistRecord(record, true, batch.prepared.tunesById),
          };
        }
      });
      Object.keys(next).forEach(function(id) {
        if (!records.some(function(record) { return record.id === id; })) {
          delete next[id];
        }
      });
      return next;
    });
  }, [show, batch && batch.prepared && batch.prepared.records && batch.prepared.records.map(function(r) { return r.id }).join('\0')]);

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
      dialogClassName="playlist-merge-modal"
      contentClassName="playlist-merge-content"
      backdrop="static"
      keyboard={false}
      size="xl"
    >
      <Modal.Header closeButton>
        <Modal.Title>{batch.sourceLabel || 'Review playlist changes'}</Modal.Title>
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

        <div className="playlist-merge-records-list">
          {prepared.records.map(function(record) {
            return (
              <PlaylistMergeRecordSection
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
