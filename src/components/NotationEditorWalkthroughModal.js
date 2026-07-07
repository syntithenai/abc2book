import React from 'react';
import { Button, Modal } from 'react-bootstrap';
import NotationEditorWalkthrough from './NotationEditorWalkthrough';

export default function NotationEditorWalkthroughModal(props) {
  return (
    <Modal
      show={props.show}
      onHide={props.onHide}
      size="xl"
      scrollable
      className="notation-editor-walkthrough-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Music editor walkthrough</Modal.Title>
      </Modal.Header>
      <Modal.Body className="notation-editor-walkthrough-modal-body">
        <NotationEditorWalkthrough onFinish={props.onHide} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
