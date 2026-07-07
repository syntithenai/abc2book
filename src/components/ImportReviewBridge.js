import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import ImportReviewModal from './ImportReviewModal'
import {
  createImportReviewSession,
  beginMergeForJob,
} from '../importReviewSession'
import {
  detectContentHashDuplicates,
  showContentHashDuplicateToast,
  dismissContentHashDuplicateToast,
} from '../contentHashDuplicates'
import {
  findEnrichmentJob,
  patchEnrichmentJob,
  runEnrichmentJob,
  skipEnrichmentJob,
  skipAllPendingEnrichmentJobs,
  clearEnrichmentQueue,
  nextReadyJob,
} from '../importReviewEnrichmentQueue'
import {
  syncImportReviewEnrichment,
  clearImportReviewEnrichmentBridge,
} from '../importReviewEnrichmentBridge'
import {
  clearImportReviewSession,
  getImportReviewSession,
  hideImportReviewUi,
  isImportReviewUiVisible,
  registerImportReviewStarter,
  setImportReviewSession,
  showImportReviewUi,
  subscribeImportReviewSession,
  getImportReviewSessionRevision,
} from '../importReviewSessionStore'
import { dismissBackgroundReviewToast } from '../backgroundReviewToast'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'

function useImportReviewStore() {
  const revision = useSyncExternalStore(
    subscribeImportReviewSession,
    getImportReviewSessionRevision,
    function() { return '' }
  )
  const session = useMemo(function() {
    return getImportReviewSession()
  }, [revision])
  const uiVisible = useMemo(function() {
    return isImportReviewUiVisible()
  }, [revision])
  return { session: session, uiVisible: uiVisible }
}

