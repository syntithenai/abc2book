import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ImportReviewModal from './ImportReviewModal'
import {
  appendImportReviewCandidates,
  createImportReviewSession,
  beginMergeForJob,
  currentCandidate,
  deferCandidateForEnhancement,
  updateCurrentCandidate,
} from '../importReviewSession'
import {
  detectContentHashDuplicates,
  showContentHashDuplicateToast,
  dismissContentHashDuplicateToast,
} from '../contentHashDuplicates'
import {
  createEnrichmentJob,
  findEnrichmentJob,
  patchEnrichmentJob,
  runEnrichmentJob,
  skipEnrichmentJob,
  skipAllPendingEnrichmentJobs,
  clearEnrichmentQueue,
  nextReadyJob,
  startEnrichmentJob,
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
import { dismissBackgroundReviewToast, snoozeBackgroundReviewToast } from '../backgroundReviewToast'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import { toast } from 'react-toastify'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { processReviewResult } from '../addSongModalHelper'
import { createAttachedAudioLink } from '../linkRecording'
import { readAudioFileMetadata } from '../audioFileMetadata'

function mergeDraftTune(importedTune, draftTune) {
  return Object.assign({}, importedTune || {}, draftTune || {})
}

async function audioFileToReviewCandidate(file, draft, token, driveApi) {
  const metadata = await readAudioFileMetadata(file)
  const title = metadata.title || (draft && draft.tune && draft.tune.name) || file.name
  const artist = metadata.artist || (draft && draft.tune && draft.tune.composer) || ''
  const tuneBase = Object.assign({}, (draft && draft.tune) || {}, {
    id: (draft && draft.tune && draft.tune.id) || ('candidate-' + Date.now()),
    name: title,
    composer: artist,
    links: [],
  })
  const result = await createAttachedAudioLink({
    tune: tuneBase,
    file: file,
    title: title,
    uploadToDrive: false,
    token: token,
    driveApi: driveApi,
  })
  return {
    tune: Object.assign({}, tuneBase, {
      links: [result.link],
      mediaCacheLocked: true,
    }),
    sourceKind: 'audio',
    mergeTargetId: draft && draft.mergeTargetId ? draft.mergeTargetId : null,
  }
}

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
  const navigate = useNavigate()
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
    }

    if (split.duplicates.length > 0) {
      showContentHashDuplicateToast({
        count: split.duplicates.length,
        onReview: function() {
          openSession(split.duplicates.concat(split.nonDuplicates))
          dismissContentHashDuplicateToast()
          showImportReviewUi()
          navigate('/review')
        },
      })
    }

    if (split.nonDuplicates.length > 0) {
      openSession(split.nonDuplicates)
    }
  }, [props.tunebook, props.tunesHash, resolverAvailable, navigate])

  useEffect(function() {
    registerImportReviewStarter(startReview)
    return function() {
      registerImportReviewStarter(null)
    }
  }, [startReview])

  const handleMatchComplete = useCallback(function(updatedSession) {
    updateSession(updatedSession)
  }, [updateSession])

  const handleReviewSourceImport = useCallback(async function(input, draft) {
    const current = getImportReviewSession()
    if (!current) return

    const importContext = buildImportContext({
      resolverAvailable: resolverAvailable,
      token: props.token,
      driveApi: driveApi,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: props.currentTuneBook,
    })

    const appendCandidates = function(candidates) {
      const merged = (candidates || []).map(function(candidate) {
        return Object.assign({}, candidate, {
          tune: mergeDraftTune(candidate && candidate.tune, draft && draft.tune),
          mergeTargetId: candidate && candidate.mergeTargetId != null
            ? candidate.mergeTargetId
            : (draft && draft.mergeTargetId) || null,
        })
      })
      updateSession(appendImportReviewCandidates(getImportReviewSession(), merged))
    }

    const applyImportedTune = function(importedTune) {
      const sessionNow = getImportReviewSession()
      if (!sessionNow) return
      const candidate = currentCandidate(sessionNow)
      if (!candidate) return
      updateSession(updateCurrentCandidate(sessionNow, {
        tune: mergeDraftTune(importedTune, draft && draft.tune),
        mergeTargetId: (draft && draft.mergeTargetId) || candidate.mergeTargetId || null,
      }))
    }

    const normalizedInput = input && input.file ? input.file : input
    const result = await dispatchAddImport(normalizedInput, importContext)
    if (!result || result.action === 'error') {
      throw new Error(result && result.message ? result.message : 'Import failed.')
    }

    if (result.action === 'audio') {
      const files = result.files || []
      if (files.length === 0) return
      const candidates = []
      for (let i = 0; i < files.length; i += 1) {
        candidates.push(await audioFileToReviewCandidate(files[i], draft, props.token, driveApi))
      }
      appendCandidates(candidates)
      return
    }

    if (result.action === 'review') {
      const outcome = processReviewResult(result, { stayOnForm: true }, applyImportedTune, appendCandidates, toast)
      if (outcome.handled) return
    }
  }, [resolverAvailable, props.token, props.tunebook, props.currentTuneBook, abcjsParser, driveApi, updateSession, props.forceRefresh])

  const handleEnhanceAndAdvance = useCallback(function(persistedSession) {
    const candidate = currentCandidate(persistedSession)
    if (!candidate) return
    let jobs = (persistedSession.enrichmentJobs || []).slice()
    let job = findEnrichmentJob(jobs, candidate.id)
    if (!job) {
      jobs.push(createEnrichmentJob(candidate))
      job = findEnrichmentJob(jobs, candidate.id)
    }
    jobs = startEnrichmentJob(jobs, job.id)
    const next = deferCandidateForEnhancement(persistedSession, jobs)
    updateSession(Object.assign({}, next, { phase: 'enrichment' }))
    if (next.step === 'done') {
      hideImportReviewUi()
      navigate('/tunes')
    }
  }, [updateSession, navigate])

  const handleReviewYouTubeImport = useCallback(function(link, draft) {
    if (!link || !link.link) return
    const candidate = {
      tune: Object.assign({}, (draft && draft.tune) || {}, {
        links: [{ title: link.title || '', link: link.link, startAt: '', endAt: '' }],
      }),
      sourceKind: 'youtube',
      mergeTargetId: draft && draft.mergeTargetId ? draft.mergeTargetId : null,
    }
    updateSession(appendImportReviewCandidates(getImportReviewSession(), [candidate]))
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
    if (onReviewRoute) {
      navigate('/tunes')
    }
    if (typeof props.onComplete === 'function') props.onComplete(finalSession)
  }, [props, onReviewRoute, navigate])

  const enrichmentJobStatusKey = useMemo(function() {
    if (!session || !Array.isArray(session.enrichmentJobs)) return ''
    return session.enrichmentJobs.map(function(job) {
      return job.id + ':' + job.status
    }).join('|')
  }, [session && session.enrichmentJobs])

  const autoAdvanceMerge = onReviewRoute || !!props.autoAdvanceMerge
  const showModal = !!(session && session.step !== 'done' && uiVisible)

  const handleContinueLater = useCallback(function() {
    snoozeBackgroundReviewToast()
    hideImportReviewUi()
    navigate('/tunes')
  }, [navigate])

  useEffect(function() {
    if (!session || session.skipEnrichment) {
      clearImportReviewEnrichmentBridge()
      return undefined
    }
    const jobs = session.enrichmentJobs || []
    if (!jobs.length) {
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
      onContinueLater={handleContinueLater}
      session={session}
      onClose={function() {
        clearImportReviewEnrichmentBridge()
        clearImportReviewSession()
        dismissContentHashDuplicateToast()
        dismissBackgroundReviewToast()
        if (onReviewRoute) {
          navigate('/tunes')
        }
      }}
      onHide={function() {
        hideImportReviewUi()
      }}
      onSessionChange={updateSession}
      onMatchComplete={handleMatchComplete}
      onFinishCandidate={handleFinishCandidate}
      onEnhanceAndAdvance={handleEnhanceAndAdvance}
      onComplete={handleComplete}
      onOpenTune={props.onOpenTune}
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      login={props.login}
      requestGoogleScopes={props.requestGoogleScopes}
      forceRefresh={props.forceRefresh}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      resolverAvailable={resolverAvailable}
      onImportFile={handleReviewSourceImport}
      onImportFiles={function(files, draft) {
        return Promise.all((files || []).map(function(file) {
          return handleReviewSourceImport(file, draft)
        }))
      }}
      onImportText={handleReviewSourceImport}
      onImportSource={handleReviewSourceImport}
      onImportYouTube={handleReviewYouTubeImport}
    />
  )
}
