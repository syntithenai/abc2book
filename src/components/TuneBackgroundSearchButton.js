import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, ProgressBar } from 'react-bootstrap';
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { useIsNarrowViewport } from '../useMediaQuery';
import { describeResolverAuthReason } from '../mediaProxyClient';
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue';
import {
  applyBackgroundResearchChoice,
  dismissBackgroundResearch,
} from '../bulkBackgroundResearchQueue';
import {
  buildTuneBackgroundSearchUrl,
  formatResearchDuration,
} from '../tuneBackgroundResearchClient';
import GenreSuggestionOffer from './GenreSuggestionOffer';
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference';

function hasExistingBackgroundInfo(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

function findTuneJob(jobs, tuneId) {
  if (!tuneId || !Array.isArray(jobs)) return null;
  return jobs.find(function(job) {
    return job.tuneId === tuneId
      && (job.status === 'pending' || job.status === 'running');
  }) || null;
}

function findAwaitingTuneJob(jobs, tuneId) {
  if (!tuneId || !Array.isArray(jobs)) return null;
  return jobs.find(function(job) {
    return job.tuneId === tuneId && job.status === 'awaiting';
  }) || null;
}

function formatResultSource(meta) {
  if (!meta) return '';
  return [
    meta.searchBackend,
    meta.model,
    meta.sourceCount ? meta.sourceCount + ' sources' : '',
    meta.wordCount ? meta.wordCount + ' words' : '',
    meta.totalMs ? formatResearchDuration(meta.totalMs) : '',
  ].filter(Boolean).join(' · ');
}

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
);

