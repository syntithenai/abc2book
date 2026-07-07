import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import {
  applyTuneImportSelections,
  buildDefaultTuneImportSelections,
  buildTuneImportFieldRows,
  setAllTuneImportSelections,
  setRecommendedTuneImportSelections,
} from '../tuneImportMergeUtils';

export function TuneImportFieldPicker(props) {
  const originalTune = props.originalTune;
  const importedTune = props.importedTune;
  const [selections, setSelections] = useState({});

  const rows = useMemo(function() {
    if (!originalTune || !importedTune) return [];
    const all = buildTuneImportFieldRows(originalTune, importedTune);
    if (props.onlyDiffering) return all.filter(function(row) { return row.differs; });
    return all;
  }, [originalTune, importedTune, props.onlyDiffering]);

  useEffect(function() {
    const defaults = buildDefaultTuneImportSelections(rows);
    setSelections(defaults);
    if (typeof props.onSelectionsChange === 'function') {
      props.onSelectionsChange(defaults);
    }
  }, [rows]);

  const changedCount = rows.filter(function(row) { return row.differs; }).length;
  const selectedCount = rows.filter(function(row) { return selections[row.key]; }).length;

  function updateSelection(fieldKey, checked) {
    setSelections(function(current) {
      const next = Object.assign({}, current, { [fieldKey]: checked });
      if (typeof props.onSelectionsChange === 'function') {
        props.onSelectionsChange(next);
      }
      return next;
    });
  }

  return (
    <>
      <Alert variant="info">
        Tick the fields you want to import. Unticked fields stay as they are on your current tune.
      </Alert>

      <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.75em' }}>
        <Button
          size="sm"
          variant="outline-primary"
          onClick={function() {
            const next = setRecommendedTuneImportSelections(rows);
            setSelections(next);
            if (typeof props.onSelectionsChange === 'function') props.onSelectionsChange(next);
          }}
        >
          Recommended (metadata, music, lyrics)
        </Button>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={function() {
            const next = setAllTuneImportSelections(rows, false);
            setSelections(next);
            if (typeof props.onSelectionsChange === 'function') props.onSelectionsChange(next);
          }}
        >
          Select none
        </Button>
        <Button
          size="sm"
          variant="outline-success"
          onClick={function() {
            const next = setAllTuneImportSelections(rows, true);
            setSelections(next);
            if (typeof props.onSelectionsChange === 'function') props.onSelectionsChange(next);
          }}
        >
          Select all
        </Button>
      </div>

      {changedCount > 0 && (
        <div style={{ marginBottom: '0.75em' }}>
          {changedCount} field{changedCount === 1 ? '' : 's'} differ from your current tune.
          {selectedCount > 0 && (' ' + selectedCount + ' selected for import.')}
        </div>
      )}

      {rows.length === 0 ? (
        <Alert variant="warning">No differing fields to merge.</Alert>
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
                      id={'tune-import-' + row.key + (props.idPrefix || '')}
                      checked={!!selections[row.key]}
                      onChange={function(e) { updateSelection(row.key, e.target.checked); }}
                      aria-label={'Import ' + row.label}
                    />
                  </td>
                  <td className="align-middle">
                    <label htmlFor={'tune-import-' + row.key + (props.idPrefix || '')} style={{ marginBottom: 0, cursor: 'pointer' }}>
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
    </>
  );
}

export default function TuneImportFieldChooserModal(props) {
  const originalTune = props.originalTune;
  const importedTune = props.importedTune;
  const show = !!(props.show && originalTune && importedTune);
  const [selections, setSelections] = useState({});

  const rows = useMemo(function() {
    if (!originalTune || !importedTune) return [];
    const all = buildTuneImportFieldRows(originalTune, importedTune);
    if (props.onlyDiffering) return all.filter(function(row) { return row.differs; });
    return all;
  }, [originalTune, importedTune, props.onlyDiffering]);

  function handleSave() {
    if (!originalTune || !importedTune) return;
    const merged = applyTuneImportSelections(originalTune, importedTune, selections);
    if (typeof props.onSave === 'function') {
      props.onSave(merged);
    }
  }

  if (!show) return null;

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
        <TuneImportFieldPicker
          originalTune={originalTune}
          importedTune={importedTune}
          onlyDiffering={props.onlyDiffering}
          onSelectionsChange={setSelections}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
        <Button variant="success" onClick={handleSave} disabled={rows.length === 0}>Save</Button>
      </Modal.Footer>
    </Modal>
  );
}
