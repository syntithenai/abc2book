import { useState, useEffect, useRef } from 'react';
import { Alert, Button, Modal, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import BookSelectorModal from './BookSelectorModal';
import FileInputButton from './FileInputButton';
import SheetImageCameraModal from './SheetImageCameraModal';
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal';
import SheetImageImportMergeModal from './SheetImageImportMergeModal';
import SearchProgressBar from './SearchProgressBar';
import SheetImageTranscriptionPanel from './SheetImageTranscriptionPanel';
import useAbcjsParser from '../useAbcjsParser';
import { transcribeSheetImageFile } from '../sheetImageTranscriptionClient';
import { buildDraftFromSheetImageResult, createTuneFromSheetImageImport } from '../sheetImageImportUtils';
import { formatSheetImageWarnings, formatSheetImageProgressMessage } from '../sheetImageFormatUtils';
import { composerHintFromFile } from '../pdfSheetImportUtils';
import { parseChordSheetText } from '../chordProFormatUtils';

const ACCEPTED_TYPES = 'image/*,application/pdf,.pdf';

export default function ImportSheetImageModal(props) {
  const navigate = useNavigate();
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const transcribeAbortRef = useRef(null);
  const [show, setShow] = useState(false);
  const [selectedBook, setSelectedBook] = useState(props.currentTuneBook || '');
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);
  const [chordText, setChordText] = useState('');
  const [melodyAbc, setMelodyAbc] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaArtist, setMetaArtist] = useState('');
  const [metaAliases, setMetaAliases] = useState([]);
  const [metaKey, setMetaKey] = useState('');
  const [metaMeter, setMetaMeter] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progressState, setProgressState] = useState(null);
  const [activeTab, setActiveTab] = useState('chords');
  const [showCamera, setShowCamera] = useState(false);
  const [showGooglePhotos, setShowGooglePhotos] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  useEffect(function() {
    if (props.routeMode) setShow(true);
  }, [props.routeMode]);

  useEffect(function() {
    if (props.currentTuneBook) setSelectedBook(props.currentTuneBook);
  }, [props.currentTuneBook]);

  function abortTranscription() {
    if (transcribeAbortRef.current) {
      transcribeAbortRef.current.abort();
      transcribeAbortRef.current = null;
    }
  }

  function resetTranscriptionState() {
    abortTranscription();
    setSelectedFile(null);
    setResult(null);
    setChordText('');
    setMelodyAbc('');
    setMetaTitle('');
    setMetaArtist('');
    setMetaAliases([]);
    setMetaKey('');
    setMetaMeter('');
    setPreview(null);
    setError('');
    setBusy(false);
    setProgressState(null);
    setActiveTab('chords');
    setShowMergeModal(false);
  }

  function handleClose() {
    abortTranscription();
    setMessage(null);
    resetTranscriptionState();
    setShowCamera(false);
    setShowGooglePhotos(false);
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

  function buildPreviewFromState(nextChordText, nextMelodyAbc, baseResult, meta) {
    if (!baseResult) {
      setPreview(null);
      return null;
    }
    const useMeta = meta || {
      title: metaTitle,
      artist: metaArtist,
      key: metaKey,
      meter: metaMeter,
    };
    const merged = Object.assign({}, baseResult, {
      title: useMeta.title,
      artist: useMeta.artist,
      chordSheet: Object.assign({}, baseResult.chordSheet, { text: nextChordText }),
      melody: nextMelodyAbc
        ? Object.assign({}, baseResult.melody || {}, {
          abc: nextMelodyAbc,
          key: useMeta.key || (baseResult.melody && baseResult.melody.key) || '',
          meter: useMeta.meter || (baseResult.melody && baseResult.melody.meter) || '',
        })
        : (useMeta.key || useMeta.meter
          ? { key: useMeta.key, meter: useMeta.meter, abc: '' }
          : null),
    });
    try {
      const draft = buildDraftFromSheetImageResult(merged);
      const chordPreview = draft.chordDraft;
      setPreview({
        title: useMeta.title || (chordPreview && chordPreview.title) || 'Untitled',
        composer: useMeta.artist || (chordPreview && chordPreview.composer) || '',
        key: useMeta.key || (chordPreview && chordPreview.key) || '',
        meter: useMeta.meter || (chordPreview && chordPreview.meter) || '',
        pageType: merged.pageType,
        barCount: chordPreview ? chordPreview.barCount : 0,
        sectionCount: chordPreview ? chordPreview.sectionCount : 0,
        hasMelody: !!String(nextMelodyAbc || '').trim(),
        warnings: formatSheetImageWarnings(draft.warnings || []),
      });
      setError('');
      return draft;
    } catch (e) {
      setPreview(null);
      setError(e && e.message ? e.message : 'Could not preview import');
      return null;
    }
  }

  function applyTranscriptionResult(body) {
    setResult(body);
    const nextChordText = body.chordSheet && body.chordSheet.text ? body.chordSheet.text : '';
    const nextMelodyAbc = body.melody && body.melody.abc ? body.melody.abc : '';
    const meta = body.meta || {};
    const nextTitle = body.title || meta.title || '';
    const nextArtist = body.artist || meta.artist || meta.composer || '';
    const nextKey = (body.melody && body.melody.key) || meta.key || '';
    const nextMeter = (body.melody && body.melody.meter) || '';
    const format = body.sheetFormat || body.pageType || 'unknown';
    setChordText(nextChordText);
    setMelodyAbc(nextMelodyAbc);
    setMetaTitle(nextTitle);
    setMetaArtist(nextArtist);
    setMetaKey(nextKey);
    setMetaMeter(nextMeter);
    setActiveTab(nextChordText || format === 'lyrics_only' || format === 'chord_chart' ? 'chords' : 'melody');
    buildPreviewFromState(nextChordText, nextMelodyAbc, body, {
      title: nextTitle,
      artist: nextArtist,
      key: nextKey,
      meter: nextMeter,
    });
  }

  async function transcribeSelectedFile(file) {
    if (!file) return;
    abortTranscription();
    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    setBusy(true);
    setError('');
    setProgressState({
      message: 'Starting transcription...',
      progress: 0.01,
      stage: 'start',
      estimatedTotalSeconds: 90,
      elapsedSeconds: 0,
    });
    try {
      const body = await transcribeSheetImageFile({
        file: file,
        accessToken: props.token,
        signal: controller.signal,
        composerHint: composerHintFromFile(file),
        onProgress: setProgressState,
      });
      if (controller.signal.aborted) return;
      setProgressState({
        message: 'Transcription complete',
        progress: 1,
        stage: 'done',
        estimatedTotalSeconds: 0,
        elapsedSeconds: 0,
      });
      applyTranscriptionResult(body);
    } catch (e) {
      if (controller.signal.aborted || (e && e.name === 'AbortError')) {
        return;
      }
      setResult(null);
      setPreview(null);
      setError(e && e.message ? e.message : 'Transcription failed');
    } finally {
      if (transcribeAbortRef.current === controller) {
        transcribeAbortRef.current = null;
      }
      setBusy(false);
      setProgressState(null);
    }
  }

  function fileSelected(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    beginTranscription(files[0]);
  }

  function beginTranscription(file) {
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setPreview(null);
    setChordText('');
    setMelodyAbc('');
    setMetaTitle('');
    setMetaArtist('');
    setMetaAliases([]);
    setMetaKey('');
    setMetaMeter('');
    transcribeSelectedFile(file);
  }

  function openImportOptions() {
    if (!ensureBook()) return;
    if (!result) {
      setError('Transcribe an image first.');
      return;
    }
    const trimmedChord = chordText.trim();
    const trimmedMelody = melodyAbc.trim();
    if (!trimmedChord && !trimmedMelody) {
      setError('No chords, lyrics, or melody to import.');
      return;
    }
    setShowMergeModal(true);
  }

  function stopAccidentalPlayback() {
    if (props.mediaController && props.mediaController.stop) {
      props.mediaController.stop();
    } else if (props.mediaController && props.mediaController.pause) {
      props.mediaController.pause();
    }
  }

  function completeImport(mergeOptions) {
    const trimmedChord = chordText.trim();
    const trimmedMelody = melodyAbc.trim();
    const bookName = String(selectedBook || '').trim();
    try {
      if (mergeOptions.chordsLyrics && trimmedChord) {
        parseChordSheetText(trimmedChord);
      }
      if (bookName && props.tunebook.indexes && props.tunebook.indexes.addBookToIndex) {
        props.tunebook.indexes.addBookToIndex(bookName);
      }
      if (props.setCurrentTuneBook) props.setCurrentTuneBook(bookName);
      const tune = createTuneFromSheetImageImport({
        result: result,
        tunebook: props.tunebook,
        abcjsParser: abcjsParser,
        book: bookName,
        chordTextOverride: trimmedChord,
        melodyAbcOverride: trimmedMelody,
        titleOverride: metaTitle,
        artistOverride: metaArtist,
        keyOverride: metaKey,
        meterOverride: metaMeter,
        mergeOptions: mergeOptions,
      });
      if (metaAliases.length > 0) tune.aliases = metaAliases.slice();
      props.tunebook.saveTune(tune);
      setMessage('Imported "' + (tune.name || 'Untitled') + '"');
      props.forceRefresh();
      setTimeout(function() {
        setShowMergeModal(false);
      }, 100);
      setTimeout(function() {
        stopAccidentalPlayback();
        abortTranscription();
        setMessage(null);
        resetTranscriptionState();
        setShowCamera(false);
        setShowGooglePhotos(false);
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
      setShowMergeModal(false);
      setError(e && e.message ? e.message : 'Import failed');
    }
  }

  const icons = props.tunebook.icons;

  return (
    <>
      {!props.routeMode ? (
      <Button style={{ color: 'black' }} variant="primary" onClick={handleShow}>
        {icons.camera} Sheet Image
      </Button>
      ) : null}

      <Modal
        show={show}
        onHide={function() {}}
        backdrop="static"
        keyboard={false}
        size="lg"
      >
        <Modal.Header>
          <Modal.Title>Import chord sheet / lead sheet image</Modal.Title>
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
                        {icons.closecircle}
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
                          {icons.book} {selectedBook ? <b>{selectedBook}</b> : 'Select book'}
                        </Button>
                      }
                    />
                  </ButtonGroup>
                </div>
                <Button variant="danger" onClick={handleClose} disabled={busy} title="Close">
                  {icons.closecircle} Cancel
                </Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignItems: 'center' }}>
                <FileInputButton
                  label={selectedFile ? 'Choose another image' : 'Choose image or PDF'}
                  icon={icons.file}
                  accept={ACCEPTED_TYPES}
                  onChange={fileSelected}
                  disabled={busy}
                />
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={function() { setShowCamera(true); }}
                  title="Capture a photo with your camera"
                >
                  {icons.camera} Capture
                </Button>
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={function() { setShowGooglePhotos(true); }}
                  title="Pick a photo from your Google Photos library"
                >
                  {icons.image} Google Photos
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !result}
                  onClick={openImportOptions}
                  style={{ marginLeft: 'auto' }}
                >
                  Import
                </Button>
              </div>
              <SearchProgressBar
                visible={busy}
                percent={progressState ? Math.round((progressState.progress || 0) * 100) : 0}
                message={formatSheetImageProgressMessage(progressState)}
                defaultMessage="Transcribing sheet image..."
              />
            </div>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {result ? (
              <SheetImageTranscriptionPanel
                fileName={selectedFile && selectedFile.name}
                result={result}
                chordText={chordText}
                melodyAbc={melodyAbc}
                metaTitle={metaTitle}
                metaArtist={metaArtist}
                metaAliases={metaAliases}
                metaKey={metaKey}
                metaMeter={metaMeter}
                activeTab={activeTab}
                preview={preview}
                aliasesControlId="sheet-image-aliases"
                onMetaChange={function(meta) {
                  setMetaTitle(meta.title || '');
                  setMetaArtist(meta.artist || '');
                  setMetaAliases(Array.isArray(meta.aliases) ? meta.aliases : []);
                  setMetaKey(meta.key || '');
                  setMetaMeter(meta.meter || '');
                  buildPreviewFromState(chordText, melodyAbc, result, meta);
                }}
                onChordTextChange={function(next) {
                  setChordText(next);
                  buildPreviewFromState(next, melodyAbc, result);
                }}
                onMelodyAbcChange={function(next) {
                  setMelodyAbc(next);
                  buildPreviewFromState(chordText, next, result);
                }}
                onActiveTabChange={setActiveTab}
                onApply={function() { setShowMergeModal(true); }}
              />
            ) : (
              <Alert variant="secondary">
                Upload a photo or scan of a chord chart or lead sheet. The resolver will extract lyrics, chords, and melody notation when present.
              </Alert>
            )}
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

      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false); }}
        onCapture={beginTranscription}
      />
      <SheetImageGooglePhotosModal
        show={showGooglePhotos}
        onHide={function() { setShowGooglePhotos(false); }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        onLogin={props.login}
        onSelectFile={beginTranscription}
      />
      <SheetImageImportMergeModal
        show={showMergeModal}
        onHide={function() { setShowMergeModal(false); }}
        result={result}
        title={metaTitle}
        artist={metaArtist}
        keyName={metaKey}
        meter={metaMeter}
        chordText={chordText}
        melodyAbc={melodyAbc}
        onConfirm={completeImport}
      />
    </>
  );
}