export default function ImportReviewBridge(props) {
  const location = useLocation()
  const onReviewRoute = location.pathname === '/review'
  const { session, uiVisible } = useImportReviewStore()
  const abcjsParser = useAbcjsParser()
  const { available: resolverAvailable, features } = useMediaResolverHealth()
  const driveApi = useGoogleDocument(props.token, props.login || function() {}, props.forceRefresh)
  const runningJobRef = useRef(null)
  const sessionRef = useRef(null)

  useEffect(function() {
    sessionRef.current = session
  }, [session])

  const updateSession = useCallback(function(next) {
    setImportReviewSession(next)
  }, [])

  const startReview = useCallback(function(candidates) {
    const tunebook = props.tunebook
    const tunesHash = props.tunesHash
    const split = detectContentHashDuplicates(candidates, tunebook, tunesHash)
    dismissContentHashDuplicateToast()

    function openSession(list) {
      const nextSession = createImportReviewSession(list, {
        skipEnrichment: !resolverAvailable,
      })
      setImportReviewSession(nextSession)
      showImportReviewUi()
    }

    if (split.duplicates.length > 0) {
      showContentHashDuplicateToast({
        count: split.duplicates.length,
        onReview: function() {
          openSession(split.duplicates.concat(split.nonDuplicates))
          dismissContentHashDuplicateToast()
        },
      })
    }

    if (split.nonDuplicates.length > 0) {
      openSession(split.nonDuplicates)
    }
  }, [props.tunebook, props.tunesHash, resolverAvailable])

  useEffect(function() {
    registerImportReviewStarter(startReview)
    return function() {
      registerImportReviewStarter(null)
    }
  }, [startReview])

  const handleMatchComplete = useCallback(function(updatedSession) {
    updateSession(updatedSession)
  }, [updateSession])

  const finishCandidate = useCallback(function(updatedSession, done) {
    const mergeIndex = updatedSession.mergeIndex
    const candidate = mergeIndex != null
      ? updatedSession.candidates[mergeIndex]
      : updatedSession.candidates[updatedSession.index]
    if (!candidate) {
      if (typeof done === 'function') done()
      return
    }

    const tunebook = props.tunebook
    const book = props.currentTuneBook

    if (candidate.mergeTargetId && props.tunes && props.tunes[candidate.mergeTargetId]) {
      const merged = Object.assign({}, candidate.tune)
      merged.id = candidate.mergeTargetId
      merged.lastUpdated = Date.now()
      tunebook.saveTune(merged)
    } else {
      const tune = Object.assign({}, candidate.tune)
      if (book) {
        const books = Array.isArray(tune.books) ? tune.books.slice() : []
        if (books.indexOf(book) === -1) books.push(book)
        tune.books = books
      }
      tunebook.saveTune(tune)
    }

    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof done === 'function') done()
  }, [props])

  const handleComplete = useCallback(function(finalSession) {
    clearImportReviewEnrichmentBridge()
    clearImportReviewSession()
    dismissContentHashDuplicateToast()
    dismissBackgroundReviewToast()
    if (typeof props.onComplete === 'function') props.onComplete(finalSession)
  }, [props])

  const enrichmentJobStatusKey = useMemo(function() {
    if (!session || !Array.isArray(session.enrichmentJobs)) return ''
    return session.enrichmentJobs.map(function(job) {
      return job.id + ':' + job.status
    }).join('|')
  }, [session && session.enrichmentJobs])

  const autoAdvanceMerge = onReviewRoute || !!props.autoAdvanceMerge
  const showModal = !!(session && session.step !== 'done' && (uiVisible || onReviewRoute))

  useEffect(function() {
    if (!session || session.skipEnrichment) {
      clearImportReviewEnrichmentBridge()
      return undefined
    }
    if (session.phase !== 'enrichment' && session.phase !== 'merge') {
      clearImportReviewEnrichmentBridge()
      return undefined
    }
    syncImportReviewEnrichment({
      jobs: session.enrichmentJobs || [],
      onSkipJob: function(jobId) {
        updateSession(Object.assign({}, getImportReviewSession(), {
          enrichmentJobs: skipEnrichmentJob(getImportReviewSession().enrichmentJobs, jobId, 'skipped-by-user'),
        }))
      },
      onSkipAll: function() {
        const current = getImportReviewSession()
        if (!current) return
        updateSession(Object.assign({}, current, {
          skipEnrichForRemaining: true,
          enrichmentJobs: skipAllPendingEnrichmentJobs(current.enrichmentJobs),
        }))
      },
      onClear: function() {
        const current = getImportReviewSession()
        if (!current) return
        updateSession(Object.assign({}, current, {
          enrichmentJobs: clearEnrichmentQueue(current.enrichmentJobs),
        }))
      },
    })
    return function() {
      clearImportReviewEnrichmentBridge()
    }
  }, [session, enrichmentJobStatusKey, updateSession])

  useEffect(function() {
    if (!session) return undefined
    if (session.skipEnrichment) return undefined
    if (session.phase !== 'enrichment' && session.phase !== 'merge') return undefined

    const jobs = session.enrichmentJobs || []
    const running = jobs.find(function(job) { return job.status === 'running' })
    if (running) {
      runningJobRef.current = running.id
      return undefined
    }

    const pending = jobs.find(function(job) { return job.status === 'pending' })
    if (!pending) {
      runningJobRef.current = null
      return undefined
    }

    if (session.skipEnrichForRemaining) {
      updateSession(Object.assign({}, session, {
        enrichmentJobs: session.enrichmentJobs.map(function(job) {
          if (job.status !== 'pending' && job.status !== 'awaiting') return job
          return Object.assign({}, job, {
            status: 'skipped',
            skipReason: 'skipped-all',
          })
        }),
      }))
      return undefined
    }

    let cancelled = false
    runningJobRef.current = pending.id

    updateSession(Object.assign({}, session, {
      enrichmentJobs: patchEnrichmentJob(session.enrichmentJobs, pending.id, {
        status: 'running',
        message: 'Starting enrichment…',
        progress: 0,
      }),
    }))

    runEnrichmentJob(pending, session, {
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      accessToken: props.token && props.token.access_token,
      driveApi: driveApi,
      canAnalyzeMedia: resolverAvailable && !!features.whisper,
      onProgress: function(jobId, message, progress) {
        if (cancelled) return
        const current = getImportReviewSession()
        if (!current) return
        updateSession(Object.assign({}, current, {
          enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, jobId, {
            message: message || '',
            progress: typeof progress === 'number' ? Math.round(progress * 100) : 0,
          }),
        }))
      },
    }).then(function(result) {
      if (cancelled) return
      const current = getImportReviewSession()
      if (!current) return
      const job = (current.enrichmentJobs || []).find(function(item) {
        return item.id === pending.id
      })
      if (!job || job.status === 'skipped') return
      updateSession(Object.assign({}, current, {
        enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, pending.id, {
          status: 'done',
          progress: 100,
          message: 'Ready for import',
          enrichedTune: result.enrichedTune,
          composerCandidates: result.composerCandidates || [],
        }),
      }))
    }).catch(function(error) {
      if (cancelled) return
      const current = getImportReviewSession()
      if (!current) return
      const job = (current.enrichmentJobs || []).find(function(item) {
        return item.id === pending.id
      })
      if (!job || job.status === 'skipped') return
      updateSession(Object.assign({}, current, {
        enrichmentJobs: patchEnrichmentJob(current.enrichmentJobs, pending.id, {
          status: 'error',
          error: error && error.message ? error.message : 'Enrichment failed',
          message: '',
        }),
      }))
    }).finally(function() {
      runningJobRef.current = null
    })

    return function() {
      cancelled = true
    }
  }, [
    session,
    session && session.phase,
    session && session.skipEnrichForRemaining,
    enrichmentJobStatusKey,
    props.tunebook,
    props.token,
    abcjsParser,
    driveApi,
    resolverAvailable,
    features.whisper,
    updateSession,
  ])

  useEffect(function() {
    if (!autoAdvanceMerge || !session || session.phase !== 'enrichment' || session.step !== 'enrichmentQueue') {
      return
    }
    const ready = nextReadyJob(session.enrichmentJobs, session.importedCandidateIds)
    if (!ready) return
    updateSession(beginMergeForJob(session, ready))
  }, [
    autoAdvanceMerge,
    session,
    enrichmentJobStatusKey,
    session && session.importedCandidateIds,
    updateSession,
  ])

  const handleFinishCandidate = useCallback(function(updatedSession, done) {
    finishCandidate(updatedSession, function() {
      let nextSession = updatedSession
      if (autoAdvanceMerge) {
        const imported = Object.assign({}, updatedSession.importedCandidateIds || {})
        const candidate = updatedSession.candidates[updatedSession.mergeIndex != null
          ? updatedSession.mergeIndex
          : updatedSession.index]
        if (candidate) imported[candidate.id] = true
        const ready = nextReadyJob(updatedSession.enrichmentJobs, imported)
        if (ready) {
          nextSession = beginMergeForJob(updatedSession, ready)
        }
      }
      updateSession(nextSession)
      if (typeof done === 'function') done()
    })
  }, [finishCandidate, autoAdvanceMerge, updateSession])

  return (
    <ImportReviewModal
      show={showModal}
      embedded={!!props.embedded}
      reviewPageMode={onReviewRoute}
      session={session}
      onClose={function() {
        clearImportReviewEnrichmentBridge()
        clearImportReviewSession()
        dismissContentHashDuplicateToast()
        dismissBackgroundReviewToast()
      }}
      onHide={function() {
        hideImportReviewUi()
      }}
      onSessionChange={updateSession}
      onMatchComplete={handleMatchComplete}
      onFinishCandidate={handleFinishCandidate}
      onComplete={handleComplete}
      onOpenTune={props.onOpenTune}
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      resolverAvailable={resolverAvailable}
    />
  )
}
