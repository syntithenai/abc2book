import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, ListGroup, Modal, Row, Col } from 'react-bootstrap';
import {
  beginEnrichmentPhase,
  beginMergeForJob,
  cancelCurrentCandidate,
  currentCandidate,
  isReviewComplete,
  markCandidateImported,
  mergeCandidate,
  navigateReviewCandidate,
  sessionProgressLabel,
  shouldSkipYoutubeStep,
  updateCurrentCandidate,
  youtubeUrlFromCandidate,
} from '../importReviewSession';
import {
  clearEnrichmentQueue,
  createEnrichmentJob,
  enrichmentSummary,
  findEnrichmentJob,
  mergeCandidateWithEnrichment,
  skipAllPendingEnrichmentJobs,
  skipEnrichmentJob,
  startEnrichmentJob,
} from '../importReviewEnrichmentQueue';
import { findCollectionMatches } from '../tuneCollectionMatch';
import { applyTuneImportSelections, buildDefaultTuneImportSelections, buildTuneImportFieldRows } from '../tuneImportMergeUtils';
import { TuneImportFieldPicker } from './TuneImportFieldChooserModal';
import LinksEditor from './LinksEditor';
import YouTubeSearchModal from './YouTubeSearchModal';
import TuneAliasesField from './TuneAliasesField';
import ComposerSearchButton from './ComposerSearchButton';
import ComposerCandidateQuickPick from './ComposerCandidateQuickPick';
import PasteImportModal from './PasteImportModal';
import ImportUrlModal from './ImportUrlModal';
import DriveFilePickerModal from './DriveFilePickerModal';
import SheetImageCameraModal from './SheetImageCameraModal';
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal';
import useAudioUtils from '../useAudioUtils';
import useAbcjsParser from '../useAbcjsParser';
import useGoogleDocument from '../useGoogleDocument';
import useMediaResolverHealth from '../useMediaResolverHealth';

