import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ImportReviewModal from './ImportReviewModal'
import AudioDriveUploadModal from './AudioDriveUploadModal'
import {
  appendImportReviewCandidates,
  createImportReviewSession,
  createBlankAddCandidate,
  beginMergeForJob,
  currentCandidate,
  deferCandidateForEnhancement,
  isReviewSessionActive,
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
  hasActiveImportReviewSession,
  hideImportReviewUi,
  isImportReviewUiVisible,
  registerImportReviewStarter,
  setImportReviewSession,
  showImportReviewUi,
  subscribeImportReviewSession,
  getImportReviewSessionRevision,
} from '../importReviewSessionStore'
import { dismissBackgroundReviewToast, snoozeBackgroundReviewToast } from '../backgroundReviewToast'
import {
  seedAwaitingLookup,
  dismissFieldLookup,
  subscribe as subscribeFieldLookupQueue,
} from '../tuneFieldLookupQueue'
import { promoteAwaitingFieldLookups } from '../fieldLookupReviewPromotion'
import { buildComposerPickerCandidates } from '../composerDiscoveryUtils'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import { toast } from 'react-toastify'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { processReviewResult } from '../addSongModalHelper'
import { createAttachedAudioLink } from '../linkRecording'
import { readAudioFileMetadata } from '../audioFileMetadata'
import { mergeImportedLinks } from '../importReviewFieldUtils'
import {
  asIndependentReviewCandidate,
  freshTuneId,
  mergeDraftTune,
} from '../importReviewCandidateUtils'

