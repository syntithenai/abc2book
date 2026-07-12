import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, ButtonGroup, ListGroup, Modal, Row } from 'react-bootstrap';
import { addFromFileAcceptList } from '../importSourceParse';
import {
  cancelCurrentCandidate,
  currentCandidate,
  isAddTunesChrome,
  isReviewComplete,
  markCandidateImported,
  markAllCandidatesImported,
  mergeCandidate,
  navigateReviewCandidate,
  sessionProgressLabel,
  updateCurrentCandidate,
} from '../importReviewSession';
import {
  mergeCandidateWithEnrichment,
} from '../importReviewEnrichmentQueue';
import { findCollectionMatches } from '../tuneCollectionMatch';
import {
  applyImportSuggestion,
  buildReviewFormState,
  formValuesToTune,
  importSuggestionDiffersFromForm,
  importedNotationText,
} from '../importReviewFieldUtils';
import TuneRecordForm from './TuneRecordForm';
import ImportFieldSuggestion from './ImportFieldSuggestion';
import YouTubeSearchModal from './YouTubeSearchModal';
import PasteImportModal from './PasteImportModal';
import ImportUrlModal from './ImportUrlModal';
import DriveFilePickerModal from './DriveFilePickerModal';
import SheetImageCameraModal from './SheetImageCameraModal';
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal';
import useAudioUtils from '../useAudioUtils';
import useAbcjsParser from '../useAbcjsParser';
import useGoogleDocument from '../useGoogleDocument';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { dismissFieldLookup } from '../tuneFieldLookupQueue';
import FieldLookupReviewButton from './FieldLookupReviewButton';

function recordingBlobToFile(blob) {
  const extension = blob && blob.type === 'audio/webm' ? 'webm' : 'wav';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([blob], 'recording-' + timestamp + '.' + extension, {
    type: (blob && blob.type) || 'audio/webm',
  });
}

function ReviewSummary(props) {
  const summary = props.summary;
  if (!summary) return null;
  return (
    <Alert variant="success">
      Import review complete — {summary.reviewed} reviewed
      {summary.created ? (', ' + summary.created + ' created') : ''}
      {summary.merged ? (', ' + summary.merged + ' merged') : ''}.
    </Alert>
  );
}

const MERGE_FIELD_LABELS = {
  title: 'Title',
  artist: 'Artist',
  bookList: 'Books',
  tagList: 'Tags',
  genre: 'Genre',
  rhythm: 'Rhythm',
  meter: 'Meter',
  keyName: 'Key',
  tempo: 'Tempo',
  noteLength: 'Note length',
  backgroundInfo: 'Background info',
  lyrics: 'Lyrics',
  notes: 'Notation',
  aliases: 'Aliases',
  capo: 'Capo',
  transpose: 'Transpose',
  tuning: 'Tuning',
  links: 'Links',
  timedChords: 'Timed chords',
  timedLyrics: 'Timed lyrics',
  playbackAudioFilters: 'Playback audio filters',
  soundFonts: 'Sound fonts',
  meta: 'Meta',
};

function mergeFieldLabelsFromSuggestions(suggestions, formValues) {
  return Object.keys(suggestions || {}).filter(function(key) {
    return importSuggestionDiffersFromForm(key, suggestions[key], formValues);
  }).map(function(key) {
    return MERGE_FIELD_LABELS[key] || key;
  });
}

function describeLinkForCancelWarning(link) {
  if (!link) return 'Media link';
  const title = String(link.title || '').trim();
  const href = String(link.link || '').trim();
  const isAttachedAudio = !!(link.recordingId || link.source === 'file' || link.source === 'mic'
    || (href && href.indexOf('recording:') === 0));
  if (isAttachedAudio) {
    const kind = link.source === 'mic' ? 'Recording' : 'Attached audio';
    return title ? (kind + ': ' + title) : kind;
  }
  if (/youtu(\.be|be\.com)/i.test(href)) {
    return title ? ('YouTube: ' + title) : 'YouTube link';
  }
  if (title) return title;
  if (href) return href;
  return 'Media link';
}

function linksLostOnCancel(formLinks, baseTune) {
  const links = Array.isArray(formLinks) ? formLinks.filter(Boolean) : [];
  if (!links.length) return [];
  if (!baseTune) return links;
  const baseKeys = {};
  (Array.isArray(baseTune.links) ? baseTune.links : []).forEach(function(link) {
    const key = link && (link.recordingId || link.link || link.title);
    if (key) baseKeys[String(key)] = true;
  });
  return links.filter(function(link) {
    const key = link && (link.recordingId || link.link || link.title);
    if (!key) return true;
    return !baseKeys[String(key)];
  });
}

