import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

export default function MidiImportMergeVoicesDialog(props) {
  const [voiceA, setVoiceA] = useState('');
  const [voiceB, setVoiceB] = useState('');
  const voices = props.voices || [];

  function canMerge() {
    if (!voiceA || !voiceB || voiceA === voiceB) return false;
    const a = voices.find(function(v) { return v.id === voiceA; });
    const b = voices.find(function(v) { return v.id === voiceB; });
    if (!a || !b) return false;
    return a.isDrum === b.isDrum;
  }

  return (
    <Modal show={props.show} onHide={props.onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Merge voices</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">Join note events from two voices into one import voice.</p>
        <Form.Group className="mb-2">
          <Form.Label>Voice 1</Form.Label>
          <Form.Select value={voiceA} onChange={function(e) { setVoiceA(e.target.value); }}>
            <option value="">Select…</option>
            {voices.map(function(v) {
              return (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.sourceTrackIds.length} track(s))
                </option>
              );
            })}
          </Form.Select>
        </Form.Group>
        <Form.Group>
          <Form.Label>Voice 2</Form.Label>
          <Form.Select value={voiceB} onChange={function(e) { setVoiceB(e.target.value); }}>
            <option value="">Select…</option>
            {voices.map(function(v) {
              return (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.sourceTrackIds.length} track(s))
                </option>
              );
            })}
          </Form.Select>
        </Form.Group>
        {voiceA && voiceB && !canMerge() && (
          <p className="text-danger small mt-2">Cannot merge drum and pitched voices together.</p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" disabled={!canMerge()}
          onClick={function() { props.onMerge(voiceA, voiceB); }}>
          Merge
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
