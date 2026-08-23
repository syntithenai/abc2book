import React from 'react';
import { Modal, Button, Form, Table } from 'react-bootstrap';
import MidiImportKeySelect from './MidiImportKeySelect';
import { KEY_OPTIONS, STAFF_OPTIONS } from '../midiImportWizardState';

export default function MidiImportTrackManagerDialog(props) {
  const voices = props.voices || [];
  const selectedVoiceId = props.selectedVoiceId;

  return (
    <Modal show={props.show} onHide={props.onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Track manager</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted mb-2">
          Click a row to edit that track’s filters. Use On to include it in the import.
        </p>
        <div className="d-flex gap-2 mb-3">
          <Button size="sm" variant="outline-secondary" onClick={props.onDuplicateClick}>
            Duplicate…
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={voices.length < 2}
            onClick={props.onMergeClick}>
            Merge…
          </Button>
        </div>
        <Table size="sm" hover responsive className="midi-import-track-manager-table mb-0">
          <thead>
            <tr>
              <th style={{ width: '2.5rem' }} />
              <th>On</th>
              <th>Name</th>
              <th>Key</th>
              <th>Clef</th>
              <th className="text-end">Notes</th>
            </tr>
          </thead>
          <tbody>
            {voices.map(function(voice) {
              const color = voice.color || '#888';
              const count = props.noteCountFor ? props.noteCountFor(voice) : 0;
              const selected = selectedVoiceId === voice.id;
              return (
                <tr
                  key={voice.id}
                  className={selected ? 'midi-import-track-manager-row--selected' : undefined}
                  style={selected ? { outline: '2px solid ' + color, outlineOffset: '-2px' } : undefined}
                  onClick={function() {
                    if (props.onSelectVoice) props.onSelectVoice(voice.id);
                  }}
                >
                  <td>
                    <span className="midi-import-track-swatch midi-import-track-swatch-lg"
                      style={{ background: color }} aria-hidden="true" />
                  </td>
                  <td onClick={function(e) { e.stopPropagation(); }}>
                    <Form.Check
                      type="checkbox"
                      checked={!!voice.enabled}
                      onChange={function(e) {
                        props.onPatchVoice(voice.id, { enabled: e.target.checked });
                      }}
                      aria-label={'Enable ' + (voice.displayName || voice.id)}
                    />
                  </td>
                  <td onClick={function(e) { e.stopPropagation(); }}>
                    <Form.Control
                      size="sm"
                      value={voice.displayName || ''}
                      onChange={function(e) {
                        props.onPatchVoice(voice.id, { displayName: e.target.value });
                      }}
                      aria-label="Track name"
                    />
                  </td>
                  <td onClick={function(e) { e.stopPropagation(); }}>
                    <MidiImportKeySelect
                      value={(voice.grid && voice.grid.estimatedKey) || 'C'}
                      options={KEY_OPTIONS}
                      onChange={function(key) {
                        props.onPatchVoice(voice.id, { grid: { estimatedKey: key } });
                      }}
                    />
                  </td>
                  <td onClick={function(e) { e.stopPropagation(); }}>
                    <Form.Select
                      size="sm"
                      className="midi-import-clef-select"
                      value={voice.staff || 'auto'}
                      onChange={function(e) {
                        props.onPatchVoice(voice.id, { staff: e.target.value });
                      }}
                      aria-label="Clef"
                    >
                      {STAFF_OPTIONS.map(function(staff) {
                        return <option key={staff} value={staff}>{staff}</option>;
                      })}
                    </Form.Select>
                  </td>
                  <td className="text-end text-muted small align-middle">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Done</Button>
      </Modal.Footer>
    </Modal>
  );
}
