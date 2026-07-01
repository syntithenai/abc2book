import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  applyTuneImportSelections,
  buildDefaultTuneImportSelections,
  buildTuneImportFieldRows,
  setAllTuneImportSelections,
  setRecommendedTuneImportSelections,
} from '../tuneImportMergeUtils';

export default function TuneImportFieldChooserModal(props) {
  const originalTune = props.originalTune;
  const importedTune = props.importedTune;
  const show = !!(props.show && originalTune && importedTune);
  const [selections, setSelections] = useState({});

  const rows = useMemo(function() {
    if (!originalTune || !importedTune) return [];
    return buildTuneImportFieldRows(originalTune, importedTune);
  }, [originalTune, importedTune]);

  useEffect(function() {
    setSelections(buildDefaultTuneImportSelections(rows));
  }, [rows]);

  const changedCount = rows.filter(function(row) { return row.differs; }).length;
  const selectedCount = rows.filter(function(row) { return selections[row.key]; }).length;

  function updateSelection(fieldKey, checked) {
    setSelections(function(current) {
      return Object.assign({}, current, { [fieldKey]: checked });
    });
  }

  function handleSave() {
    if (!originalTune || !importedTune) return;
    const merged = applyTuneImportSelections(originalTune, importedTune, selections);
    if (typeof props.onSave === 'function') {
      props.onSave(merged);
    }
  }

  return (
    <Modal
      show={show}
      onHide={props.onClose}
      dialogClassName="tune-import-field-chooser-modal"
      contentClassName="tune-import-field-chooser-content"
    >
      <Modal.Header closeButton>
        <Modal.Title>{props.sourceLabel || 'Import from collection'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info">
          Tick the fields you want to import. Any field not listed, or left unticked, stays as it is on your current tune.
        </Alert>

        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.75em' }}>
          <Button
            size="sm"
            variant="outline-primary"
            onClick={function() { setSelections(setRecommendedTuneImportSelections(rows)); }}
          >
            Recommended (metadata, music, lyrics)
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={function() { setSelections(setAllTuneImportSelections(rows, false)); }}
          >
            Select none
          </Button>
          <Button
            size="sm"
            variant="outline-success"
            onClick={function() { setSelections(setAllTuneImportSelections(rows, true)); }}
          >
            Select all
          </Button>
        </div>

        {changedCount > 0 && (
          <div style={{ marginBottom: '0.75em' }}>
            {changedCount} of {rows.length} incoming field{rows.length === 1 ? '' : 's'} differ from your current tune.
            {selectedCount > 0 && (' ' + selectedCount + ' selected for import.')}
          </div>
        )}

        {rows.length === 0 ? (
          <Alert variant="warning">The imported ABC does not contain any importable fields.</Alert>
        ) : (
          <Table bordered size="sm" className="tune-import-field-table" style={{ backgroundColor: 'white' }}>
            <thead>
              <tr>
                <th style={{ width: '4%' }}>Import</th>
                <th style={{ width: '16%' }}>Field</th>
                <th style={{ width: '40%' }}>Existing</th>
                <th style={{ width: '40%' }}>Imported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function(row) {
                return (
                  <tr key={row.key} className={row.differs ? 'table-warning' : undefined}>
                    <td className="text-center align-middle">
                      <Form.Check
                        type="checkbox"
                        id={'tune-import-' + row.key}
                        checked={!!selections[row.key]}
                        onChange={function(e) { updateSelection(row.key, e.target.checked); }}
                        aria-label={'Import ' + row.label}
                      />
                    </td>
                    <td className="align-middle">
                      <label htmlFor={'tune-import-' + row.key} style={{ marginBottom: 0, cursor: 'pointer' }}>
                        <div>{row.label}</div>
                        <small className="text-muted">{row.group}</small>
                      </label>
                    </td>
                    <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.originalDisplay}</td>
                    <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.importedDisplay}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
        <Button variant="success" onClick={handleSave} disabled={rows.length === 0}>Save</Button>
      </Modal.Footer>
    </Modal>
  );
}
