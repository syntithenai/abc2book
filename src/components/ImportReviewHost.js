import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImportReviewModal from './ImportReviewModal';
import {
  createImportReviewSession,
  completeIdentificationForCurrent,
  beginMergeForCandidateIndex,
  isReviewSessionActive,
} from '../importReviewSession';
import {
  detectContentHashDuplicates,
  showContentHashDuplicateToast,
  dismissContentHashDuplicateToast,
} from '../contentHashDuplicates';
import {
  createEnrichmentJob,
  findEnrichmentJob,
  patchEnrichmentJob,
  runEnrichmentJob,
  skipEnrichmentJob,
  skipAllPendingEnrichmentJobs,
  clearEnrichmentQueue,
} from '../importReviewEnrichmentQueue';
import {
  syncImportReviewEnrichment,
  clearImportReviewEnrichmentBridge,
} from '../importReviewEnrichmentBridge';
import useAbcjsParser from '../useAbcjsParser';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useGoogleDocument from '../useGoogleDocument';

export default function ImportReviewHost(props) {
  const [session, setSession] = useState(null);
  const [show, setShow] = useState(false);
  const abcjsParser = useAbcjsParser();
  const { available: resolverAvailable, features } = useMediaResolverHealth();
  const driveApi = useGoogleDocument(props.token, props.logout || function() {}, props.forceRefresh);
  const runningJobRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(function() {
    sessionRef.current = session;
  }, [session]);

  const notifyActive = useCallback(function(nextSession) {
    if (typeof props.onActiveChange === 'function') {
      props.onActiveChange(isReviewSessionActive(nextSession));
    }
  }, [props.onActiveChange]);

  const startReview = useCallback(function(candidates) {
    const tunebook = props.tunebook;
    const tunesHash = props.tunesHash;
    const split = detectContentHashDuplicates(candidates, tunebook, tunesHash, props.tunes);
    dismissContentHashDuplicateToast();

    function openSession(list) {
      const nextSession = createImportReviewSession(list, {
        skipEnrichment: !resolverAvailable,
      });
      setSession(nextSession);
      setShow(true);
      notifyActive(nextSession);
    }

    if (split.duplicates.length > 0) {
      showContentHashDuplicateToast({
        count: split.duplicates.length,
        onReview: function() {
          openSession(split.duplicates.concat(split.nonDuplicates));
          dismissContentHashDuplicateToast();
        },
      });
    }

    if (split.nonDuplicates.length > 0) {
      openSession(split.nonDuplicates);
    }
  }, [props.tunebook, props.tunesHash, props.tunes, notifyActive, resolverAvailable]);

  useEffect(function() {
    if (typeof props.onReady === 'function') {
      props.onReady(startReview);
    }
  }, [props.onReady, startReview]);

  const enqueueEnrichment = useCallback(function(updatedSession, candidate) {
    if (!candidate || candidate.skipEnrich) return updatedSession;
    const jobs = (updatedSession.enrichmentJobs || []).slice();
    if (findEnrichmentJob(jobs, candidate.id)) {
      return updatedSession;
    }
    jobs.push(createEnrichmentJob(candidate));
    return Object.assign({}, updatedSession, { enrichmentJobs: jobs });
  }, []);

  const handleMatchComplete = useCallback(function(updatedSession) {
    const candidate = updatedSession.candidates[updatedSession.index];
    let nextSession = updatedSession;
    if (updatedSession.skipEnrichment) {
      nextSession = beginMergeForCandidateIndex(updatedSession, updatedSession.index);
    } else {
      nextSession = enqueueEnrichment(updatedSession, candidate);
      nextSession = completeIdentificationForCurrent(nextSession, nextSession);
    }
    setSession(nextSession);
    notifyActive(nextSession);
  }, [enqueueEnrichment, notifyActive]);

  const finishCandidate = useCallback(function(updatedSession, done) {
    const mergeIndex = updatedSession.mergeIndex;
    const candidate = mergeIndex != null
      ? updatedSession.candidates[mergeIndex]
      : updatedSession.candidates[updatedSession.index];
    if (!candidate) {
      if (typeof done === 'function') done();
      return;
    }

    const tunebook = props.tunebook;
    const book = props.currentTuneBook;

    if (candidate.mergeTargetId && props.tunes && props.tunes[candidate.mergeTargetId]) {
      const merged = Object.assign({}, candidate.tune);
      merged.id = candidate.mergeTargetId;
      merged.lastUpdated = Date.now();
      tunebook.saveTune(merged);
    } else {
      const tune = Object.assign({}, candidate.tune);
      if (book) {
        const books = Array.isArray(tune.books) ? tune.books.slice() : [];
        if (books.indexOf(book) === -1) books.push(book);
        tune.books = books;
      }
      tunebook.saveTune(tune);
    }

    if (typeof props.forceRefresh === 'function') props.forceRefresh();
    if (typeof done === 'function') done();
  }, [props]);

  const handleComplete = useCallback(function(finalSession) {
    clearImportReviewEnrichmentBridge();
    setShow(false);
    setSession(null);
    dismissContentHashDuplicateToast();
    notifyActive(null);
    if (typeof props.onComplete === 'function') props.onComplete(finalSession);
  }, [props, notifyActive]);

  const enrichmentJobStatusKey = useMemo(function() {
    if (!session || !Array.isArray(session.enrichmentJobs)) return '';
    return session.enrichmentJobs.map(function(job) {
      return job.id + ':' + job.status;
    }).join('|');
  }, [session && session.enrichmentJobs]);

  useEffect(function() {
    if (!show || !session || session.skipEnrichment) {
      clearImportReviewEnrichmentBridge();
      return undefined;
    }
    if (session.phase !== 'enrichment' && session.phase !== 'merge') {
      clearImportReviewEnrichmentBridge();
      return undefined;
    }
    syncImportReviewEnrichment({
      jobs: session.enrichmentJobs || [],
      onSkipJob: function(jobId) {
        setSession(function(current) {
          if (!current) return current;
          return Object.assign({}, current, {
            enrichmentJobs: skipEnrichmentJob(current.enrichmentJobs, jobId, 'skipped-by-user'),
          });
        });
      },
      onSkipAll: function() {
        setSession(function(current) {
          if (!current) return current;
          return Object.assign({}, current, {
            skipEnrichForRemaining: true,
            enrichmentJobs: skipAllPendingEnrichmentJobs(current.enrichmentJobs),
          });
        });
      },
      onClear: function() {
        setSession(function(current) {
          if (!current) return current;
          return Object.assign({}, current, {
            enrichmentJobs: clearEnrichmentQueue(current.enrichmentJobs),
          });
        });
      },
    });
    return function() {
      clearImportReviewEnrichmentBridge();
    };
  }, [show, session, enrichmentJobStatusKey]);

  useEffect(function() {
    if (!session || !show) return;
    if (session.skipEnrichment) return;
    if (session.phase !== 'enrichment' && session.phase !== 'merge') return;

    const jobs = session.enrichmentJobs || [];
    const running = jobs.find(function(job) { return job.status === 'running'; });
    if (running) {
      runningJobRef.current = running.id;
      return;
    }

    const pending = jobs.find(function(job) { return job.status === 'pending'; });
    if (!pending) {
      runningJobRef.current = null;
      return;
    }

    if (session.skipEnrichForRemaining) {
      setSession(function(current) {
        if (!current) return current;
        const nextJobs = current.enrichmentJobs.map(function(job) {
          if (job.status !== 'pending' && job.status !== 'awaiting') return job;
          return Object.assign({}, job, {
            status: 'skipped',
            skipReason: 'skipped-all',
          });
        });
        return Object.assign({}, current, { enrichmentJobs: nextJobs });
      });
      return;
    }

    let cancelled = false;
    runningJobRef.current = pending.id;

    setSession(function(current) {
      if (!current) return current;
      return Object.assign({}, current, {
        enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, pending.id, {
          status: 'running',
          message: 'Starting enrichment…',
          progress: 0,
        }),
      });
    });

    runEnrichmentJob(pending, session, {
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      accessToken: props.token && props.token.access_token,
      driveApi: driveApi,
      canAnalyzeMedia: resolverAvailable && !!features.whisper,
      onProgress: function(jobId, message, progress) {
        if (cancelled) return;
        setSession(function(current) {
          if (!current) return current;
          return Object.assign({}, current, {
            enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, jobId, {
              message: message || '',
              progress: typeof progress === 'number' ? Math.round(progress * 100) : 0,
            }),
          });
        });
      },
    }).then(function(result) {
      if (cancelled) return;
      setSession(function(current) {
        if (!current) return current;
        const job = (current.enrichmentJobs || []).find(function(item) {
          return item.id === pending.id;
        });
        if (!job || job.status === 'skipped') return current;
        return Object.assign({}, current, {
          enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, pending.id, {
            status: 'done',
            progress: 100,
            message: 'Ready for import',
            enrichedTune: result.enrichedTune,
            composerCandidates: result.composerCandidates || [],
          }),
        });
      });
    }).catch(function(error) {
      if (cancelled) return;
      setSession(function(current) {
        if (!current) return current;
        const job = (current.enrichmentJobs || []).find(function(item) {
          return item.id === pending.id;
        });
        if (!job || job.status === 'skipped') return current;
        return Object.assign({}, current, {
          enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, pending.id, {
            status: 'error',
            error: error && error.message ? error.message : 'Enrichment failed',
            message: '',
          }),
        });
      });
    }).finally(function() {
      runningJobRef.current = null;
    });

    return function() {
      cancelled = true;
    };
  }, [
    show,
    session && session.phase,
    session && session.skipEnrichForRemaining,
    enrichmentJobStatusKey,
    props.tunebook,
    props.token,
    abcjsParser,
    driveApi,
    resolverAvailable,
    features.whisper,
  ]);

  return (
    <ImportReviewModal
      show={show}
      embedded={!!props.embedded}
      session={session}
      onClose={function() {
        clearImportReviewEnrichmentBridge();
        setShow(false);
        setSession(null);
        dismissContentHashDuplicateToast();
        notifyActive(null);
      }}
      onSessionChange={setSession}
      onMatchComplete={handleMatchComplete}
      onFinishCandidate={finishCandidate}
      onComplete={handleComplete}
      onOpenTune={props.onOpenTune}
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      user={props.user}
      login={props.login}
      requestGoogleScopes={props.requestGoogleScopes}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      resolverAvailable={resolverAvailable}
    />
  );
}
