import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, ProgressBar } from 'react-bootstrap';
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { useIsNarrowViewport } from '../useMediaQuery';
import { describeResolverAuthReason } from '../mediaProxyClient';
import { isAbortError } from '../abortUtils';
import { registerLongRunningJob } from '../longRunningJobRegistry';
import {
  buildTuneBackgroundSearchUrl,
  formatResearchDuration,
  researchTuneBackground,
} from '../tuneBackgroundResearchClient';
import GenreSuggestionOffer from './GenreSuggestionOffer';
import {
  buildGenreSearchContext,
  inferGenreFromSearchContext,
  shouldOfferGenreSuggestion,
} from '../genreInference';

function formatResearchError(error) {
  const message = error && error.message ? error.message : 'Background research failed';
  if (message.indexOf('Media proxy error 401') === 0) {
    return 'Google sign-in expired or invalid. Sign in again, or use web search below.';
  }
  if (message.indexOf('Media proxy error 403') === 0) {
    return 'Your Google account is not authorized for the media resolver. Use web search below.';
  }
  return message;
}

function hasExistingBackgroundInfo(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
);

export default function TuneBackgroundSearchButton({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [source, setSource] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [genreSuggestion, setGenreSuggestion] = useState(null);
  const elapsedTimerRef = useRef(null);
  const startedAtRef = useRef(0);
  const abortRef = useRef(null);
  const { available: resolverAvailable, status: resolverStatus, features, refreshMediaResolverHealth } = useMediaResolverHealth();
  const canResearchBackground = resolverAvailable && features.llm;

  const googleUrl = buildTuneBackgroundSearchUrl(title, artist, lyrics);
  const searchIcon = tunebook && tunebook.icons ? tunebook.icons.search : DEFAULT_SEARCH_ICON;
  const externalLinkIcon = tunebook && tunebook.icons ? tunebook.icons.externallink : null;

  useEffect(function() {
    return function() {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(function() {
    if (!busy) return undefined;
    return registerLongRunningJob({
      label: 'Background research',
      onCancel: cancelResearch,
    });
  }, [busy]);

  function cancelResearch() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    stopElapsedTimer();
    setBusy(false);
    setProgressMessage('');
    setProgressPercent(0);
  }

  function startElapsedTimer() {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(function() {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  function requestResearch() {
    if (!title) return;
    if (busy) {
      cancelResearch();
      return;
    }
    if (hasExistingBackgroundInfo(existingBackgroundInfo)) {
      setShowConfirm(true);
      return;
    }
    run();
  }

  async function run() {
    if (!title) return;
    setShowConfirm(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setProgressMessage('');
    setProgressPercent(0);
    setSource('');
    startElapsedTimer();
    try {
      const result = await researchTuneBackground({
        title: title,
        artist: artist || '',
        lyrics: typeof lyrics === 'string' ? lyrics : '',
        accessToken: token,
        signal: controller.signal,
        onProgress: function(message, progress, stage, serverElapsedMs) {
          setProgressMessage(message || '');
          if (typeof progress === 'number' && Number.isFinite(progress)) {
            setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))));
          }
          if (typeof serverElapsedMs === 'number' && serverElapsedMs >= 0) {
            setElapsedMs(serverElapsedMs);
          }
        },
      });
      if (typeof onBackgroundInfo === 'function') {
        onBackgroundInfo(result);
      }
      const timing = result.timing || {};
      const sourceLabel = [
        result.searchBackend,
        result.model,
        result.sources && result.sources.length > 0 ? result.sources.length + ' sources' : '',
        timing.wordCount ? timing.wordCount + ' words' : '',
        timing.totalMs ? formatResearchDuration(timing.totalMs) : '',
      ].filter(Boolean).join(' · ');
      setSource(sourceLabel);
      setProgressPercent(100);
      if (typeof onGenreAccept === 'function') {
        const inferred = inferGenreFromSearchContext(buildGenreSearchContext(result, {
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
    } catch (e) {
      if (isAbortError(e)) return;
      const message = e && e.message ? e.message : '';
      if (message.indexOf('Media proxy error 401') === 0
        || message.indexOf('Media proxy error 403') === 0) {
        refreshMediaResolverHealth();
      }
      setError(formatResearchError(e));
    } finally {
      stopElapsedTimer();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBusy(false);
      setProgressMessage('');
    }
  }

  return (
    <>
      <FieldLookupButtonGroup
        automaticLookup={canResearchBackground}
        busy={busy}
        disabled={!title || disabled}
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
      {source && !error && (
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
          <p>
            This will <strong>clear all existing background information</strong> for this tune
            and generate a new summary from web research.
          </p>
          <p style={{ marginBottom: 0 }}>Do you want to continue?</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowConfirm(false); }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run}>
            Clear and research
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
