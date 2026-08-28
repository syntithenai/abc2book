import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { readClipboardPasteEvent, readSystemClipboard } from '../clipboardImport';

export default function PasteImportModal(props) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const disabled = !!props.disabled;
  const hideTrigger = !!props.hideTrigger;
  const canImport = text.trim().length > 0 || files.length > 0;

  useEffect(function() {
    if (!props.openSignal) return undefined;
    setShow(true);
    return undefined;
  }, [props.openSignal]);

  function handleClose() {
    setShow(false);
    setText('');
    setFiles([]);
    setError('');
  }

  function applyClipboardContent(content) {
    if (!content) return;
    if (content.files && content.files.length > 0) {
      setFiles(content.files);
      setText('');
      return;
    }
    if (content.text) {
      setText(String(content.text));
      setFiles([]);
    }
  }

  async function handlePaste() {
    setError('');
    try {
      applyClipboardContent(await readSystemClipboard());
    } catch (e) {
      setError('Could not read clipboard.');
    }
  }

  function handlePasteEvent(event) {
    const content = readClipboardPasteEvent(event);
    if (!content.files || content.files.length === 0) return;
    event.preventDefault();
    setError('');
    setFiles(function(prev) { return prev.concat(content.files); });
    setText('');
  }

  useEffect(function() {
    if (!show) return undefined;
    document.addEventListener('paste', handlePasteEvent);
    return function() {
      document.removeEventListener('paste', handlePasteEvent);
    };
  }, [show]);

  function handleImport() {
    if (!canImport) return;
    if (files.length > 0 && typeof props.onImportFiles === 'function') {
      props.onImportFiles(files);
    } else if (text.trim() && typeof props.onImportText === 'function') {
      props.onImportText(text);
    }
    handleClose();
  }

  return (
    <>
      {!hideTrigger ? (
        <Button variant="outline-primary" disabled={disabled} onClick={function() { setShow(true); }}>
          {props.label || 'Paste'}
        </Button>
      ) : null}
      <Modal show={show} onHide={handleClose} fullscreen backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Paste import</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ display: 'flex', flexDirection: 'column', gap: '0.75em' }}>
          <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={handlePaste}>Paste</Button>
            {canImport && <Button variant="success" onClick={handleImport}>Import</Button>}
          </div>
          {error && <div className="text-danger">{error}</div>}
          {files.length > 0 && (
            <div>
              <strong>Pasted files</strong>
              <ul style={{ marginBottom: 0 }}>
                {files.map(function(file, index) {
                  return (
                    <li key={file.name + '-' + index}>
                      {file.name}{file.type ? ' (' + file.type + ')' : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Form.Control
            as="textarea"
            value={text}
            onChange={function(e) { setText(e.target.value); }}
            style={{ flex: 1, minHeight: '70vh', fontFamily: 'monospace' }}
            placeholder="Paste ABC, MusicXML, chord sheets, images, audio, or other importable files..."
          />
        </Modal.Body>
      </Modal>
    </>
  );
}
