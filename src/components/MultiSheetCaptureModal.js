import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import SheetImageCameraModal from './SheetImageCameraModal';
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal';
import { transcribeSheetImageFile } from '../sheetImageTranscriptionClient';
import { createTuneFromSheetImageImport } from '../sheetImageImportUtils';

function emptyPage() {
  return {
    id: 'page-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    blob: null,
    previewUrl: '',
    fileName: '',
    titles: [''],
  };
}

function segmentPagesByTitles(pages, results) {
  const songs = [];
  let currentKey = null;
  let currentPages = [];
  let currentResults = [];

  function flush() {
    if (currentPages.length === 0) return;
    songs.push({
      titleHints: currentKey ? [currentKey] : [],
      pages: currentPages.slice(),
      results: currentResults.slice(),
    });
    currentPages = [];
    currentResults = [];
  }

  pages.forEach(function(page, index) {
    const hints = (page.titles || []).map(function(t) { return String(t || '').trim(); }).filter(Boolean);
    if (hints.length >= 2) {
      flush();
      hints.forEach(function(title, hintIndex) {
        songs.push({
          titleHints: [title],
          pages: [page],
          results: [results[index]],
          multiOnPage: true,
          hintIndex: hintIndex,
        });
      });
      currentKey = null;
      return;
    }
    const title = hints[0] || '';
    if (title && title !== currentKey) {
      flush();
      currentKey = title;
    }
    if (!title && !currentKey) {
      flush();
    }
    currentPages.push(page);
    currentResults.push(results[index]);
    if (title) currentKey = title;
  });
  flush();
  return songs;
}

export default function MultiSheetCaptureModal(props) {
  const [show, setShow] = useState(false);
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showGooglePhotos, setShowGooglePhotos] = useState(false);
  const fileInputRef = useRef(null);

  function handleClose() {
    if (busy) return;
    setShow(false);
    setPages([]);
    setError('');
    setStatus('');
  }

  function addPageFromFile(file) {
    const previewUrl = URL.createObjectURL(file);
    setPages(function(prev) {
      return prev.concat([Object.assign(emptyPage(), {
        blob: file,
        previewUrl: previewUrl,
        fileName: file.name || 'capture.jpg',
      })]);
    });
  }

  function updatePageTitle(pageId, titleIndex, value) {
    setPages(function(prev) {
      return prev.map(function(page) {
        if (page.id !== pageId) return page;
        const titles = page.titles.slice();
        titles[titleIndex] = value;
        return Object.assign({}, page, { titles: titles });
      });
    });
  }

  function addTitleField(pageId) {
    setPages(function(prev) {
      return prev.map(function(page) {
        if (page.id !== pageId) return page;
        return Object.assign({}, page, { titles: page.titles.concat(['']) });
      });
    });
  }

  function removePage(pageId) {
    setPages(function(prev) { return prev.filter(function(p) { return p.id !== pageId; }); });
  }

  async function handleTranscribe() {
    if (!pages.length || !props.tunebook) return;
    setBusy(true);
    setError('');
    const results = [];
    try {
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        setStatus('Transcribing page ' + (i + 1) + ' of ' + pages.length + '…');
        const file = page.blob instanceof File
          ? page.blob
          : new File([page.blob], page.fileName || 'page.jpg', { type: (page.blob && page.blob.type) || 'image/jpeg' });
        const body = await transcribeSheetImageFile({
          file: file,
          accessToken: props.token && props.token.access_token,
          titleHints: (page.titles || []).map(function(t) { return String(t || '').trim(); }).filter(Boolean),
        });
        results.push(body);
      }
      const groups = segmentPagesByTitles(pages, results);
      const candidates = groups.map(function(group) {
        const primary = group.results[0] || {};
        const titleHint = group.titleHints && group.titleHints[0] ? group.titleHints[0] : '';
        const mergedResult = Object.assign({}, primary, {
          title: titleHint || primary.title || '',
        });
        const tune = createTuneFromSheetImageImport({
          result: mergedResult,
          tunebook: props.tunebook,
          abcjsParser: props.abcjsParser,
          book: props.currentTuneBook,
          titleOverride: titleHint || undefined,
        });
        const firstPage = Array.isArray(group.pageIndexes) && pages[group.pageIndexes[0]]
          ? pages[group.pageIndexes[0]]
          : pages[0];
        const candidate = { tune: tune, sourceKind: 'sheetimage' };
        if (firstPage && firstPage.blob) {
          candidate.pendingFile = {
            name: firstPage.fileName || 'Sheet capture.jpg',
            type: (firstPage.blob && firstPage.blob.type) || 'image/jpeg',
            blob: firstPage.blob,
            source: 'import',
          };
        }
        return candidate;
      });
      if (typeof props.onCandidates === 'function') props.onCandidates(candidates);
      handleClose();
    } catch (e) {
      setError(e.message || 'Transcription failed');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  if (!props.resolverAvailable) return null;

  return (
    <>
      <Button variant="outline-primary" onClick={function() { setShow(true); }}>
        Capture
      </Button>
      <Modal show={show} onHide={handleClose} fullscreen backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Capture sheet images</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', marginBottom: '1em' }}>
            <Button variant="outline-secondary" disabled={busy} onClick={function() { setShowCamera(true); }}>Camera</Button>
            <Button variant="outline-secondary" disabled={busy} onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}>Gallery</Button>
            <Button variant="outline-secondary" disabled={busy} onClick={function() { setShowGooglePhotos(true); }}>Google Photos</Button>
            <Button variant="success" disabled={busy || pages.length === 0} style={{ marginLeft: 'auto' }} onClick={handleTranscribe}>
              Transcribe
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            style={{ display: 'none' }}
            onChange={function(e) {
              const files = e.target.files;
              if (!files) return;
              Array.from(files).forEach(function(file) {
                addPageFromFile(file);
              });
              e.target.value = '';
            }}
          />
          {status && <div className="mb-2"><Spinner animation="border" size="sm" className="me-2" />{status}</div>}
          {error && <Alert variant="danger">{error}</Alert>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1em' }}>
            {pages.map(function(page) {
              return (
                <div key={page.id} style={{ width: '220px', border: '1px solid #ccc', padding: '0.5em', borderRadius: '6px' }}>
                  {page.previewUrl && <img src={page.previewUrl} alt="" style={{ width: '100%', height: '140px', objectFit: 'cover' }} />}
                  {page.titles.map(function(title, idx) {
                    return (
                      <Form.Control
                        key={idx}
                        size="sm"
                        className="mt-1"
                        placeholder="Song title hint"
                        value={title}
                        onChange={function(e) { updatePageTitle(page.id, idx, e.target.value); }}
                      />
                    );
                  })}
                  <div style={{ display: 'flex', gap: '0.3em', marginTop: '0.3em' }}>
                    <Button size="sm" variant="link" onClick={function() { addTitleField(page.id); }}>+ title</Button>
                    <Button size="sm" variant="link" className="text-danger" onClick={function() { removePage(page.id); }}>Remove</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>
      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false); }}
        onCapture={function(file) {
          addPageFromFile(file);
          setShowCamera(false);
        }}
      />
      <SheetImageGooglePhotosModal
        show={showGooglePhotos}
        onHide={function() { setShowGooglePhotos(false); }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        onLogin={props.login}
        onSelectFile={function(file) {
          addPageFromFile(file);
          setShowGooglePhotos(false);
        }}
      />
    </>
  );
}
