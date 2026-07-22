import { useState, useEffect } from 'react';
import { Alert, Button, Modal, ButtonGroup, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import BookSelectorModal from './BookSelectorModal';
import FileInputButton from './FileInputButton';
import useAbcjsParser from '../useAbcjsParser';
import {
  parseChordSheetText,
  createTuneFromChordSheet,
  isChordSheetFilename,
} from '../chordProFormatUtils';

export default function ImportChordSheetModal(props) {
  const navigate = useNavigate();
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const [show, setShow] = useState(false);
  const [selectedBook, setSelectedBook] = useState(props.currentTuneBook || '');
  const [list, setList] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);
  const [preservePlacement, setPreservePlacement] = useState(true);

  useEffect(function() {
    if (props.routeMode) setShow(true);
  }, [props.routeMode]);

  useEffect(function() {
    if (props.currentTuneBook) setSelectedBook(props.currentTuneBook);
  }, [props.currentTuneBook]);

  function handleClose() {
    setMessage(null);
    setList('');
    setPreview(null);
    setError('');
    setPreservePlacement(true);
    setShow(false);
    if (props.onRouteClose) props.onRouteClose();
    if (props.closeParent) props.closeParent();
  }

  function handleShow() {
    setSelectedBook(props.currentTuneBook || '');
    setShow(true);
  }

  function selectBook(val) {
    const next = val || '';
    setSelectedBook(next);
    if (props.setCurrentTuneBook) props.setCurrentTuneBook(next);
    if (props.forceRefresh) props.forceRefresh();
    if (next) setError('');
  }

  function ensureBook() {
    if (!selectedBook) {
      setError('Select a book to import into.');
      return false;
    }
    return true;
  }

  function parseOptions() {
    return { preservePlacement: !!preservePlacement };
  }

  function buildPreview(text) {
    try {
      const parsed = parseChordSheetText(text, parseOptions());
      setPreview(parsed);
      setError('');
      return parsed;
    } catch (e) {
      setPreview(null);
      setError(e && e.message ? e.message : 'Could not parse chord sheet');
      return null;
    }
  }

  function saveTuneFromDraft(draft) {
    const bookName = String(selectedBook || '').trim();
    if (bookName && props.tunebook.indexes && props.tunebook.indexes.addBookToIndex) {
      props.tunebook.indexes.addBookToIndex(bookName);
    }
    if (props.setCurrentTuneBook) props.setCurrentTuneBook(bookName);
    const tune = createTuneFromChordSheet({
      draft: draft,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: bookName,
    });
    props.tunebook.saveTune(tune);
    return tune;
  }

  function doImport(text) {
    if (!ensureBook()) return;
    const draft = buildPreview(text);
    if (!draft) return;
    try {
      const tune = saveTuneFromDraft(draft);
      setMessage('Imported "' + (draft.title || 'Untitled') + '"');
      props.forceRefresh();
      setTimeout(function() {
        setMessage(null);
        setList('');
        setPreview(null);
        setError('');
        setShow(false);
        if (props.closeParent) props.closeParent();
        if (tune && tune.id) {
          navigate('/tunes/' + tune.id);
        } else if (props.onRouteClose) {
          props.onRouteClose();
        } else {
          navigate('/tunes');
        }
      }, 800);
    } catch (e) {
      setError(e && e.message ? e.message : 'Import failed');
    }
  }

  function fileSelected(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!isChordSheetFilename(file.name)) {
      setError('Choose a .cho, .pro, .crd, .onsong, or .txt chord sheet file.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = function() {
      const text = String(reader.result || '');
      setList(text);
      buildPreview(text);
    };
    reader.readAsText(file);
  }

  return (
    <>
      {!props.routeMode ? (
      <Button style={{ color: 'black' }} variant="primary" onClick={handleShow}>
        {props.tunebook.icons.words} Chord Sheet
      </Button>
      ) : null}

      <Modal show={show} onHide={function() {}} backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Import ChordPro / OnSong</Modal.Title>
        </Modal.Header>
        {!message ? (
          <Modal.Body>
            <div style={{ backgroundColor: 'lightblue', padding: '0.3em', marginBottom: '1em' }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5em',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid black',
                  marginBottom: '1em',
                  padding: '0.3em',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center' }}>
                  Import into&nbsp;&nbsp;
                  <ButtonGroup variant="primary" style={{ backgroundColor: '#3f81e3', borderRadius: '10px', width: 'fit-content' }}>
                    {selectedBook ? (
                      <Button onClick={function() { selectBook(''); }}>
                        {props.tunebook.icons.closecircle}
                      </Button>
                    ) : ''}
                    <BookSelectorModal
                      forceRefresh={props.forceRefresh}
                      title="Select a Book"
                      currentTuneBook={selectedBook}
                      setCurrentTuneBook={selectBook}
                      tunebook={props.tunebook}
                      value={selectedBook}
                      onChange={selectBook}
                      defaultOptions={props.tunebook.getTuneBookOptions}
                      searchOptions={props.tunebook.getSearchTuneBookOptions}
                      triggerElement={
                        <Button variant="primary">
                          {props.tunebook.icons.book} {selectedBook ? <b>{selectedBook}</b> : 'Select book'}
                        </Button>
                      }
                    />
                  </ButtonGroup>
                </div>
                <Button variant="danger" onClick={handleClose} title="Close">
                  {props.tunebook.icons.closecircle} Cancel
                </Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center' }}>
                <FileInputButton
                  label="Choose file"
                  icon={props.tunebook.icons.file}
                  accept=".cho,.pro,.crd,.onsong,.chopro,.chordpro,.txt,text/plain"
                  onChange={fileSelected}
                />
                <Button variant="outline-secondary" onClick={function() { buildPreview(list); }}>
                  Preview
                </Button>
                <Button
                  variant={list.trim() ? 'primary' : 'secondary'}
                  disabled={!list.trim()}
                  onClick={function() { doImport(list); }}
                  style={{ marginLeft: 'auto' }}
                >
                  Import
                </Button>
              </div>
            </div>
            <Form.Check
              type="checkbox"
              id="import-chordpro-preserve-placement"
              className="mb-2"
              checked={preservePlacement}
              onChange={function(e) {
                setPreservePlacement(!!e.target.checked);
                setPreview(null);
              }}
              label="Preserve chord placement in lyrics"
            />
            <div className="small text-muted mb-2">
              Keeps ChordPro [Am] markers or chords-over-words rows in the lyrics field.
              An ABC chord scaffold is still built for notation and structure.
            </div>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {preview ? (
              <Alert variant="info">
                <strong>{preview.title || 'Untitled'}</strong>
                {preview.composer ? ' — ' + preview.composer : ''}
                <div>{preview.barCount} chord bars · {preview.sectionCount} sections</div>
                {preview.preservePlacement ? (
                  <div className="small">Lyric chord placement will be preserved.</div>
                ) : (
                  <div className="small">Lyrics will be stored without inline chords (ABC chart only).</div>
                )}
                {preview.warnings && preview.warnings.length > 0 ? (
                  <div className="small text-muted">{preview.warnings.join(' ')}</div>
                ) : null}
              </Alert>
            ) : null}
            <textarea
              placeholder="Paste ChordPro or OnSong text here"
              value={list}
              onChange={function(e) { setList(e.target.value); setPreview(null); setError(''); }}
              style={{ width: '100%', minHeight: '12em' }}
            />
          </Modal.Body>
        ) : (
          <>
            <Modal.Body>{message}</Modal.Body>
            <Modal.Footer>
              <Button variant="success" onClick={handleClose}>OK</Button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </>
  );
}
