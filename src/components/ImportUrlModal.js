import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import {
  candidatesFromImportSource,
  fetchImportSourceFromUrl,
} from '../importSourceParse';

export default function ImportUrlModal(props) {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedSource, setLoadedSource] = useState(null);
  const [tuneCount, setTuneCount] = useState(0);
  const disabled = !!props.disabled;

  function resetLoaded() {
    setLoadedSource(null);
    setTuneCount(0);
  }

  function handleClose() {
    setShow(false);
    setUrl('');
    setError('');
    setLoading(false);
    resetLoaded();
  }

  async function handlePasteUrl() {
    setError('');
    resetLoaded();
    try {
      const clip = await navigator.clipboard.readText();
      setUrl(String(clip || '').trim());
    } catch (e) {
      setError('Could not read clipboard.');
    }
  }

  async function handleLoad() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a URL.');
      return;
    }

    setLoading(true);
    setError('');
    resetLoaded();
    try {
      const source = await fetchImportSourceFromUrl({
        url: trimmed,
        driveApi: props.driveApi,
      });
      const candidates = await candidatesFromImportSource(source, {
        tunebook: props.tunebook,
        abcjsParser: props.abcjsParser,
        book: props.book,
        accessToken: props.accessToken,
        resolverAvailable: props.resolverAvailable,
      });
      if (!candidates.length) {
        throw new Error('No importable tunes found at that URL.');
      }
      setLoadedSource(source);
      setTuneCount(candidates.length);
    } catch (e) {
      setError(e && e.message ? e.message : 'Could not load URL.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!loadedSource || typeof props.onImportSource !== 'function') return;
    setError('');
    try {
      await props.onImportSource(loadedSource);
      handleClose();
    } catch (e) {
      setError(e && e.message ? e.message : 'Import failed.');
    }
  }

  return (
    <>
      <Button variant="outline-primary" disabled={disabled} onClick={function() { setShow(true); }}>
        {props.label || 'URL'}
      </Button>
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import from URL</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Paste a link to ABC, MusicXML, chord sheet, or other importable notation.
          </p>
          <Form.Group>
            <Form.Label>URL</Form.Label>
            <div className="d-flex gap-2 mb-2">
              <Button size="sm" variant="outline-secondary" disabled={loading} onClick={handlePasteUrl}>
                Paste
              </Button>
              <Button size="sm" variant="primary" disabled={loading || !url.trim()} onClick={handleLoad}>
                {loading ? 'Loading…' : 'Load'}
              </Button>
            </div>
            <Form.Control
              value={url}
              onChange={function(e) {
                setUrl(e.target.value);
                if (loadedSource) resetLoaded();
                if (error) setError('');
              }}
              placeholder="https://…"
              disabled={loading}
            />
          </Form.Group>
          {loadedSource && tuneCount > 0 && (
            <Alert variant="success" className="mt-3 mb-0">
              Loaded {tuneCount} tune{tuneCount === 1 ? '' : 's'}. Ready to import.
            </Alert>
          )}
          {error && <Alert variant="danger" className="mt-3 mb-0">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            variant="success"
            disabled={loading || !loadedSource || tuneCount === 0}
            onClick={handleImport}
          >
            Import
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
