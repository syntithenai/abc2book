import React from 'react';
import { Button, Modal } from 'react-bootstrap';
import NotationEditorHelp from './NotationEditorHelp';

export default function NotationEditorHelpModal(props) {
  return (
    <Modal show={props.show} onHide={props.onHide} fullscreen scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Notation editor guide</Modal.Title>
      </Modal.Header>
      <Modal.Body className="notation-editor-help-modal-body">
        <NotationEditorHelp onOpenWalkthrough={props.onOpenWalkthrough} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