function parseListField(value) {
  return String(value || '')
    .split(',')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function getFirstVoiceNotes(tune) {
  const voices = tune && tune.voices ? tune.voices : null;
  if (!voices || typeof voices !== 'object') return '';
  const voiceKey = Object.keys(voices)[0];
  if (!voiceKey) return '';
  const notes = voices[voiceKey] && Array.isArray(voices[voiceKey].notes)
    ? voices[voiceKey].notes
    : [];
  return notes.join('\n');
}

function getLyricsText(tune) {
  if (tune && Array.isArray(tune.wLines) && tune.wLines.length) {
    return tune.wLines.join('\n');
  }
  if (tune && Array.isArray(tune.words) && tune.words.length) {
    return tune.words.join('\n');
  }
  return '';
}

const MERGE_DETAILS_PANEL_ID = 'import-review-merge-details';

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

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [aliases, setAliases] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [genre, setGenre] = useState('');
  const [rhythm, setRhythm] = useState('');
  const [meter, setMeter] = useState('');
  const [keyName, setKeyName] = useState('');
  const [bookList, setBookList] = useState('');
  const [tagList, setTagList] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [backgroundInfo, setBackgroundInfo] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState([]);
  const [mergeTargetId, setMergeTargetId] = useState(null);
  const [fieldMergeSelections, setFieldMergeSelections] = useState({});
  const [mergeDetailsOpen, setMergeDetailsOpen] = useState(false);

  function buildDraftCandidate() {
    return {
      tune: buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {}),
      mergeTargetId: mergeTargetId,
    };
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

  useEffect(function() {
    if (!activeCandidate) return;
    const tune = activeCandidate.tune || {};
    setTitle(activeCandidate.tune && activeCandidate.tune.name ? activeCandidate.tune.name : '');
    setArtist(activeCandidate.tune && activeCandidate.tune.composer ? activeCandidate.tune.composer : '');
    setAliases(Array.isArray(activeCandidate.tune && activeCandidate.tune.aliases)
      ? activeCandidate.tune.aliases.slice()
      : []);
    setYoutubeUrl(youtubeUrlFromCandidate(activeCandidate));
    setGenre(tune.genre || '');
    setRhythm(tune.rhythm || '');
    setMeter(tune.meter || '');
    setKeyName(tune.key || '');
    setBookList(Array.isArray(tune.books) ? tune.books.join(', ') : '');
    setTagList(Array.isArray(tune.tags) ? tune.tags.join(', ') : '');
    setSrcUrl(tune.srcUrl || '');
    setBackgroundInfo(tune.backgroundInfo || '');
    setLyrics(getLyricsText(tune));
    setNotes(getFirstVoiceNotes(tune));
    setLinks(Array.isArray(tune.links) ? tune.links.slice() : []);
    setMergeTargetId(activeCandidate.mergeTargetId || null);
    setFieldMergeSelections({});
    setMergeDetailsOpen(false);
  }, [activeCandidate && activeCandidate.id, session && session.index, session && session.mergeIndex]);

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

  function buildEditedTune(baseTune) {
    const next = Object.assign({}, baseTune || {}, {
      name: title.trim(),
      composer: artist.trim(),
      aliases: aliases.slice(),
      genre: genre.trim(),
      rhythm: rhythm.trim(),
      meter: meter.trim(),
      key: keyName.trim(),
      books: parseListField(bookList),
      tags: parseListField(tagList),
      srcUrl: srcUrl.trim(),
      backgroundInfo: backgroundInfo,
      links: links.slice(),
    });
    const firstVoice = next.voices && Object.keys(next.voices).length
      ? Object.keys(next.voices)[0]
      : '1';
    if (!next.voices) next.voices = {};
    next.voices[firstVoice] = Object.assign({}, next.voices[firstVoice] || { meta: '' }, {
      notes: notes.trim() ? notes.split('\n') : [],
    });
    if (lyrics.trim()) {
      next.wLines = lyrics.split('\n');
      delete next.words;
    } else {
      delete next.wLines;
      next.words = [];
    }
    return next;
  }

  const editedTunePreview = useMemo(function() {
    return buildEditedTune(enrichedImportedTune || (activeCandidate && activeCandidate.tune) || {});
  }, [
    enrichedImportedTune,
    activeCandidate && activeCandidate.id,
    title,
    artist,
    aliases,
    genre,
    rhythm,
    meter,
    keyName,
    bookList,
    tagList,
    srcUrl,
    backgroundInfo,
    lyrics,
    notes,
    links,
  ]);

  const mergeRows = useMemo(function() {
    const original = mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : { id: 'new', name: '', composer: '' };
    return buildTuneImportFieldRows(original, editedTunePreview) || [];
  }, [mergeTargetId, tunes, editedTunePreview]);

  const differingMergeRows = useMemo(function() {
    return (mergeRows || []).filter(function(row) { return row.differs; });
  }, [mergeRows]);

  useEffect(function() {
    if (!session || session.step !== 'review' || !activeCandidate) return;
    setFieldMergeSelections(buildDefaultTuneImportSelections(
      mergeTargetId ? differingMergeRows : mergeRows
    ));
  }, [
    session && session.step,
    activeCandidate && activeCandidate.id,
    mergeTargetId,
    mergeRows,
    differingMergeRows,
  ]);

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: title,
      artist: artist,
      tunes: tunes,
      youtubeUrl: youtubeUrl,
    }) || [];
  }, [title, artist, tunes, youtubeUrl]);

  if (!session) return null;

  if (session.step === 'done') {
    const doneBody = (
      <ReviewSummary summary={session.sessionSummary} />
    );
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
    const nextLinks = Array.isArray(persistedTune.links) ? persistedTune.links.slice() : [];
    const yt = youtubeUrl.trim();
    if (yt) {
      const has = nextLinks.some(function(l) { return l && l.link === yt; });
      if (!has) nextLinks.push({ link: yt, title: '', startAt: '', endAt: '' });
    }
    persistedTune.links = nextLinks;
    return updateCurrentCandidate(session, {
      tune: persistedTune,
      youtubeUrl: yt,
      mergeTargetId: mergeTargetId,
    });
  }

  function finishCurrentCandidate() {
    const base = buildPersistedSession();
    const candidate = activeCandidate;
    if (!candidate) return;

    let candidateTune = buildEditedTune(enrichedImportedTune || candidate.tune || {});

    if (mergeTargetId && tunes[mergeTargetId]) {
      const rows = differingMergeRows;
      const currentSelections = fieldMergeSelections || {};
      const selections = Object.keys(currentSelections).length > 0
        ? currentSelections
        : buildDefaultTuneImportSelections(rows);
      candidateTune = applyTuneImportSelections(tunes[mergeTargetId], candidateTune, selections);
    }

    const updated = updateCurrentCandidate(base, {
      tune: candidateTune,
      mergeTargetId: mergeTargetId,
      youtubeUrl: youtubeUrl.trim(),
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

  function enqueueEnhancementForCurrent() {
    if (!activeCandidate || activeCandidate.skipEnrich) return;
    const jobs = (session.enrichmentJobs || []).slice();
    if (!findEnrichmentJob(jobs, activeCandidate.id)) {
      jobs.push(createEnrichmentJob(activeCandidate));
    }
    const started = startEnrichmentJob(jobs, findEnrichmentJob(jobs, activeCandidate.id).id);
    if (typeof props.onSessionChange === 'function') {
      props.onSessionChange(Object.assign({}, session, { enrichmentJobs: started }));
    }
  }

  function renderEnrichmentQueue() {
    const jobs = session.enrichmentJobs || [];
    const queueSummary = enrichmentSummary(jobs);
    return (
      <>
        <Alert variant="info">
          Optional enhancement queue. Enhance tunes individually, then return to import review.
        </Alert>
        <div className="import-review-enrichment-toolbar">
          <span className="text-muted">
            {queueSummary.awaiting} awaiting · {queueSummary.running} running · {queueSummary.pending} pending · {queueSummary.ready} ready · {queueSummary.skipped} skipped
          </span>
          <div className="import-review-enrichment-toolbar-actions">
            <Button
              size="sm"
              variant="outline-warning"
              disabled={queueSummary.pending === 0 && queueSummary.awaiting === 0}
              onClick={function() {
                if (typeof props.onSessionChange !== 'function') return;
                props.onSessionChange(Object.assign({}, session, {
                  skipEnrichForRemaining: true,
                  enrichmentJobs: skipAllPendingEnrichmentJobs(session.enrichmentJobs),
                }));
              }}
            >
              Skip all remaining
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={function() {
                if (typeof props.onSessionChange !== 'function') return;
                props.onSessionChange(Object.assign({}, session, {
                  enrichmentJobs: clearEnrichmentQueue(session.enrichmentJobs),
                }));
              }}
            >
              Clear queue
            </Button>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={function() {
                if (typeof props.onSessionChange !== 'function') return;
                props.onSessionChange(Object.assign({}, session, {
                  phase: 'identify',
                  step: 'review',
                }));
              }}
            >
              Back to review
            </Button>
          </div>
        </div>
        <ListGroup className="import-review-enrichment-list">
          {jobs.map(function(job) {
            const ready = job.status === 'done' && job.enrichedTune;
            const imported = !!(session.importedCandidateIds || {})[job.candidateId];
            return (
              <ListGroup.Item key={job.id}>
                <div className="import-review-enrichment-item">
                  <div>
                    <strong>{job.title || 'Untitled'}</strong>
                    {job.artist ? <span className="text-muted"> — {job.artist}</span> : null}
                    <div className="text-muted small">{job.message || job.error || job.skipReason || ''}</div>
                  </div>
                  <div className="import-review-enrichment-item-actions">
                    <Badge bg={
                      job.status === 'done' ? 'success'
                        : job.status === 'running' ? 'primary'
                          : job.status === 'error' ? 'danger'
                            : job.status === 'awaiting' ? 'info'
                              : job.status === 'skipped' ? 'secondary' : 'warning'
                    }>
                      {imported ? 'imported' : job.status}
                    </Badge>
                    {job.status === 'awaiting' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={function() {
                            if (typeof props.onSessionChange !== 'function') return;
                            props.onSessionChange(Object.assign({}, session, {
                              enrichmentJobs: startEnrichmentJob(session.enrichmentJobs, job.id),
                            }));
                          }}
                        >
                          Enhance
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={function() {
                            if (typeof props.onSessionChange !== 'function') return;
                            props.onSessionChange(Object.assign({}, session, {
                              enrichmentJobs: skipEnrichmentJob(session.enrichmentJobs, job.id, 'skipped-by-user'),
                            }));
                          }}
                        >
                          Skip enhancement
                        </Button>
                      </>
                    )}
                    {ready && !imported && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={function() {
                          if (typeof props.onSessionChange !== 'function') return;
                          props.onSessionChange(beginMergeForJob(session, job));
                        }}
                      >
                        Review &amp; import
                      </Button>
                    )}
                  </div>
                </div>
              </ListGroup.Item>
            );
          })}
        </ListGroup>
      </>
    );
  }

  function renderUnifiedReview() {
    const showYoutube = activeCandidate && !shouldSkipYoutubeStep(Object.assign({}, activeCandidate, {
      youtubeUrl: youtubeUrl,
      tune: Object.assign({}, activeCandidate.tune, {
        links: youtubeUrl.trim()
          ? [{ link: youtubeUrl.trim(), title: '', startAt: '', endAt: '' }]
          : (activeCandidate.tune && activeCandidate.tune.links) || [],
      }),
    }));
    const youtubeSearchQuery = [title, artist].filter(Boolean).join(' ');

    return (
      <>
        <div className="border rounded p-2 mb-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
              <Button variant="outline-secondary" disabled tabIndex={-1} size="sm" style={{ opacity: 1, color: 'inherit' }}>
                Add From
              </Button>
              <Button
                size="sm"
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
        <div className="border rounded p-2 mb-3">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6em', flexWrap: 'wrap' }}>
            <strong>
              {mergeTargetId && tunes[mergeTargetId]
                ? ('Merging ' + differingMergeRows.length + ' fields into tune ' + (tunes[mergeTargetId].name || 'Untitled'))
                : ('Adding Tune ' + (title.trim() || 'Untitled'))}
            </strong>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-expanded={mergeDetailsOpen}
              aria-controls={MERGE_DETAILS_PANEL_ID}
              onClick={function() { setMergeDetailsOpen(function(open) { return !open; }); }}
            >
              {mergeDetailsOpen ? 'Hide details' : 'Show details'}
            </Button>
          </div>
          {mergeDetailsOpen ? (
            <div
              id={MERGE_DETAILS_PANEL_ID}
              role="region"
              aria-label="Merge field details"
              className="mt-2"
              style={{ maxHeight: '18em', overflowY: 'auto' }}
            >
              {(mergeTargetId ? differingMergeRows : mergeRows).map(function(row) {
                return (
                  <div key={row.key} className="border rounded p-2 mb-2">
                    <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={!!fieldMergeSelections[row.key]}
                          onChange={function(e) {
                            setFieldMergeSelections(function(prev) {
                              return Object.assign({}, prev, { [row.key]: !!e.target.checked });
                            });
                          }}
                        />
                        <span>{row.label}</span>
                      </label>
                    </div>
                    <div className="small text-muted mt-1">Before: {row.originalDisplay}</div>
                    <div className="small text-muted">After: {row.importedDisplay}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <Form.Group className="mb-3">
          <Form.Label>Title</Form.Label>
          <Form.Control value={title} onChange={function(e) { setTitle(e.target.value); }} />
        </Form.Group>
        <Form.Group className="mb-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap', marginBottom: '0.35em' }}>
            <Form.Label style={{ marginBottom: 0 }}>Artist</Form.Label>
            <ComposerSearchButton
              title={title}
              composer={artist}
              titleHint={title}
              token={props.token}
              tunebook={props.tunebook}
              resolverAvailable={props.resolverAvailable}
              disabled={!title.trim()}
              inline={true}
              onComposer={function(result) {
                if (result && result.artist) setArtist(result.artist)
              }}
            />
          </div>
          <Form.Control value={artist} onChange={function(e) { setArtist(e.target.value); }} />
          {activeJob && Array.isArray(activeJob.composerCandidates) && activeJob.composerCandidates.length > 0 ? (
            <ComposerCandidateQuickPick
              className="mt-2"
              candidates={activeJob.composerCandidates}
              placeholder="Review discovered artist…"
              onSelect={function(value) { setArtist(value); }}
            />
          ) : null}
        </Form.Group>
        <TuneAliasesField
          value={aliases}
          onChange={function(next) { setAliases(next); }}
        />

        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Genre</Form.Label>
              <Form.Control value={genre} onChange={function(e) { setGenre(e.target.value); }} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Rhythm</Form.Label>
              <Form.Control value={rhythm} onChange={function(e) { setRhythm(e.target.value); }} />
            </Form.Group>
          </Col>
        </Row>

        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Key</Form.Label>
              <Form.Control value={keyName} onChange={function(e) { setKeyName(e.target.value); }} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Meter</Form.Label>
              <Form.Control value={meter} onChange={function(e) { setMeter(e.target.value); }} />
            </Form.Group>
          </Col>
        </Row>

        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Book(s)</Form.Label>
              <Form.Control
                value={bookList}
                placeholder="comma separated"
                onChange={function(e) { setBookList(e.target.value); }}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Tags</Form.Label>
              <Form.Control
                value={tagList}
                placeholder="comma separated"
                onChange={function(e) { setTagList(e.target.value); }}
              />
            </Form.Group>
          </Col>
        </Row>

        <div className="mb-3">
          <Form.Label>Links</Form.Label>
          <LinksEditor
            links={links}
            tune={editedTunePreview}
            tuneId={editedTunePreview && editedTunePreview.id}
            tunebook={props.tunebook}
            token={props.token}
            forceRefresh={props.forceRefresh}
            simplified={true}
            onChange={setLinks}
          />
        </div>

        <Form.Group className="mb-3">
          <Form.Label>Source URL</Form.Label>
          <Form.Control value={srcUrl} onChange={function(e) { setSrcUrl(e.target.value); }} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Background info</Form.Label>
          <Form.Control as="textarea" rows={6} value={backgroundInfo} onChange={function(e) { setBackgroundInfo(e.target.value); }} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Lyrics</Form.Label>
          <Form.Control as="textarea" rows={8} value={lyrics} onChange={function(e) { setLyrics(e.target.value); }} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>ABC Notes</Form.Label>
          <Form.Control as="textarea" rows={10} value={notes} onChange={function(e) { setNotes(e.target.value); }} />
        </Form.Group>

        {showYoutube ? (
          <Form.Group className="mb-3">
            <Form.Label>YouTube link</Form.Label>
            <div className="d-flex flex-wrap gap-2 align-items-start">
              <Form.Control
                value={youtubeUrl}
                onChange={function(e) { setYoutubeUrl(e.target.value); }}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              {resolverAvailable && (
                <YouTubeSearchModal
                  tunebook={props.tunebook}
                  value={youtubeSearchQuery}
                  onChange={function(link) {
                    if (link && link.link) setYoutubeUrl(link.link);
                  }}
                  triggerElement={
                    <Button variant="outline-primary" size="sm">Search YouTube</Button>
                  }
                />
              )}
            </div>
          </Form.Group>
        ) : null}

      </>
    );
  }

  function renderMergeChoicesPanel() {
    return (
      <>
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
                        aria-label={`Open tune ${tune.name}`}
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
                        aria-label={selected ? `Selected merge target ${tune.name}` : `Merge into ${tune.name}`}
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
        <h6>Fields to import</h6>
        <TuneImportFieldPicker
          idPrefix={mergeTargetId ? '-review' : '-review-new'}
          originalTune={mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : { id: 'new', name: '', composer: '' }}
          importedTune={editedTunePreview}
          onlyDiffering={!!(mergeTargetId && tunes[mergeTargetId])}
          onSelectionsChange={setFieldMergeSelections}
        />
      </>
    );
  }

  const isEnrichmentQueue = session.step === 'enrichmentQueue' && session.phase === 'enrichment';

  const panelBody = (
    <>
      <Row style={{ flexWrap: 'nowrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', paddingRight: '1rem' }}>
          {isEnrichmentQueue ? renderEnrichmentQueue() : renderUnifiedReview()}
        </div>
        <div style={{ flex: '0 0 320px', maxWidth: '320px', overflowY: 'auto' }}>
          {!isEnrichmentQueue ? renderMergeChoicesPanel() : null}
          {activeCandidate && activeCandidate.contentHashDuplicate && (
            <Alert variant="warning">This item matches existing content in your collection.</Alert>
          )}
          {activeCandidate && activeCandidate.sourceKind && (
            <div className="text-muted small">Source: {activeCandidate.sourceKind}</div>
          )}
          {activeJob && activeJob.status === 'running' && (
            <Alert variant="primary" className="mt-2">
              Enrichment running: {activeJob.message || 'Working…'}
            </Alert>
          )}
          {activeJob && activeJob.status === 'done' && activeJob.enrichedTune && (
            <Alert variant="success" className="mt-2">Enhanced data ready for import.</Alert>
          )}
        </div>
      </Row>
    </>
  );

  const canMoveQueue = (session && Array.isArray(session.candidates) && session.candidates.length > 1);
  const showEnhance = !isEnrichmentQueue && !session.skipEnrichment && activeCandidate && !activeCandidate.skipEnrich;
  const headerActions = (
    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end" style={{ marginLeft: 'auto' }}>
      {canMoveQueue ? (
        <>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(-1); }}>Prev</Button>
          <Button variant="outline-secondary" size="sm" onClick={function() { jumpQueue(1); }}>Next</Button>
        </>
      ) : null}
      <Button variant="outline-danger" onClick={props.onClose}>Cancel all</Button>
      {!isEnrichmentQueue ? (
        <Button variant="secondary" onClick={cancelCurrent}>Cancel</Button>
      ) : null}
      {showEnhance ? (
        <Button variant="outline-primary" onClick={function() {
          if (activeJob && activeJob.status === 'awaiting') {
            enqueueEnhancementForCurrent();
            return;
          }
          if (typeof props.onSessionChange === 'function') {
            const jobs = (session.enrichmentJobs || []).slice();
            if (!findEnrichmentJob(jobs, activeCandidate.id)) {
              jobs.push(createEnrichmentJob(activeCandidate));
            }
            props.onSessionChange(beginEnrichmentPhase(Object.assign({}, session, { enrichmentJobs: jobs })));
          }
        }}>
          Enhance
        </Button>
      ) : null}
      {!isEnrichmentQueue ? (
        <Button variant="success" onClick={finishCurrentCandidate}>Import</Button>
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