async function audioFileToReviewCandidate(file, draft, token, driveApi, uploadToDrive) {
  const metadata = await readAudioFileMetadata(file)
  const title = metadata.title || (draft && draft.tune && draft.tune.name) || file.name
  const artist = metadata.artist || (draft && draft.tune && draft.tune.composer) || ''
  const tuneBase = {
    id: freshTuneId(),
    name: title,
    composer: artist,
    links: [],
  }
  const result = await createAttachedAudioLink({
    tune: tuneBase,
    file: file,
    title: title,
    uploadToDrive: !!uploadToDrive,
    token: token,
    driveApi: driveApi,
  })
  return {
    tune: Object.assign({}, tuneBase, {
      links: [result.link],
      mediaCacheLocked: true,
    }),
    sourceKind: 'audio',
    mergeTargetId: null,
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
  const [pendingAudioFiles, setPendingAudioFiles] = useState([])
  const [pendingAudioDraft, setPendingAudioDraft] = useState(null)
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false)

  useEffect(function() {
    sessionRef.current = session
  }, [session])

  const updateSession = useCallback(function(next) {
    setImportReviewSession(next)
  }, [])

  const startReview = useCallback(function(candidates, options) {
    const opts = options || {}
    if (opts.resumeIfActive && hasActiveImportReviewSession()) {
      showImportReviewUi()
      return
    }

    const listIn = Array.isArray(candidates) ? candidates : []
    const useBlankAdd = opts.entryMode === 'add' && listIn.length === 0
    const seedList = useBlankAdd
      ? [createBlankAddCandidate({
        book: opts.book || props.currentTuneBook,
        tags: opts.tags,
      })]
      : listIn

    const tunebook = props.tunebook
    const tunesHash = props.tunesHash
    const split = detectContentHashDuplicates(seedList, tunebook, tunesHash)
    dismissContentHashDuplicateToast()

    function openSession(list) {
      const nextSession = createImportReviewSession(list, {
        skipEnrichment: !resolverAvailable,
        entryMode: opts.entryMode === 'add' ? 'add' : 'import',
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
          navigate('/review')
        },
      })
    }

    if (split.nonDuplicates.length > 0 || useBlankAdd) {
      openSession(useBlankAdd ? seedList : split.nonDuplicates)
    }
  }, [props.tunebook, props.tunesHash, props.currentTuneBook, resolverAvailable, navigate])

  useEffect(function() {
    registerImportReviewStarter(startReview)
    return function() {
      registerImportReviewStarter(null)
    }
  }, [startReview])

  // Promote awaiting field-lookup searches into import-review queue items.
  useEffect(function() {
    function promote() {
      const result = promoteAwaitingFieldLookups({
        getTune: function(tuneId) {
          return props.tunes && props.tunes[tuneId] ? props.tunes[tuneId] : null
        },
        abcTools: props.tunebook && props.tunebook.abcTools,
      })
      if (!result.candidates.length) return

      const current = getImportReviewSession()
      if (current && isReviewSessionActive(current)) {
        updateSession(appendImportReviewCandidates(current, result.candidates))
        showImportReviewUi()
        return
      }

      const nextSession = createImportReviewSession(result.candidates, {
        skipEnrichment: true,
        entryMode: 'import',
      })
      setImportReviewSession(nextSession)
      showImportReviewUi()
    }

    promote()
    return subscribeFieldLookupQueue(promote)
  }, [props.tunes, props.tunebook, updateSession])

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
      const independent = (candidates || []).map(function(candidate) {
        return asIndependentReviewCandidate(candidate, draft)
      })
      updateSession(appendImportReviewCandidates(getImportReviewSession(), independent))
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
      setPendingAudioDraft(draft || null)
      setPendingAudioFiles(files)
      setShowAudioDriveUploadModal(true)
      return
    }

    if (result.action === 'review') {
      const outcome = processReviewResult(result, { stayOnForm: true }, applyImportedTune, appendCandidates, toast)
      if (outcome.handled) return
    }
  }, [resolverAvailable, props.token, props.tunebook, props.currentTuneBook, abcjsParser, driveApi, updateSession, props.forceRefresh])

  const continuePendingAudioImport = useCallback(async function(uploadToDriveFlags) {
    const files = pendingAudioFiles.slice()
    const draft = pendingAudioDraft
    setShowAudioDriveUploadModal(false)
    setPendingAudioFiles([])
    setPendingAudioDraft(null)
    if (!files.length) return
    const candidates = []
    for (let i = 0; i < files.length; i += 1) {
      candidates.push(await audioFileToReviewCandidate(
        files[i],
        draft,
        props.token,
        driveApi,
        !!(uploadToDriveFlags && uploadToDriveFlags[i])
      ))
    }
    const independent = candidates.map(function(candidate) {
      return asIndependentReviewCandidate(candidate, draft)
    })
    updateSession(appendImportReviewCandidates(getImportReviewSession(), independent))
  }, [pendingAudioFiles, pendingAudioDraft, props.token, driveApi, updateSession])

  const cancelPendingAudioImport = useCallback(function() {
    setShowAudioDriveUploadModal(false)
    setPendingAudioFiles([])
    setPendingAudioDraft(null)
  }, [])

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
    const candidate = asIndependentReviewCandidate({
      tune: {
        name: (draft && draft.tune && draft.tune.name) || link.title || '',
        composer: (draft && draft.tune && draft.tune.composer) || '',
        links: [{ title: link.title || '', link: link.link, startAt: '', endAt: '' }],
      },
      sourceKind: 'youtube',
      mergeTargetId: null,
    }, draft)
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
      const existing = props.tunes[candidate.mergeTargetId]
      const merged = Object.assign({}, existing, candidate.tune)
      merged.id = candidate.mergeTargetId
      merged.links = mergeImportedLinks(existing.links, candidate.tune && candidate.tune.links)
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

    if (candidate.fieldLookupJobId) {
      dismissFieldLookup(candidate.fieldLookupJobId)
    }

    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof done === 'function') done()
  }, [props])

  const finishAllCandidates = useCallback(function(updatedSession, done) {
    const tunebook = props.tunebook
    const book = props.currentTuneBook
    const tunesSnapshot = Object.assign({}, props.tunes || {})
    const candidates = updatedSession && Array.isArray(updatedSession.candidates)
      ? updatedSession.candidates
      : []

    candidates.forEach(function(candidate) {
      if (!candidate || candidate.imported) return
      if (updatedSession.importedCandidateIds && updatedSession.importedCandidateIds[candidate.id]) return

      if (candidate.mergeTargetId && tunesSnapshot[candidate.mergeTargetId]) {
        const existing = tunesSnapshot[candidate.mergeTargetId]
        const merged = Object.assign({}, existing, candidate.tune)
        merged.id = candidate.mergeTargetId
        merged.links = mergeImportedLinks(existing.links, candidate.tune && candidate.tune.links)
        merged.lastUpdated = Date.now()
        tunebook.saveTune(merged)
        tunesSnapshot[candidate.mergeTargetId] = merged
      } else {
        const tune = Object.assign({}, candidate.tune)
        if (book) {
          const books = Array.isArray(tune.books) ? tune.books.slice() : []
          if (books.indexOf(book) === -1) books.push(book)
          tune.books = books
        }
        tunebook.saveTune(tune)
        if (tune.id) tunesSnapshot[tune.id] = tune
      }

      if (candidate.fieldLookupJobId) {
        dismissFieldLookup(candidate.fieldLookupJobId)
      }
    })

    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof done === 'function') done()
  }, [props])

  const handleComplete = useCallback(function(finalSession) {
    clearImportReviewEnrichmentBridge()
    clearImportReviewSession()
    dismissContentHashDuplicateToast()
    dismissBackgroundReviewToast()
    if (onReviewRoute || location.pathname.indexOf('/add') === 0) {
      navigate('/tunes')
    }
    if (typeof props.onComplete === 'function') props.onComplete(finalSession)
  }, [props, onReviewRoute, navigate, location.pathname])

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
      const composerCandidates = Array.isArray(result.composerCandidates)
        ? result.composerCandidates
        : []
      if (composerCandidates.length > 1 && pending.candidateId) {
        const candidate = (current.candidates || []).find(function(item) {
          return item && item.id === pending.candidateId
        })
        const tune = (result.enrichedTune || (candidate && candidate.tune)) || {}
        seedAwaitingLookup({
          candidateId: pending.candidateId,
          tuneId: candidate && candidate.mergeTargetId ? candidate.mergeTargetId : null,
          kind: 'composer',
          title: tune.name || '',
          artist: tune.composer || '',
          candidates: buildComposerPickerCandidates({
            multiple: true,
            candidates: composerCandidates,
          }, tune.composer || ''),
        })
      }
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
    <>
      <ImportReviewModal
        show={showModal}
        embedded={!!props.embedded}
        reviewPageMode={onReviewRoute}
        onContinueLater={handleContinueLater}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        session={session}
        onClose={function() {
          clearImportReviewEnrichmentBridge()
          clearImportReviewSession()
          dismissContentHashDuplicateToast()
          dismissBackgroundReviewToast()
          if (onReviewRoute || location.pathname.indexOf('/add') === 0) {
            navigate('/tunes')
          }
        }}
        onHide={function() {
          hideImportReviewUi()
        }}
        onSessionChange={updateSession}
        onMatchComplete={handleMatchComplete}
        onFinishCandidate={handleFinishCandidate}
        onImportAll={finishAllCandidates}
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
        currentTuneBook={props.currentTuneBook}
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
      <AudioDriveUploadModal
        show={showAudioDriveUploadModal}
        files={pendingAudioFiles}
        loggedIn={!!(props.token && props.token.access_token)}
        onConfirm={continuePendingAudioImport}
        onCancel={cancelPendingAudioImport}
      />
    </>
  )
}
