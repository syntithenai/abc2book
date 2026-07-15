import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { DEFAULT_QUANTIZE_STRENGTH, DEFAULT_SNAP_SLOTS_PER_BEAT } from '../notation/notationConstants';

export default function QuantizeDialog(props) {
  const { show, onHide, onApply } = props;
  const [strength, setStrength] = useState(DEFAULT_QUANTIZE_STRENGTH);
  const [slotsPerBeat, setSlotsPerBeat] = useState(DEFAULT_SNAP_SLOTS_PER_BEAT);
  const [quantizeStart, setQuantizeStart] = useState(true);
  const [quantizeDuration, setQuantizeDuration] = useState(true);

  return (
    <Modal show={show} onHide={onHide} size="sm">
      <Modal.Header closeButton><Modal.Title>Quantize</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-2">
          <Form.Label>Strength ({Math.round(strength * 100)}%)</Form.Label>
          <Form.Range min={0} max={1} step={0.05} value={strength} onChange={function(e) { setStrength(parseFloat(e.target.value)); }} />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Grid subdivision</Form.Label>
          <Form.Select value={slotsPerBeat} onChange={function(e) { setSlotsPerBeat(parseInt(e.target.value, 10)); }}>
            <option value={1}>1/4 beat</option>
            <option value={2}>1/8 beat</option>
            <option value={4}>1/16 beat</option>
            <option value={8}>1/32 beat</option>
          </Form.Select>
        </Form.Group>
        <Form.Check type="checkbox" label="Quantize start" checked={quantizeStart} onChange={function(e) { setQuantizeStart(e.target.checked); }} />
        <Form.Check type="checkbox" label="Quantize duration" checked={quantizeDuration} onChange={function(e) { setQuantizeDuration(e.target.checked); }} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" onClick={function() {
          onApply({
            strength: strength,
            slotsPerBeat: slotsPerBeat,
            quantizeStart: quantizeStart,
            quantizeDuration: quantizeDuration,
          });
        }}>Apply</Button>
      </Modal.Footer>
    </Modal>
  );
}