function ImportReviewCancelWarningModal(props) {
  const mode = props.mode;
  if (!mode) return null;

  const importCount = props.importCount || 0;
  const mergeFields = Array.isArray(props.mergeFields) ? props.mergeFields : [];
  const mediaLinks = Array.isArray(props.mediaLinks) ? props.mediaLinks : [];
  const tuneTitle = String(props.tuneTitle || '').trim() || 'Untitled';
  const isCancelAll = mode === 'all';

  return (
    <Modal
      show={true}
      onHide={props.onHide}
      centered
      backdrop="static"
      data-testid="import-review-cancel-warning"
    >
      <Modal.Header closeButton>
        <Modal.Title>{isCancelAll ? 'Cancel all imports?' : 'Cancel this import?'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isCancelAll ? (
          <p>
            This will discard <strong>{importCount}</strong> import request{importCount === 1 ? '' : 's'}
            {' '}and close import review. Unsaved edits on the current item will be lost.
          </p>
        ) : (
          <p>
            This will discard the current import request
            {' '}(<strong>{tuneTitle}</strong>)
            {' '}and remove it from the queue of <strong>{importCount}</strong> import request{importCount === 1 ? '' : 's'}.
            Unsaved edits on this item will be lost.
          </p>
        )}
        {mediaLinks.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1">
              Media and links that will be discarded
              {isCancelAll ? ' on the current item' : ''}:
            </p>
            <ul className="mb-0">
              {mediaLinks.map(function(label, index) {
                return <li key={label + '-' + index}>{label}</li>;
              })}
            </ul>
          </div>
        ) : null}
        {mergeFields.length > 0 ? (
          <div>
            <p className="mb-1">
              Unapplied merge field{mergeFields.length === 1 ? '' : 's'} that will be lost
              {isCancelAll ? ' on the current item' : ''}:
            </p>
            <ul className="mb-0">
              {mergeFields.map(function(label) {
                return <li key={label}>{label}</li>;
              })}
            </ul>
          </div>
        ) : (
          <p className={'text-muted mb-0' + (mediaLinks.length ? ' mt-2' : '')}>
            There are no unapplied merge field suggestions on the current item.
          </p>
        )}
        {!isCancelAll && importCount > 1 ? (
          <p className="text-muted small mt-3 mb-0">
            {importCount - 1} other import request{importCount - 1 === 1 ? '' : 's'} will remain in the queue.
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Keep reviewing</Button>
        <Button
          variant="danger"
          data-testid="import-review-cancel-confirm"
          onClick={props.onConfirm}
        >
          {isCancelAll ? 'Cancel all imports' : 'Cancel this import'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function buildImportAllSummary(session, tunes) {
  const candidates = session && Array.isArray(session.candidates) ? session.candidates : [];
  const remaining = candidates.filter(function(candidate) {
    if (!candidate || candidate.imported) return false;
    if (session.importedCandidateIds && session.importedCandidateIds[candidate.id]) return false;
    return true;
  });
  let createCount = 0;
  let mergeCount = 0;
  const items = remaining.map(function(candidate) {
    const title = String((candidate.tune && candidate.tune.name) || '').trim() || 'Untitled';
    const isMerge = !!(candidate.mergeTargetId && tunes && tunes[candidate.mergeTargetId]);
    if (isMerge) mergeCount += 1;
    else createCount += 1;
    const mergeName = isMerge
      ? (tunes[candidate.mergeTargetId].name || 'existing tune')
      : null;
    const media = (candidate.tune && Array.isArray(candidate.tune.links) ? candidate.tune.links : [])
      .map(describeLinkForCancelWarning);
    return {
      id: candidate.id,
      title: title,
      action: isMerge ? 'merge' : 'create',
      mergeName: mergeName,
      media: media,
    };
  });
  return {
    total: remaining.length,
    createCount: createCount,
    mergeCount: mergeCount,
    items: items,
  };
}

function ImportReviewImportAllWarningModal(props) {
  if (!props.show) return null;
  const summary = props.summary || { total: 0, createCount: 0, mergeCount: 0, items: [] };

  return (
    <Modal
      show={true}
      onHide={props.onHide}
      centered
      backdrop="static"
      data-testid="import-review-import-all-warning"
    >
      <Modal.Header closeButton>
        <Modal.Title>Import all?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This will import <strong>{summary.total}</strong> request{summary.total === 1 ? '' : 's'}
          {summary.createCount ? (': ' + summary.createCount + ' new') : ''}
          {summary.createCount && summary.mergeCount ? ',' : (summary.mergeCount ? ':' : '')}
          {summary.mergeCount ? (' ' + summary.mergeCount + ' merge' + (summary.mergeCount === 1 ? '' : 's')) : ''}
          .
        </p>
        {summary.items.length > 0 ? (
          <ul className="mb-0">
            {summary.items.map(function(item) {
              return (
                <li key={item.id} className="mb-2">
                  <strong>{item.title}</strong>
                  {' — '}
                  {item.action === 'merge'
                    ? ('merge into ' + (item.mergeName || 'existing tune'))
                    : 'create new tune'}
                  {item.media && item.media.length ? (
                    <div className="text-muted small">{item.media.join(' · ')}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Keep reviewing</Button>
        <Button
          variant="danger"
          data-testid="import-review-import-all-confirm"
          onClick={props.onConfirm}
        >
          Import all
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function ImportReviewModal(props) {
  const session = props.session;
  const show = !!(props.show && session && session.step !== 'done');
  const identifyCandidate = currentCandidate(session);
  const mergeTargetCandidate = mergeCandidate(session);
  const activeCandidate = session && session.mergeIndex != null ? mergeTargetCandidate : identifyCandidate;
  const tunes = props.tunes || {};
  const resolverAvailable = props.resolverAvailable !== false;
  const audioUtils = useAudioUtils();
  const abcjsParser = useAbcjsParser();
  const driveApi = useGoogleDocument(props.token, props.login || function() {}, props.forceRefresh);
  const { checked: resolverChecked } = useMediaResolverHealth();
  const fileInputRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const recordingIntervalRef = useRef(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSheetCamera, setShowSheetCamera] = useState(false);
  const [showSheetGooglePhotos, setShowSheetGooglePhotos] = useState(false);
  const [cancelWarningMode, setCancelWarningMode] = useState(null);
  const [showImportAllWarning, setShowImportAllWarning] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState(null);
  const [formValues, setFormValues] = useState(function() { return { title: '' }; });
  const [suggestions, setSuggestions] = useState({});

  const activeJob = useMemo(function() {
    if (!session || !activeCandidate) return null;
    return (session.enrichmentJobs || []).find(function(job) {
      return job.candidateId === activeCandidate.id;
    }) || null;
  }, [session, activeCandidate]);

  const enrichedImportedTune = useMemo(function() {
    if (!activeCandidate) return null;
    return mergeCandidateWithEnrichment(activeCandidate, activeJob);
  }, [activeCandidate, activeJob]);

  const importedTuneSource = useMemo(function() {
    return enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {};
  }, [enrichedImportedTune, activeCandidate]);

  const mergeMode = mergeTargetId && tunes[mergeTargetId] ? 'merge' : 'create';

  const initializeFormState = useCallback(function(targetMergeId) {
    const imported = enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {};
    const effectiveMergeId = targetMergeId != null ? targetMergeId : mergeTargetId;
    if (effectiveMergeId && tunes[effectiveMergeId]) {
      const built = buildReviewFormState(tunes[effectiveMergeId], imported, 'merge');
      setFormValues(built.formValues);
      setSuggestions(built.suggestions);
      return;
    }
    const built = buildReviewFormState(null, imported, 'create');
    setFormValues(built.formValues);
    setSuggestions(built.suggestions);
  }, [activeCandidate, enrichedImportedTune, mergeTargetId, tunes]);

  useEffect(function() {
    if (!activeCandidate) return;
    setMergeTargetId(activeCandidate.mergeTargetId || null);
  }, [activeCandidate && activeCandidate.id, session && session.index, session && session.mergeIndex]);

  useEffect(function() {
    if (!activeCandidate) return;
    initializeFormState(activeCandidate.mergeTargetId || null);
  }, [
    activeCandidate && activeCandidate.id,
    session && session.index,
    session && session.mergeIndex,
    enrichedImportedTune,
    initializeFormState,
  ]);

  useEffect(function() {
    if (!activeCandidate) return;
    if (mergeTargetId === (activeCandidate.mergeTargetId || null)) return;
    initializeFormState(mergeTargetId);
  }, [mergeTargetId, activeCandidate, initializeFormState]);

  function buildEditedTune(baseTune) {
    const next = formValuesToTune(formValues, baseTune || {});
    if (mergeTargetId && tunes[mergeTargetId]) {
      next.id = tunes[mergeTargetId].id;
    } else if (baseTune && baseTune.id) {
      next.id = baseTune.id;
    }
    return next;
  }

  const editedTunePreview = useMemo(function() {
    return buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {});
  }, [formValues, enrichedImportedTune, activeCandidate, mergeTargetId, tunes]);

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: formValues.title,
      artist: formValues.artist,
      tunes: tunes,
      youtubeUrl: '',
    }) || [];
  }, [formValues.title, formValues.artist, tunes]);

  function buildDraftCandidate() {
    return {
      tune: buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {}),
      mergeTargetId: mergeTargetId,
    };
  }

  function handleApplySuggestion(formKey, suggestion) {
    setFormValues(function(current) {
      return applyImportSuggestion(current, formKey, suggestion);
    });
    setSuggestions(function(current) {
      const next = Object.assign({}, current);
      delete next[formKey];
      return next;
    });
  }

  function clearRecordingInterval() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }

  function stopReviewRecording() {
    audioUtils.stopRecording();
  }

  function startReviewRecording() {
    if (audioUtils.isRecording || typeof props.onImportFile !== 'function') return;
    recordingStartedAtRef.current = Date.now();
    setRecordingDuration(0);
    recordingIntervalRef.current = setInterval(function() {
      setRecordingDuration(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
    }, 1000);
    audioUtils.startRecording().then(function(blob) {
      clearRecordingInterval();
      setRecordingDuration(0);
      if (!blob || !blob.size) return;
      props.onImportFile(recordingBlobToFile(blob), buildDraftCandidate());
    });
  }

  useEffect(function() {
    return function() {
      clearRecordingInterval();
    };
  }, []);

  if (!session) return null;

  if (session.step === 'done') {
    const doneBody = <ReviewSummary summary={session.sessionSummary} />;
    if (props.embedded) {
      return (
        <div className="import-review-embedded border rounded p-3 mb-3 bg-light">
          {doneBody}
          <Button variant="success" onClick={function() {
            if (typeof props.onComplete === 'function') props.onComplete(session);
          }}>
            Done
          </Button>
        </div>
      );
    }
    return (
      <Modal show={!!props.show} onHide={props.onClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>Import review complete</Modal.Title>
        </Modal.Header>
        <Modal.Body>{doneBody}</Modal.Body>
        <Modal.Footer>
          <Button variant="success" onClick={function() {
            if (typeof props.onComplete === 'function') props.onComplete(session);
          }}>
            Done
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  if (!show) return null;

  function buildPersistedSession() {
    const candidate = activeCandidate;
    if (!candidate) return session;
    const persistedTune = buildEditedTune(candidate.tune || {});
    return updateCurrentCandidate(session, {
      tune: persistedTune,
      mergeTargetId: mergeTargetId,
    });
  }

  function finishCurrentCandidate() {
    const base = buildPersistedSession();
    const candidate = activeCandidate;
    if (!candidate) return;

    let candidateTune = buildEditedTune(enrichedImportedTune || candidate.tune || {});
    if (mergeTargetId && tunes[mergeTargetId]) {
      candidateTune.id = tunes[mergeTargetId].id;
    }

    if (isAddTunesChrome(session)) {
      const title = String(candidateTune.name || '').trim();
      const books = Array.isArray(candidateTune.books) ? candidateTune.books : [];
      const bookFromForm = String(formValues.bookList || '').split(',')[0] || '';
      const hasBook = books.some(function(book) { return String(book || '').trim(); })
        || String(bookFromForm).trim()
        || String(props.currentTuneBook || '').trim();
      if (!title || !hasBook) {
        return;
      }
      if (!books.length && props.currentTuneBook) {
        candidateTune.books = [String(props.currentTuneBook).trim().toLowerCase()];
      }
    }

    const updated = updateCurrentCandidate(base, {
      tune: candidateTune,
      mergeTargetId: mergeTargetId,
    });

    if (typeof props.onFinishCandidate === 'function') {
      props.onFinishCandidate(updated, function() {
        const nextSession = markCandidateImported(updated);
        if (typeof props.onSessionChange === 'function') props.onSessionChange(nextSession);
        if (nextSession.step === 'done' && typeof props.onComplete === 'function') {
          props.onComplete(nextSession);
        }
      });
    }
  }

  function finishAllQueuedCandidates() {
    if (typeof props.onImportAll !== 'function') return;
    const base = buildPersistedSession();
    setShowImportAllWarning(false);
    props.onImportAll(base, function() {
      const nextSession = markAllCandidatesImported(base);
      if (typeof props.onSessionChange === 'function') props.onSessionChange(nextSession);
      if (typeof props.onComplete === 'function') props.onComplete(nextSession);
    });
  }

  function jumpQueue(direction) {
    if (typeof props.onSessionChange !== 'function') return;
    const base = buildPersistedSession();
    props.onSessionChange(navigateReviewCandidate(base, direction));
  }

  function cancelCurrent() {
    if (typeof props.onSessionChange !== 'function') return;
    if (activeCandidate && activeCandidate.fieldLookupJobId) {
      dismissFieldLookup(activeCandidate.fieldLookupJobId);
    }
    const next = cancelCurrentCandidate(buildPersistedSession());
    props.onSessionChange(next);
    if (next.step === 'done' && typeof props.onComplete === 'function') {
      props.onComplete(next);
    }
  }

  function confirmCancelWarning() {
    const mode = cancelWarningMode;
    setCancelWarningMode(null);
    if (mode === 'all') {
      const base = buildPersistedSession();
      (base.candidates || []).forEach(function(candidate) {
        if (candidate && candidate.fieldLookupJobId) {
          dismissFieldLookup(candidate.fieldLookupJobId);
        }
      });
      if (typeof props.onClose === 'function') props.onClose();
      return;
    }
    if (mode === 'current') cancelCurrent();
  }

  function handleEnhanceClick() {
    if (!activeCandidate || activeCandidate.skipEnrich) return;
    if (typeof props.onEnhanceAndAdvance !== 'function') return;
    props.onEnhanceAndAdvance(buildPersistedSession());
  }

  const youtubeSearchQuery = [formValues.title, formValues.artist].filter(Boolean).join(' ');

  function requireGoogleLogin(action) {
    if (props.token && props.token.access_token) {
      if (typeof action === 'function') action();
      return;
    }
    if (typeof props.login === 'function') props.login();
  }

  const externalLinkIcon = (props.tunebook && props.tunebook.icons && props.tunebook.icons.externallink)
    || <span aria-hidden="true">↗</span>;

  const addFromToolbar = (
    <div className="add-from-strip">
      <div className="add-from-strip-row">
        <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
          Add From
        </Button>
        <ButtonGroup size="sm">
          <Button
            variant="outline-primary"
            onClick={function() { if (fileInputRef.current) fileInputRef.current.click(); }}
          >
            File
          </Button>
          <PasteImportModal
            onImportText={function(text) {
              if (typeof props.onImportText === 'function') props.onImportText(text, buildDraftCandidate());
            }}
            onImportFiles={function(files) {
              if (typeof props.onImportFiles === 'function') props.onImportFiles(files, buildDraftCandidate());
            }}
          />
          <ImportUrlModal
            label="URL"
            tunebook={props.tunebook}
            abcjsParser={abcjsParser}
            driveApi={driveApi}
            accessToken={props.token && props.token.access_token}
            resolverAvailable={resolverAvailable}
            onImportSource={function(source) {
              if (typeof props.onImportSource === 'function') props.onImportSource(source, buildDraftCandidate());
            }}
          />
        </ButtonGroup>
        <ButtonGroup size="sm">
          {audioUtils.isRecording ? (
            <>
              <Button variant="danger" onClick={stopReviewRecording}>Stop</Button>
              <Button variant="outline-danger" disabled aria-label="Recording duration">{recordingDuration + 1}s</Button>
            </>
          ) : (
            <Button variant="outline-primary" onClick={startReviewRecording}>Record</Button>
          )}
          <Button
            variant="outline-primary"
            onClick={function() {
              if (!resolverAvailable) return;
              setShowSheetCamera(true);
            }}
            disabled={!resolverChecked || !resolverAvailable}
            title={!resolverAvailable ? 'Camera needs the media resolver' : 'Capture sheet image'}
          >
            Camera
          </Button>
        </ButtonGroup>
        <ButtonGroup size="sm">
          <Button
            variant="outline-primary"
            onClick={function() {
              requireGoogleLogin(function() {
                if (resolverChecked && resolverAvailable) setShowSheetGooglePhotos(true);
              });
            }}
            title="Import from Google Photos"
          >
            Google Photos
          </Button>
          <DriveFilePickerModal
            label="Drive"
            title="Import from Google Drive"
            token={props.token}
            driveApi={driveApi}
            login={props.login}
            requestGoogleScopes={props.requestGoogleScopes}
            onImportSource={function(source) {
              if (typeof props.onImportSource === 'function') props.onImportSource(source, buildDraftCandidate());
            }}
          />
          <YouTubeSearchModal
            tunebook={props.tunebook}
            value={youtubeSearchQuery}
            onChange={function(link) {
              if (typeof props.onImportYouTube === 'function') props.onImportYouTube(link, buildDraftCandidate());
            }}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            triggerElement={<>YouTube</>}
          />
        </ButtonGroup>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={addFromFileAcceptList(resolverAvailable)}
        style={{ display: 'none' }}
        onChange={function(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = '';
          if (file && typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
      />
    </div>
  );

  const pendingSuggestionKeys = Object.keys(suggestions || {}).filter(function(key) {
    return importSuggestionDiffersFromForm(key, suggestions[key], formValues);
  });
  const fieldLookupKind = activeCandidate && activeCandidate.fieldLookupKind;
  const statusBanner = (
    <div className="border rounded p-2">
      <strong>
        {mergeTargetId && tunes[mergeTargetId]
          ? ('Merging into ' + (tunes[mergeTargetId].name || 'Untitled'))
          : ('Adding ' + (String(formValues.title || '').trim() || 'Untitled'))}
      </strong>
      {fieldLookupKind ? (
        <div className="text-muted small mt-1">
          Search result for {MERGE_FIELD_LABELS[
            fieldLookupKind === 'composer' ? 'artist'
              : fieldLookupKind === 'notation' ? 'notes'
                : fieldLookupKind
          ] || fieldLookupKind}
          {' — choose a source below or accept the suggested merge.'}
        </div>
      ) : null}
      {pendingSuggestionKeys.length > 0 ? (
        <div className="mt-2">
          <div className="text-muted small mb-2">
            Changed fields:{' '}
            {pendingSuggestionKeys.map(function(key) {
              return MERGE_FIELD_LABELS[key] || key;
            }).join(', ')}
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {pendingSuggestionKeys.map(function(key) {
              const suggestion = suggestions[key];
              const label = MERGE_FIELD_LABELS[key] || key;
              return (
                <ImportFieldSuggestion
                  key={key}
                  id={'banner-' + key}
                  label={label}
                  fieldKey={suggestion && suggestion.key ? suggestion.key : key}
                  suggestion={suggestion}
                  choices={suggestion && Array.isArray(suggestion.choices) ? suggestion.choices : null}
                  actionLabel="Use import"
                  onSelectChoice={function(choice) {
                    handleApplySuggestion(key, choice && choice.value != null
                      ? Object.assign({}, suggestion, { value: choice.value, displayValue: choice.label })
                      : suggestion);
                  }}
                  onApply={function() {
                    handleApplySuggestion(key, suggestion);
                  }}
                />
              );
            })}
            {fieldLookupKind ? (
              <FieldLookupReviewButton
                tuneId={mergeTargetId}
                candidateId={activeCandidate && activeCandidate.id}
                kind={fieldLookupKind}
                fallbackTitle={formValues.title || ''}
                onApply={function(result) {
                  if (fieldLookupKind === 'composer' && result && result.artist) {
                    setFormValues(function(current) {
                      return Object.assign({}, current, { artist: result.artist });
                    });
                    setSuggestions(function(current) {
                      const next = Object.assign({}, current);
                      delete next.artist;
                      return next;
                    });
                  } else if (fieldLookupKind === 'lyrics') {
                    const text = result && (result.text || (Array.isArray(result.lines) ? result.lines.join('\n') : ''));
                    if (text) {
                      setFormValues(function(current) {
                        return Object.assign({}, current, { lyrics: text });
                      });
                      setSuggestions(function(current) {
                        const next = Object.assign({}, current);
                        delete next.lyrics;
                        return next;
                      });
                    }
                  } else if (fieldLookupKind === 'notation' && result && result.abc && props.tunebook && props.tunebook.abcTools) {
                    const imported = props.tunebook.abcTools.abc2json(result.abc);
                    if (imported) {
                      setFormValues(function(current) {
                        return Object.assign({}, current, {
                          voices: imported.voices || current.voices,
                          notes: Array.isArray(imported.notes) ? imported.notes.join('\n') : (current.notes || ''),
                        });
                      });
                      setSuggestions(function(current) {
                        const next = Object.assign({}, current);
                        delete next.notes;
                        return next;
                      });
                    }
                  } else if (fieldLookupKind === 'links' && result && result.link) {
                    const linkObj = {
                      link: String(result.link).trim(),
                      title: String(result.title || '').trim(),
                    };
                    if (result.image) linkObj.image = result.image;
                    setFormValues(function(current) {
                      const existing = Array.isArray(current.links) ? current.links.slice() : [];
                      const emptyIdx = existing.findIndex(function(link) {
                        return !link || !link.link || !String(link.link).trim();
                      });
                      if (emptyIdx >= 0) {
                        existing[emptyIdx] = Object.assign({}, existing[emptyIdx] || {}, linkObj);
                      } else if (existing.length === 0) {
                        existing.push(linkObj);
                      } else {
                        existing[0] = Object.assign({}, existing[0] || {}, linkObj);
                      }
                      return Object.assign({}, current, { links: existing });
                    });
                    setSuggestions(function(current) {
                      const next = Object.assign({}, current);
                      delete next.links;
                      return next;
                    });
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      ) : fieldLookupKind ? (
        <div className="mt-2 d-flex flex-wrap gap-2 align-items-center">
          <FieldLookupReviewButton
            tuneId={mergeTargetId}
            candidateId={activeCandidate && activeCandidate.id}
            kind={fieldLookupKind}
            fallbackTitle={formValues.title || ''}
            onApply={function(result) {
              if (fieldLookupKind === 'composer' && result && result.artist) {
                setFormValues(function(current) {
                  return Object.assign({}, current, { artist: result.artist });
                });
              } else if (fieldLookupKind === 'lyrics') {
                const text = result && (result.text || (Array.isArray(result.lines) ? result.lines.join('\n') : ''));
                if (text) {
                  setFormValues(function(current) {
                    return Object.assign({}, current, { lyrics: text });
                  });
                }
              } else if (fieldLookupKind === 'notation' && result && result.abc && props.tunebook && props.tunebook.abcTools) {
                const imported = props.tunebook.abcTools.abc2json(result.abc);
                if (imported) {
                  setFormValues(function(current) {
                    return Object.assign({}, current, {
                      voices: imported.voices || current.voices,
                      notes: Array.isArray(imported.notes) ? imported.notes.join('\n') : (current.notes || ''),
                    });
                  });
                }
              } else if (fieldLookupKind === 'links' && result && result.link) {
                const linkObj = {
                  link: String(result.link).trim(),
                  title: String(result.title || '').trim(),
                };
                if (result.image) linkObj.image = result.image;
                setFormValues(function(current) {
                  const existing = Array.isArray(current.links) ? current.links.slice() : [];
                  const emptyIdx = existing.findIndex(function(link) {
                    return !link || !link.link || !String(link.link).trim();
                  });
                  if (emptyIdx >= 0) {
                    existing[emptyIdx] = Object.assign({}, existing[emptyIdx] || {}, linkObj);
                  } else if (existing.length === 0) {
                    existing.push(linkObj);
                  } else {
                    existing[0] = Object.assign({}, existing[0] || {}, linkObj);
                  }
                  return Object.assign({}, current, { links: existing });
                });
              }
            }}
          />
        </div>
      ) : null}
      {activeJob && activeJob.status === 'running' ? (
        <div className="text-muted small mt-1">Enhancing in background… {activeJob.message || ''}</div>
      ) : null}
    </div>
  );

  function renderMergeChoicesPanel() {
    const isContentDuplicate = !!(activeCandidate && activeCandidate.contentHashDuplicate);
    const createSelected = !mergeTargetId;
    return (
      <div role="region" aria-label="Merge choices" tabIndex={-1} className="collection-match-panel">
        <h6>Collection match</h6>
        <p className="text-muted small">Choose an existing tune to merge into, or create a new tune.</p>
        <ListGroup className="mb-3 collection-match-list" variant="flush">
          <ListGroup.Item
            action
            active={createSelected}
            className={'collection-match-choice' + (createSelected ? ' collection-match-choice--selected' : '')}
            tabIndex={0}
            aria-pressed={createSelected}
            onClick={function() { setMergeTargetId(null); }}
          >
            <strong>Create new tune</strong>
            <div className="text-muted small mt-1">Save this import as a new collection entry.</div>
          </ListGroup.Item>
          {matches.map(function(entry) {
            const tune = entry.tune;
            const selected = mergeTargetId === tune.id;
            return (
              <ListGroup.Item
                key={tune.id}
                action
                active={selected}
                className={'collection-match-choice' + (selected ? ' collection-match-choice--selected' : '')}
                tabIndex={0}
                aria-pressed={selected}
                onClick={function() { setMergeTargetId(tune.id); }}
              >
                <Button
                  size="sm"
                  variant="link"
                  className="collection-match-open-btn"
                  aria-label={'Open tune ' + (tune.name || 'Untitled')}
                  title="Open tune"
                  onClick={function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof props.onOpenTune === 'function') props.onOpenTune(tune);
                  }}
                >
                  {externalLinkIcon}
                </Button>
                <strong>{tune.name || 'Untitled'}</strong>
                {tune.composer ? <div className="text-muted small">{tune.composer}</div> : null}
                {entry.confidence ? <Badge bg="info" className="mt-1">{entry.confidence}</Badge> : null}
              </ListGroup.Item>
            );
          })}
        </ListGroup>
        {matches.length === 0 ? (
          <Alert variant="secondary" className="mb-2">
            No close title/artist matches found in your collection.
          </Alert>
        ) : null}
        {isContentDuplicate ? (
          <Alert variant="warning" className="mb-0">
            Content hash matches an existing tune. Prefer merging into that tune if it appears above, or create a new tune only if this is intentional.
          </Alert>
        ) : null}
      </div>
    );
  }

  const panelBody = (
    <Row style={{ flexWrap: 'nowrap' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', paddingRight: '1rem' }}>
        <TuneRecordForm
          values={formValues}
          onChange={function(patch) {
            setFormValues(function(current) {
              return Object.assign({}, current, patch);
            });
          }}
          suggestions={suggestions}
          onApplySuggestion={handleApplySuggestion}
          mergeMode={mergeMode}
          importedNotationText={importedNotationText(importedTuneSource)}
          previewTune={editedTunePreview}
          candidateId={activeCandidate && activeCandidate.id}
          tunebook={props.tunebook}
          token={props.token}
          forceRefresh={props.forceRefresh}
          resolverAvailable={props.resolverAvailable}
          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
          showComposerSearch={true}
          composerCandidates={activeJob && activeJob.composerCandidates}
          statusBanner={statusBanner}
        />
      </div>
      <div style={{ flex: '0 0 280px', maxWidth: '280px', overflowY: 'auto' }}>
        {renderMergeChoicesPanel()}
        {activeCandidate && activeCandidate.sourceKind && (
          <div className="text-muted small mt-2">Source: {activeCandidate.sourceKind}</div>
        )}
        {activeJob && activeJob.status === 'done' && activeJob.enrichedTune && (
          <Alert variant="success" className="mt-2">Enhanced data ready — review suggestions above.</Alert>
        )}
      </div>
    </Row>
  );

  const canMoveQueue = (session && Array.isArray(session.candidates) && session.candidates.length > 1);
  const showEnhance = !session.skipEnrichment && activeCandidate && !activeCandidate.skipEnrich;
  const importRequestCount = session && Array.isArray(session.candidates) ? session.candidates.length : 0;
  const addTunesMode = isAddTunesChrome(session);
  const headerTitle = addTunesMode ? 'Add tunes' : 'Import review';
  const primaryActionLabel = addTunesMode ? 'Add' : 'Import';
  const hasBookForAdd = !!(
    String(formValues.bookList || '').trim()
    || String(props.currentTuneBook || '').trim()
  );
  const primaryActionDisabled = addTunesMode && (
    !String(formValues.title || '').trim() || !hasBookForAdd
  );
  const pendingMergeFields = mergeFieldLabelsFromSuggestions(suggestions, formValues);
  const baseTuneForCancel = mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : null;
  const pendingMediaLinks = linksLostOnCancel(formValues.links, baseTuneForCancel).map(describeLinkForCancelWarning);
  const importAllSummary = buildImportAllSummary(buildPersistedSession(), tunes);
  const cancelWarningModal = (
    <ImportReviewCancelWarningModal
      mode={cancelWarningMode}
      importCount={importRequestCount}
      mergeFields={pendingMergeFields}
      mediaLinks={pendingMediaLinks}
      tuneTitle={formValues.title || (activeCandidate && activeCandidate.tune && activeCandidate.tune.name)}
      onHide={function() { setCancelWarningMode(null); }}
      onConfirm={confirmCancelWarning}
    />
  );
  const importAllWarningModal = (
    <ImportReviewImportAllWarningModal
      show={showImportAllWarning}
      summary={importAllSummary}
      onHide={function() { setShowImportAllWarning(false); }}
      onConfirm={finishAllQueuedCandidates}
    />
  );
  const headerActions = (
    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end" style={{ marginLeft: 'auto' }}>
      {canMoveQueue ? (
        <>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(-1); }}>Prev</Button>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(1); }}>Next</Button>
        </>
      ) : null}
      {!addTunesMode && typeof props.onContinueLater === 'function' ? (
        <Button variant="outline-secondary" onClick={function() {
          props.onContinueLater();
        }}>
          Continue later
        </Button>
      ) : null}
      {!addTunesMode ? (
        <>
          {importRequestCount > 1 ? (
            <Button variant="outline-danger" onClick={function() { setCancelWarningMode('all'); }}>Cancel all</Button>
          ) : null}
          <Button variant="secondary" onClick={function() { setCancelWarningMode('current'); }}>Cancel</Button>
        </>
      ) : null}
      {showEnhance ? (
        <Button variant="outline-primary" onClick={handleEnhanceClick}>Enhance</Button>
      ) : null}
      <Button
        variant={primaryActionDisabled ? 'secondary' : 'success'}
        disabled={!!primaryActionDisabled}
        onClick={finishCurrentCandidate}
      >
        {primaryActionLabel}
      </Button>
      {typeof props.onImportAll === 'function' && importAllSummary.total > 1 && !addTunesMode ? (
        <Button variant="danger" onClick={function() { setShowImportAllWarning(true); }}>
          Import all
        </Button>
      ) : null}
      {isReviewComplete(session) ? (
        <Button variant="success" onClick={function() {
          if (typeof props.onComplete === 'function') props.onComplete(session);
        }}>
          Done
        </Button>
      ) : null}
    </div>
  );

  if (props.embedded) {
    return (
      <div className="import-review-embedded border rounded p-3 mb-3 bg-light">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
          <h5 className="mb-0">
            {headerTitle}
            {!addTunesMode ? (
              <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
                {sessionProgressLabel(session)}
              </span>
            ) : null}
          </h5>
          {headerActions}
        </div>
        <div className="mb-3 add-from-strip add-from-strip--separated">{addFromToolbar}</div>
        {panelBody}
        {cancelWarningModal}
        {importAllWarningModal}
      </div>
    );
  }

  return (
    <Modal
      show={show}
      onHide={function() {
        if (typeof props.onContinueLater === 'function') {
          props.onContinueLater();
          return;
        }
        if (typeof props.onHide === 'function') {
          props.onHide();
          return;
        }
        if (!addTunesMode) setCancelWarningMode('all');
      }}
      fullscreen
      backdrop="static"
    >
      <Modal.Header closeButton className="add-tunes-modal-header">
        <div className="add-tunes-panel-header">
          <div className="add-tunes-panel-header-top">
            <Modal.Title>
              {headerTitle}
              {!addTunesMode ? (
                <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
                  {sessionProgressLabel(session)}
                </span>
              ) : null}
            </Modal.Title>
            {headerActions}
          </div>
          {addFromToolbar}
        </div>
      </Modal.Header>
      <Modal.Body>{panelBody}</Modal.Body>
      {cancelWarningModal}
      {importAllWarningModal}
      <SheetImageCameraModal
        show={showSheetCamera}
        onHide={function() { setShowSheetCamera(false); }}
        onCapture={function(file) {
          setShowSheetCamera(false);
          if (typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
      />
      <SheetImageGooglePhotosModal
        show={showSheetGooglePhotos}
        onHide={function() { setShowSheetGooglePhotos(false); }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        login={props.login}
        onSelectFile={function(file) {
          setShowSheetGooglePhotos(false);
          if (typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
      />
    </Modal>
  );
}
