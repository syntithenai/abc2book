import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, ListGroup, Modal, Row } from 'react-bootstrap';
import {
  cancelCurrentCandidate,
  currentCandidate,
  isReviewComplete,
  markCandidateImported,
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
  importedNotationText,
} from '../importReviewFieldUtils';
import TuneRecordForm from './TuneRecordForm';
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

  function jumpQueue(direction) {
    if (typeof props.onSessionChange !== 'function') return;
    const base = buildPersistedSession();
    props.onSessionChange(navigateReviewCandidate(base, direction));
  }

  function cancelCurrent() {
    if (typeof props.onSessionChange !== 'function') return;
    const next = cancelCurrentCandidate(buildPersistedSession());
    props.onSessionChange(next);
    if (next.step === 'done' && typeof props.onComplete === 'function') {
      props.onComplete(next);
    }
  }

  function handleEnhanceClick() {
    if (!activeCandidate || activeCandidate.skipEnrich) return;
    if (typeof props.onEnhanceAndAdvance !== 'function') return;
    props.onEnhanceAndAdvance(buildPersistedSession());
  }

  const youtubeSearchQuery = [formValues.title, formValues.artist].filter(Boolean).join(' ');

  const addFromToolbar = (
    <div className="border rounded p-2">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
          <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
            Add From
          </Button>
          <Button size="sm" variant="outline-primary" onClick={function() { if (fileInputRef.current) fileInputRef.current.click(); }}>
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
          {audioUtils.isRecording ? (
            <>
              <Button size="sm" variant="danger" onClick={stopReviewRecording}>Stop</Button>
              <Button size="sm" variant="outline-danger" disabled aria-label="Recording duration">{recordingDuration + 1}s</Button>
            </>
          ) : (
            <Button size="sm" variant="outline-primary" onClick={startReviewRecording}>Record</Button>
          )}
          {resolverChecked && resolverAvailable ? (
            <Button size="sm" variant="outline-primary" onClick={function() { setShowSheetCamera(true); }}>Camera</Button>
          ) : null}
          {props.token ? (
            <>
              {resolverChecked && resolverAvailable ? (
                <Button size="sm" variant="outline-primary" onClick={function() { setShowSheetGooglePhotos(true); }}>Google Photos</Button>
              ) : null}
              <DriveFilePickerModal
                label="Drive"
                title="Import from Google Drive"
                token={props.token}
                driveApi={driveApi}
                requestGoogleScopes={props.requestGoogleScopes}
                onImportSource={function(source) {
                  if (typeof props.onImportSource === 'function') props.onImportSource(source, buildDraftCandidate());
                }}
              />
            </>
          ) : null}
          <YouTubeSearchModal
            tunebook={props.tunebook}
            value={youtubeSearchQuery}
            onChange={function(link) {
              if (typeof props.onImportYouTube === 'function') props.onImportYouTube(link, buildDraftCandidate());
            }}
            triggerElement={<Button variant="outline-primary" size="sm">YouTube</Button>}
          />
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={function(event) {
          const file = event.target.files && event.target.files[0];
          event.target.value = '';
          if (file && typeof props.onImportFile === 'function') props.onImportFile(file, buildDraftCandidate());
        }}
      />
    </div>
  );

  const statusBanner = (
    <div className="border rounded p-2">
      <strong>
        {mergeTargetId && tunes[mergeTargetId]
          ? ('Merging into ' + (tunes[mergeTargetId].name || 'Untitled'))
          : ('Adding ' + (String(formValues.title || '').trim() || 'Untitled'))}
      </strong>
      {activeJob && activeJob.status === 'running' ? (
        <div className="text-muted small mt-1">Enhancing in background… {activeJob.message || ''}</div>
      ) : null}
    </div>
  );

  function renderMergeChoicesPanel() {
    return (
      <div role="region" aria-label="Merge choices" tabIndex={-1}>
        <h6>Collection match</h6>
        <p className="text-muted small">Choose an existing tune to merge into, or create a new tune.</p>
        <div style={{ marginBottom: '0.75em' }}>
          <Button
            variant={mergeTargetId ? 'outline-primary' : 'success'}
            onClick={function() { setMergeTargetId(null); }}
          >
            Create new tune
          </Button>
        </div>
        {matches.length === 0 ? (
          <Alert variant="secondary">No close matches found in your collection.</Alert>
        ) : (
          <ListGroup className="mb-3">
            {matches.map(function(entry) {
              const tune = entry.tune;
              const selected = mergeTargetId === tune.id;
              return (
                <ListGroup.Item key={tune.id} active={selected} tabIndex={0} aria-pressed={selected}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{tune.name}</strong>
                      {tune.composer && <span className="text-muted"> — {tune.composer}</span>}
                      {entry.confidence && <Badge bg="info" style={{ marginLeft: '0.4em' }}>{entry.confidence}</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4em' }}>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        aria-label={'Open tune ' + tune.name}
                        onClick={function() {
                          if (typeof props.onOpenTune === 'function') props.onOpenTune(tune);
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant={selected ? 'primary' : 'outline-primary'}
                        aria-pressed={selected}
                        aria-label={selected ? ('Selected merge target ' + tune.name) : ('Merge into ' + tune.name)}
                        onClick={function() { setMergeTargetId(selected ? null : tune.id); }}
                      >
                        Merge
                      </Button>
                    </div>
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
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
          tunebook={props.tunebook}
          token={props.token}
          forceRefresh={props.forceRefresh}
          resolverAvailable={props.resolverAvailable}
          showComposerSearch={true}
          composerCandidates={activeJob && activeJob.composerCandidates}
          toolbar={addFromToolbar}
          statusBanner={statusBanner}
        />
      </div>
      <div style={{ flex: '0 0 280px', maxWidth: '280px', overflowY: 'auto' }}>
        {renderMergeChoicesPanel()}
        {activeCandidate && activeCandidate.contentHashDuplicate && (
          <Alert variant="warning" className="mt-2">This item matches existing content in your collection.</Alert>
        )}
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
  const headerActions = (
    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end" style={{ marginLeft: 'auto' }}>
      {canMoveQueue ? (
        <>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(-1); }}>Prev</Button>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(1); }}>Next</Button>
        </>
      ) : null}
      {props.reviewPageMode ? (
        <Button variant="outline-secondary" onClick={function() {
          if (typeof props.onContinueLater === 'function') props.onContinueLater();
        }}>
          Continue later
        </Button>
      ) : null}
      <Button variant="outline-danger" onClick={props.onClose}>Cancel all</Button>
      <Button variant="secondary" onClick={cancelCurrent}>Cancel</Button>
      {showEnhance ? (
        <Button variant="outline-primary" onClick={handleEnhanceClick}>Enhance</Button>
      ) : null}
      <Button variant="success" onClick={finishCurrentCandidate}>Import</Button>
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
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h5 className="mb-0">
            Import review
            <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
              {sessionProgressLabel(session)}
            </span>
          </h5>
          {headerActions}
        </div>
        {panelBody}
      </div>
    );
  }

  return (
    <Modal
      show={show}
      onHide={function() {
        if (typeof props.onHide === 'function') props.onHide();
        else if (typeof props.onClose === 'function') props.onClose();
      }}
      fullscreen
      backdrop="static"
    >
      <Modal.Header>
        <Modal.Title>
          Import review
          <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
            {sessionProgressLabel(session)}
          </span>
        </Modal.Title>
        {headerActions}
      </Modal.Header>
      <Modal.Body>{panelBody}</Modal.Body>
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
