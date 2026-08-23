import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

export default function MidiImportDuplicateDialog(props) {
  const [voiceId, setVoiceId] = useState('');
  const voices = props.voices || [];

  return (
    <Modal show={props.show} onHide={props.onHide} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title>Duplicate track</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Select value={voiceId} onChange={function(e) { setVoiceId(e.target.value); }}>
          <option value="">Select track…</option>
          {voices.map(function(v) {
            return (
              <option key={v.id} value={v.id}>
                {v.displayName} ({props.noteCountFor && props.noteCountFor(v)} notes)
              </option>
            );
          })}
        </Form.Select>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" disabled={!voiceId}
          onClick={function() { props.onDuplicate(voiceId); }}>
          Duplicate
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
