import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, ListGroup, Modal, Row, Col } from 'react-bootstrap';
import {
  beginEnrichmentPhase,
  beginMergeForJob,
  candidateIdentityLabel,
  currentCandidate,
  isReviewComplete,
  markCandidateImported,
  mergeCandidate,
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
import YouTubeSearchModal from './YouTubeSearchModal';
import TuneAliasesField from './TuneAliasesField';
import ComposerSearchButton from './ComposerSearchButton';
import ComposerCandidateQuickPick from './ComposerCandidateQuickPick';

function IdentityBanner(props) {
  const title = props.title || '';
  const artist = props.artist || '';
  if (!title && !artist) return null;
  return (
    <div className="import-review-identity-banner">
      <div className="import-review-identity-banner-label">Current song</div>
      <div className="import-review-identity-banner-title">{title || 'Untitled'}</div>
      {artist ? (
        <div className="import-review-identity-banner-artist">{artist}</div>
      ) : null}
    </div>
  );
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

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [aliases, setAliases] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState(null);
  const [fieldMergeSelections, setFieldMergeSelections] = useState({});

  useEffect(function() {
    if (!activeCandidate) return;
    setTitle(activeCandidate.tune && activeCandidate.tune.name ? activeCandidate.tune.name : '');
    setArtist(activeCandidate.tune && activeCandidate.tune.composer ? activeCandidate.tune.composer : '');
    setAliases(Array.isArray(activeCandidate.tune && activeCandidate.tune.aliases)
      ? activeCandidate.tune.aliases.slice()
      : []);
    setYoutubeUrl(youtubeUrlFromCandidate(activeCandidate));
    setMergeTargetId(activeCandidate.mergeTargetId || null);
    setFieldMergeSelections({});
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

  useEffect(function() {
    if (!session || session.step !== 'review' || !activeCandidate) return;
    const imported = enrichedImportedTune || activeCandidate.tune;
    const original = mergeTargetId && tunes[mergeTargetId] ? tunes[mergeTargetId] : null;
    const mergedPreview = Object.assign({}, imported, {
      name: title.trim(),
      composer: artist.trim(),
      aliases: aliases.slice(),
    });
    const rows = buildTuneImportFieldRows(original || { id: 'new', name: '', composer: '' }, mergedPreview);
    const differing = rows.filter(function(row) { return row.differs; });
    setFieldMergeSelections(buildDefaultTuneImportSelections(
      mergeTargetId ? differing : rows
    ));
  }, [
    session && session.step,
    mergeTargetId,
    activeCandidate && activeCandidate.id,
    title,
    artist,
    aliases,
    tunes,
    enrichedImportedTune,
  ]);

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: title,
      artist: artist,
      tunes: tunes,
      youtubeUrl: youtubeUrl,
    });
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
    const links = Array.isArray(candidate.tune.links) ? candidate.tune.links.slice() : [];
    const yt = youtubeUrl.trim();
    if (yt) {
      const has = links.some(function(l) { return l && l.link === yt; });
      if (!has) links.push({ link: yt, title: '', startAt: '', endAt: '' });
    }
    return updateCurrentCandidate(session, {
      tune: Object.assign({}, candidate.tune, {
        name: title.trim(),
        composer: artist.trim(),
        aliases: aliases.slice(),
        links: links,
      }),
      youtubeUrl: yt,
      mergeTargetId: mergeTargetId,
    });
  }

  function finishCurrentCandidate() {
    const base = buildPersistedSession();
    const candidate = activeCandidate;
    if (!candidate) return;

    let candidateTune = Object.assign({}, enrichedImportedTune || candidate.tune, {
      name: title.trim(),
      composer: artist.trim(),
    });

    if (mergeTargetId && tunes[mergeTargetId]) {
      const rows = buildTuneImportFieldRows(tunes[mergeTargetId], candidateTune).filter(function(row) {
        return row.differs;
      });
      const selections = Object.keys(fieldMergeSelections).length > 0
        ? fieldMergeSelections
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

        <hr />
        <h6>Collection match</h6>
        <p className="text-muted small">
          Create a new tune or merge into an existing match, then choose fields to import.
        </p>
        <div style={{ marginBottom: '0.75em' }}>
          <Button
            variant={mergeTargetId ? 'outline-primary' : 'success'}
            onClick={function() { setMergeTargetId(null); }}
          >
            Create new tune
          </Button>
        </div>
        {matches.length === 0 && (
          <Alert variant="secondary">No close matches found in your collection.</Alert>
        )}
        {matches.length > 0 && (
          <ListGroup className="mb-3">
            {matches.map(function(entry) {
              const tune = entry.tune;
              const selected = mergeTargetId === tune.id;
              return (
                <ListGroup.Item key={tune.id} active={selected}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{tune.name}</strong>
                      {tune.composer && <span className="text-muted"> — {tune.composer}</span>}
                      {entry.confidence && (
                        <Badge bg="info" style={{ marginLeft: '0.4em' }}>{entry.confidence}</Badge>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4em' }}>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={function() {
                          if (typeof props.onOpenTune === 'function') props.onOpenTune(tune);
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant={selected ? 'primary' : 'outline-primary'}
                        onClick={function() { setMergeTargetId(tune.id); }}
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

        <hr />
        <h6>Fields to import</h6>
        {mergeTargetId && tunes[mergeTargetId] ? (
          <>
            <Alert variant="info">
              Review fields to merge into <strong>{tunes[mergeTargetId].name}</strong>.
            </Alert>
            <TuneImportFieldPicker
              idPrefix="-review"
              originalTune={tunes[mergeTargetId]}
              importedTune={Object.assign({}, enrichedImportedTune || activeCandidate.tune, {
                name: title.trim(),
                composer: artist.trim(),
              })}
              onlyDiffering={true}
              onSelectionsChange={setFieldMergeSelections}
            />
          </>
        ) : (
          <>
            <Alert variant="info">Review the imported tune before saving it as a new entry.</Alert>
            <TuneImportFieldPicker
              idPrefix="-review-new"
              originalTune={{ id: 'new', name: '', composer: '' }}
              importedTune={Object.assign({}, enrichedImportedTune || activeCandidate.tune, {
                name: title.trim(),
                composer: artist.trim(),
              })}
              onlyDiffering={false}
              onSelectionsChange={setFieldMergeSelections}
            />
          </>
        )}
      </>
    );
  }

  const isEnrichmentQueue = session.step === 'enrichmentQueue' && session.phase === 'enrichment';
  const bannerIdentity = { title: title, artist: artist };

  const panelBody = (
    <>
      {!isEnrichmentQueue && (
        <IdentityBanner title={bannerIdentity.title} artist={bannerIdentity.artist} />
      )}
      <Row>
        <Col md={8}>
          {isEnrichmentQueue ? renderEnrichmentQueue() : renderUnifiedReview()}
        </Col>
        <Col md={4}>
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
        </Col>
      </Row>
    </>
  );

  const panelFooter = isEnrichmentQueue ? (
    <>
      <Button variant="secondary" onClick={props.onClose}>Cancel import</Button>
      {isReviewComplete(session) ? (
        <Button variant="success" onClick={function() {
          if (typeof props.onComplete === 'function') props.onComplete(session);
        }}>
          Done
        </Button>
      ) : null}
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={props.onClose}>Cancel import</Button>
      {!session.skipEnrichment && activeCandidate && !activeCandidate.skipEnrich && (
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
      )}
      <Button variant="success" onClick={finishCurrentCandidate}>
        Import
      </Button>
    </>
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
        </div>
        {panelBody}
        <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top">
          {panelFooter}
        </div>
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
      <Modal.Header closeButton>
        <Modal.Title>
          Import review
          <span className="text-muted" style={{ fontSize: '0.85em', marginLeft: '0.75em' }}>
            {sessionProgressLabel(session)}
          </span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{panelBody}</Modal.Body>
      <Modal.Footer>{panelFooter}</Modal.Footer>
    </Modal>
  );
}
