import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import {
  DRIVE_READONLY_SCOPE,
  fetchDriveFileBlob,
  fetchDriveFileText,
  openGoogleDrivePicker,
  parseDriveFileInput,
} from '../googleDrivePickerClient';
import { isSheetImageMimeOrName } from '../importSourceParse';

function GoogleUnverifiedAppAlert() {
  return (
    <Alert variant="info" className="small mb-3">
      <strong>If Google shows &quot;Google hasn&apos;t verified this app&quot;</strong>
      <ol className="mb-0 ps-3 mt-2">
        <li>Click <strong>Advanced</strong></li>
        <li>Click <strong>Go to tunebook (unsafe)</strong> or <strong>Continue</strong></li>
      </ol>
      <div className="mt-2 text-muted">
        That warning appears because Drive access is a sensitive permission. For private use, add your Google account under
        {' '}<strong>Google Cloud Console → OAuth consent screen → Test users</strong>.
        Public use on tunebook.net requires submitting the app for Google verification.
      </div>
    </Alert>
  );
}

export default function DriveFilePickerModal(props) {
  const [show, setShow] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const usePicker = props.usePicker !== false;

  function handleClose() {
    setShow(false);
    setInput('');
    setError('');
    setLoading(false);
  }

  function handleConsentClose() {
    setShowConsent(false);
    setError('');
  }

  async function deliverImportSource(source) {
    if (typeof props.onImportSource === 'function') {
      await props.onImportSource(source);
    } else if (source.file && typeof props.onFile === 'function') {
      await props.onFile(source.file);
    } else if (source.text != null && typeof props.onFileText === 'function') {
      props.onFileText(source.text);
    }
    handleClose();
  }

  async function loadFileId(fileId) {
    if (!props.driveApi) {
      throw new Error('Google Drive is not available. Log in first.');
    }
    const meta = await new Promise(function(resolve, reject) {
      props.driveApi.getDocumentMeta(fileId).then(resolve).catch(reject);
    });
    const mime = meta && meta.mimeType ? meta.mimeType : '';
    const fileName = (meta && meta.name) || 'drive-import';
    if (isSheetImageMimeOrName(fileName, mime) && mime.indexOf('google-apps') === -1) {
      const blob = await fetchDriveFileBlob(props.driveApi, fileId);
      const file = new File([blob], fileName, { type: blob.type || mime || 'application/octet-stream' });
      await deliverImportSource({ file: file, fileName: fileName });
      return;
    }
    const text = await fetchDriveFileText(
      props.driveApi,
      fileId,
      props.token && props.token.access_token
    );
    await deliverImportSource({ text: text, fileName: fileName });
  }

  async function handleSelect() {
    setError('');
    const fileId = parseDriveFileInput(input);
    if (!fileId) {
      setError('Enter a valid Google Drive file link or file id.');
      return;
    }
    setLoading(true);
    try {
      await loadFileId(fileId);
    } catch (e) {
      setError(e.message || 'Could not load Drive file.');
      setLoading(false);
    }
  }

  async function openPicker() {
    setError('');
    if (!props.token || !props.token.access_token) {
      setError('Log in with Google first.');
      return;
    }
    setLoading(true);
    try {
      let accessToken = props.token.access_token;
      if (typeof props.requestGoogleScopes === 'function') {
        const scopeResult = await props.requestGoogleScopes([DRIVE_READONLY_SCOPE]);
        if (scopeResult && scopeResult.access_token) {
          accessToken = scopeResult.access_token;
        }
      }
      const doc = await openGoogleDrivePicker({
        accessToken: accessToken,
        title: props.title || 'Choose a Google Drive file',
        mimeTypes: props.mimeTypes,
      });
      await loadFileId(doc.id);
    } catch (e) {
      const message = e && e.message ? e.message : 'Drive picker failed.';
      if (message.indexOf('cancelled') >= 0) {
        setLoading(false);
        return;
      }
      if (/access_denied|cancel/i.test(message)) {
        setError('Google Drive access was not granted. Use Advanced → Go to tunebook (unsafe) on the Google warning screen, or add your account as a test user in Google Cloud Console.');
      } else {
        setError(message);
      }
      if (usePicker) {
        setShow(true);
      }
      setLoading(false);
    }
  }

  function handleOpen() {
    setError('');
    if (usePicker) {
      setShowConsent(true);
      return;
    }
    setShow(true);
  }

  async function handleConsentConfirm() {
    setShowConsent(false);
    setError('');
    await openPicker();
  }

  function handleRetryPicker() {
    setShow(false);
    setError('');
    setShowConsent(true);
  }

  if (!props.token) return null;

  return (
    <>
      <Button variant="outline-primary" disabled={loading || props.disabled} onClick={handleOpen}>
        {loading ? 'Opening…' : (props.label || 'Drive')}
      </Button>
      <Modal show={showConsent} onHide={function() {}} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title>{props.title || 'Choose Google Drive file'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Choose a file from your Google Drive library.
          </p>
          <GoogleUnverifiedAppAlert />
          {error ? <Alert variant="danger" className="mb-0">{error}</Alert> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleConsentClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConsentConfirm} disabled={loading}>
            {loading ? 'Opening…' : 'Choose file'}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>{props.title || 'Choose Google Drive file'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {usePicker && (
            <p className="text-muted small">
              Paste a Drive link if the file picker did not open or the file is shared with you by link.
            </p>
          )}
          <Form.Group>
            <Form.Label>Drive file link or file id</Form.Label>
            <Form.Control
              value={input}
              onChange={function(e) { setInput(e.target.value); }}
              placeholder="https://drive.google.com/file/d/..."
            />
          </Form.Group>
          {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          {usePicker && (
            <Button variant="outline-primary" disabled={loading} onClick={handleRetryPicker}>
              Open picker
            </Button>
          )}
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" disabled={loading} onClick={handleSelect}>
            {loading ? 'Loading…' : 'Load'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