export default function TuneBackgroundSearchButton({
  tuneId,
  title,
  artist,
  lyrics,
  rhythm,
  currentGenre,
  onGenreAccept,
  token,
  existingBackgroundInfo,
  onBackgroundInfo,
  buttonStyle,
  disabled,
  tunebook,
}) {
  const narrow = useIsNarrowViewport();
  const queue = useBulkBackgroundResearchQueue();
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReviewAccept, setShowReviewAccept] = useState(false);
  const [pendingReviewText, setPendingReviewText] = useState('');
  const [genreSuggestion, setGenreSuggestion] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedTimerRef = useRef(null);
  const startedAtRef = useRef(0);
  const startedJobIdRef = useRef(null);
  const handledTerminalJobRef = useRef(null);
  const pendingModeRef = useRef('auto');
  const { available: resolverAvailable, status: resolverStatus, features, refreshMediaResolverHealth } = useMediaResolverHealth();
  const canResearchBackground = resolverAvailable && features.llm;

  const googleUrl = buildTuneBackgroundSearchUrl(title, artist, lyrics);
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : DEFAULT_SEARCH_ICON;
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null;

  const activeJob = findTuneJob(queue.state.jobs, tuneId);
  const awaitingJob = findAwaitingTuneJob(queue.state.jobs, tuneId);
  const busy = !!activeJob;
  const progressPercent = activeJob ? (activeJob.progress || 0) : 0;
  const progressMessage = activeJob ? (activeJob.message || '') : '';

  useEffect(function() {
    return function() {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  useEffect(function() {
    if (!tuneId || startedJobIdRef.current) return;
    if (activeJob) startedJobIdRef.current = activeJob.id;
  }, [tuneId, activeJob]);

  useEffect(function() {
    if (!busy) {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      return undefined;
    }
    if (!elapsedTimerRef.current) {
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      elapsedTimerRef.current = setInterval(function() {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 500);
    }
    return undefined;
  }, [busy]);

  useEffect(function() {
    if (awaitingJob && awaitingJob.resultText) {
      setPendingReviewText(awaitingJob.resultText);
      setShowReviewAccept(true);
      setSource(formatResultSource(awaitingJob.resultMeta) || 'ready');
    }
  }, [awaitingJob]);

  useEffect(function() {
    const jobId = startedJobIdRef.current;
    if (!jobId || handledTerminalJobRef.current === jobId) return;
    const terminal = (queue.state.jobs || []).find(function(job) {
      return job.id === jobId
        && (job.status === 'done' || job.status === 'error' || job.status === 'cancelled');
    });
    if (!terminal) return;

    handledTerminalJobRef.current = terminal.id;

    if (terminal.status === 'cancelled') {
      setError('');
      setSource('');
      return;
    }

    if (terminal.status === 'error') {
      const message = terminal.error || 'Background research failed';
      if (message.indexOf('Media proxy error 401') === 0
        || message.indexOf('Media proxy error 403') === 0) {
        refreshMediaResolverHealth();
      }
      setError(message);
      setSource('');
      return;
    }

    setError('');
    setSource(formatResultSource(terminal.resultMeta) || 'saved');
    if (typeof onBackgroundInfo === 'function' && terminal.resultText) {
      onBackgroundInfo({ text: terminal.resultText });
    }
    if (typeof onGenreAccept === 'function' && terminal.resultText) {
      const inferred = inferGenreFromSearchContext(buildGenreSearchContext({
        text: terminal.resultText,
      }, {
        title: title,
        artist: artist,
        rhythm: rhythm,
      }));
      if (inferred && shouldOfferGenreSuggestion(inferred.genre, currentGenre)) {
        setGenreSuggestion(inferred);
      } else {
        setGenreSuggestion(null);
      }
    }
  }, [
    queue.state.jobs,
    onBackgroundInfo,
    onGenreAccept,
    title,
    artist,
    rhythm,
    currentGenre,
    refreshMediaResolverHealth,
  ]);

  function cancelResearch() {
    if (!activeJob) return;
    queue.cancelJob(activeJob.id);
  }

  function requestResearch(mode) {
    if (!title || !tuneId) return;
    if (busy) {
      cancelResearch();
      return;
    }
    pendingModeRef.current = mode === 'review' ? 'review' : 'auto';
    if (hasExistingBackgroundInfo(existingBackgroundInfo)) {
      setShowConfirm(true);
      return;
    }
    run(false, pendingModeRef.current);
  }

  function run(force, mode) {
    if (!title || !tuneId) return;
    setShowConfirm(false);
    setError('');
    setSource('');
    setGenreSuggestion(null);
    setShowReviewAccept(false);
    setPendingReviewText('');

    const searchMode = mode === 'review' ? 'review' : 'auto';
    const tune = {
      id: tuneId,
      name: title,
      composer: artist || '',
      backgroundInfo: typeof existingBackgroundInfo === 'string' ? existingBackgroundInfo : '',
    };
    const lyricsText = typeof lyrics === 'string' ? lyrics : '';
    const ids = queue.enqueueTunes([tune], {
      accessToken: token,
      force: !!force,
      searchMode: searchMode,
      lyricsForTune: function() { return lyricsText; },
    });
    startedJobIdRef.current = ids[0] || null;
    handledTerminalJobRef.current = null;
    queue.start();
  }

  function acceptReviewResult() {
    if (awaitingJob) {
      applyBackgroundResearchChoice(awaitingJob.id);
      if (typeof onBackgroundInfo === 'function' && awaitingJob.resultText) {
        onBackgroundInfo({ text: awaitingJob.resultText });
      }
    } else if (pendingReviewText && typeof onBackgroundInfo === 'function') {
      onBackgroundInfo({ text: pendingReviewText });
    }
    setShowReviewAccept(false);
    setPendingReviewText('');
    setSource('accepted');
  }

  function dismissReviewResult() {
    if (awaitingJob) dismissBackgroundResearch(awaitingJob.id);
    setShowReviewAccept(false);
    setPendingReviewText('');
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={canResearchBackground}
        busy={busy}
        disabled={!title || !tuneId || disabled}
        externalUrl={googleUrl}
        externalLinkIcon={externalLinkIcon}
        narrow={narrow}
        onSearch={requestResearch}
        buttonStyle={buttonStyle}
        searchIcon={searchIcon}
      />
      {busy && (
        <div style={{ marginTop: '0.75em', maxWidth: '28em', clear: 'both' }}>
          <ProgressBar
            now={progressPercent}
            label={progressPercent + '%'}
            animated
            striped
            variant={progressPercent >= 65 ? 'warning' : 'info'}
          />
          <div style={{ marginTop: '0.35em', fontSize: '0.9em', color: '#555' }}>
            {progressMessage || 'Starting research...'}
            {elapsedMs > 0 && <span> · {formatResearchDuration(elapsedMs)}</span>}
            <span> · continues in background</span>
          </div>
        </div>
      )}
      {error && (
        <Alert variant="danger" style={{ marginTop: '0.75em', clear: 'both' }}>
          {error}
          {resolverStatus && resolverStatus.authReason && (
            <div style={{ marginTop: '0.35em', fontSize: '0.9em' }}>
              {describeResolverAuthReason(resolverStatus.authReason)}
            </div>
          )}
          <div style={{ marginTop: '0.5em' }}>
            <a target="_blank" rel="noreferrer" href={googleUrl}>Open web search instead</a>
          </div>
        </Alert>
      )}
      {source && !error && !showReviewAccept && (
        <Alert variant="success" style={{ marginTop: '0.75em', clear: 'both' }}>
          Background imported ({source})
        </Alert>
      )}

      <GenreSuggestionOffer
        suggestion={genreSuggestion}
        onAccept={function(genre) {
          if (typeof onGenreAccept === 'function') onGenreAccept(genre);
          setGenreSuggestion(null);
        }}
        onDismiss={function() { setGenreSuggestion(null); }}
      />

      <Modal show={showConfirm} onHide={function() { setShowConfirm(false); }}>
        <Modal.Header closeButton>
          <Modal.Title>Replace background information?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          This tune already has background information. Replace it with a new research result?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowConfirm(false); }}>Cancel</Button>
          <Button variant="warning" onClick={function() { run(true, pendingModeRef.current); }}>Replace</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showReviewAccept} onHide={dismissReviewResult} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Review background information</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }}>
            {pendingReviewText}
          </pre>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={dismissReviewResult}>Dismiss</Button>
          <Button variant="success" onClick={acceptReviewResult}>Apply</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
