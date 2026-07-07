import { useState, useEffect } from 'react';
import { Alert, Button, Form, Modal, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import BookSelectorModal from './BookSelectorModal';
import useAbcjsParser from '../useAbcjsParser';
import { searchChords } from '../chordsSearchClient';
import { createTuneFromChordSheet } from '../chordProFormatUtils';
import SearchResultPickerModal from './SearchResultPickerModal';
import SearchProgressBar from './SearchProgressBar';
import TuneAliasesField from './TuneAliasesField';
import ComposerSearchButton from './ComposerSearchButton';
import { useCancellableAsyncJob } from '../useCancellableAsyncJob';

function parseBulkLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  const dash = trimmed.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (dash) {
    return { title: dash[1].trim(), artist: dash[2].trim() };
  }
  return { title: trimmed, artist: '' };
}

export default function ImportChordUrlModal(props) {
  const navigate = useNavigate();
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const job = useCancellableAsyncJob('Chord import search');
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [aliases, setAliases] = useState([]);
  const [bulkText, setBulkText] = useState('');
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [pickerCandidates, setPickerCandidates] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');

  useEffect(function() {
    if (props.routeMode) setShow(true);
  }, [props.routeMode]);

  function handleClose() {
    setShow(false);
    setError('');
    setBulkStatus('');
    if (props.onRouteClose) props.onRouteClose();
    if (props.closeParent) props.closeParent();
  }

  function handleShow() {
    setShow(true);
  }

  function ensureBook() {
    if (!props.currentTuneBook) {
      setError('Select a book to import into.');
      return false;
    }
    return true;
  }

  function importFromChordResult(result) {
    const draft = {
      title: result.title || title || 'Untitled',
      composer: result.artist || artist || '',
      key: '',
      capo: 0,
      tempo: 100,
      meter: '4/4',
      lyricLines: result.lyricLines || [],
      chordText: result.chordText || '',
      chordProSource: '',
      warnings: [],
    };
    const tune = createTuneFromChordSheet({
      draft: draft,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: props.currentTuneBook,
    });
    if (result.sourceUrl) tune.srcUrl = result.sourceUrl;
    if (Array.isArray(aliases) && aliases.length > 0) tune.aliases = aliases.slice();
    props.tunebook.saveTune(tune);
    props.forceRefresh();
    return tune;
  }

  async function runSearch(searchOptions) {
    if (!ensureBook()) return;
    const ctx = job.begin();
    setError('');
    setProgressMessage('');
    setProgressPercent(0);
    try {
      const result = await searchChords(Object.assign({}, searchOptions, {
        accessToken: props.token,
        signal: ctx.signal,
        onProgress: function(message, progress) {
          if (!ctx.isCurrent()) return;
          setProgressMessage(message || '');
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))));
          }
        },
      }));
      if (!ctx.isCurrent()) return;
      if (result.multiple && Array.isArray(result.candidates) && result.candidates.length > 1) {
        setPickerCandidates(result.candidates);
        setShowPicker(true);
        return;
      }
      const chosen = result.multiple ? result.candidates[0] : result;
      importFromChordResult(chosen);
      handleClose();
      navigate('/tunes');
    } catch (e) {
      if (job.isAbortError(e)) return;
      setError(e && e.message ? e.message : 'Chord import failed');
    } finally {
      job.finish(ctx.generation);
      if (ctx.isCurrent()) setProgressMessage('');
    }
  }

  function chooseCandidate(candidate) {
    setShowPicker(false);
    setPickerCandidates([]);
    if (!ensureBook()) return;
    importFromChordResult(candidate);
    handleClose();
    navigate('/tunes');
  }

  async function runBulkImport() {
    if (!ensureBook()) return;
    const lines = bulkText.split('\n').map(parseBulkLine).filter(Boolean);
    if (!lines.length) {
      setError('Enter URLs or title — artist lines.');
      return;
    }
    setBulkStatus('');
    setError('');
    let imported = 0;
    for (let i = 0; i < lines.length; i++) {
      const item = lines[i];
      setBulkStatus('Importing ' + (i + 1) + ' of ' + lines.length + '…');
      try {
        const result = await searchChords({
          title: item.title || '',
          artist: item.artist || '',
          url: item.url || '',
          accessToken: props.token,
        });
        const chosen = result.multiple && result.candidates && result.candidates.length
          ? result.candidates[0]
          : result;
        importFromChordResult(chosen);
        imported += 1;
      } catch (e) {
        setError('Failed on line ' + (i + 1) + ': ' + (e && e.message ? e.message : 'unknown error'));
        break;
      }
    }
    if (imported > 0) {
      props.forceRefresh();
      setBulkStatus('Imported ' + imported + ' tune(s).');
      if (imported === lines.length) {
        setTimeout(function() {
          handleClose();
          navigate('/tunes');
        }, 800);
      }
    }
  }

  return (
    <>
      {!props.routeMode ? (
      <Button style={{ color: 'black' }} variant="primary" onClick={handleShow}>
        {props.tunebook.icons.link} Chord Sites
      </Button>
      ) : null}

      <Modal show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Import from chord sites</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{ borderBottom: '1px solid #ccc', marginBottom: '1em', paddingBottom: '0.5em' }}>
            Import into&nbsp;
            <ButtonGroup>
              {props.currentTuneBook ? (
                <Button size="sm" onClick={function() { props.setCurrentTuneBook(''); props.forceRefresh(); }}>
                  {props.tunebook.icons.closecircle}
                </Button>
              ) : null}
              <BookSelectorModal
                forceRefresh={props.forceRefresh}
                title="Select a Book"
                currentTuneBook={props.currentTuneBook}
                setCurrentTuneBook={props.setCurrentTuneBook}
                tunebook={props.tunebook}
                value={props.currentTuneBook}
                onChange={function(val) { props.setCurrentTuneBook(val); props.forceRefresh(); }}
                defaultOptions={props.tunebook.getTuneBookOptions}
                searchOptions={props.tunebook.getSearchTuneBookOptions}
                triggerElement={
                  <Button size="sm" variant="primary">
                    {props.tunebook.icons.book} {props.currentTuneBook || 'Select book'}
                  </Button>
                }
              />
            </ButtonGroup>
          </div>

          <Form.Group className="mb-3">
            <div className="d-flex gap-2 mb-2">
              <Button size="sm" variant={mode === 'url' ? 'primary' : 'outline-primary'} onClick={function() { setMode('url'); }}>URL</Button>
              <Button size="sm" variant={mode === 'title' ? 'primary' : 'outline-primary'} onClick={function() { setMode('title'); }}>Search</Button>
              <Button size="sm" variant={mode === 'bulk' ? 'primary' : 'outline-primary'} onClick={function() { setMode('bulk'); }}>Bulk</Button>
            </div>
          </Form.Group>

          {mode === 'url' ? (
            <>
              <Form.Control
                placeholder="https://tabs.ultimate-guitar.com/… or e-chords.com/…"
                value={url}
                onChange={function(e) { setUrl(e.target.value); }}
              />
              <Button className="mt-2" variant="success" disabled={job.busy || !url.trim()} onClick={function() { runSearch({ url: url.trim() }); }}>
                Import URL
              </Button>
            </>
          ) : null}

          {mode === 'title' ? (
            <>
              <Form.Control className="mb-2" placeholder="Song title" value={title} onChange={function(e) { setTitle(e.target.value); }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
                <span className="text-muted small">Artist</span>
                <ComposerSearchButton
                  title={title}
                  composer={artist}
                  titleHint={title}
                  token={props.token}
                  tunebook={props.tunebook}
                  disabled={!title.trim()}
                  inline={true}
                  onComposer={function(result) {
                    if (result && result.artist) setArtist(result.artist)
                  }}
                />
              </div>
              <Form.Control className="mb-2" placeholder="Artist (optional)" value={artist} onChange={function(e) { setArtist(e.target.value); }} />
              <TuneAliasesField
                value={aliases}
                onChange={function(next) { setAliases(next); }}
                controlId="import-chord-aliases"
              />
              <Button variant="success" disabled={job.busy || !title.trim()} onClick={function() { runSearch({ title: title.trim(), artist: artist.trim() }); }}>
                Search and import
              </Button>
            </>
          ) : null}

          {mode === 'bulk' ? (
            <>
              <Form.Control
                as="textarea"
                rows={6}
                placeholder={'One per line:\nhttps://tabs.ultimate-guitar.com/…\nWonderwall — Oasis'}
                value={bulkText}
                onChange={function(e) { setBulkText(e.target.value); }}
              />
              <Button className="mt-2" variant="success" disabled={job.busy || !bulkText.trim()} onClick={runBulkImport}>
                Import all
              </Button>
              {bulkStatus ? <div className="mt-2 text-muted">{bulkStatus}</div> : null}
            </>
          ) : null}

          {job.busy ? <SearchProgressBar message={progressMessage} percent={progressPercent} /> : null}
          {error ? <Alert className="mt-3" variant="danger">{error}</Alert> : null}
        </Modal.Body>
      </Modal>

      <SearchResultPickerModal
        show={showPicker}
        title="Choose chord sheet"
        candidates={pickerCandidates}
        onChoose={chooseCandidate}
        onHide={function() { setShowPicker(false); setPickerCandidates([]); }}
      />
    </>
  );
}
