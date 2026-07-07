import React from 'react';
import { Modal, Button } from 'react-bootstrap';

export default function DeleteVoiceConfirmModal(props) {
  const { show, voiceLabel, onHide, onConfirm } = props;
  return (
    <Modal show={show} onHide={onHide} size="sm">
      <Modal.Header closeButton>
        <Modal.Title>Delete voice</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Delete <strong>{voiceLabel || 'this voice'}</strong>? This cannot be undone.
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>Delete voice</Button>
      </Modal.Footer>
    </Modal>
  );
}
