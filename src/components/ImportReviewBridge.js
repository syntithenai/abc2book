import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ImportReviewModal from './ImportReviewModal'
import AudioDriveUploadModal from './AudioDriveUploadModal'
import {
  appendImportReviewCandidates,
  createImportReviewSession,
  beginMergeForJob,
  currentCandidate,
  deferCandidateForEnhancement,
  ensureBlankAddSession,
  isAddTunesChrome,
  isReviewSessionActive,
  removeAddDraftFromSession,
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
import {
  dismissBackgroundReviewToast,
  showBackgroundJobsContinuingNotice,
  snoozeBackgroundReviewToast,
} from '../backgroundReviewToast'
import { getBackgroundReviewSummary } from '../backgroundReviewQueue'
import {
  seedAwaitingLookup,
  dismissFieldLookup,
  subscribe as subscribeFieldLookupQueue,
  setFieldLookupResolvedHandler,
} from '../tuneFieldLookupQueue'
import { applyResolvedFieldLookupToImportSession } from '../fieldLookupReviewPromotion'
import { buildComposerPickerCandidates } from '../composerDiscoveryUtils'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import { toast } from 'react-toastify'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { processReviewResult } from '../addSongModalHelper'
import { createAttachedAudioLink } from '../linkRecording'
import { readAudioFileMetadata } from '../audioFileMetadata'
import { mergeImportedLinks, applyInlineImportToForm, tuneToFormValues, formValuesToTune } from '../importReviewFieldUtils'
import { attachPendingFileFromCandidate } from '../attachPendingTuneFile'
import { primaryArtist } from '../tuneBibliographicUtils'
import {
  asIndependentReviewCandidate,
  fieldLookupJobIdsForCandidate,
} from '../importReviewCandidateUtils'

function freshTuneId() {
  return 'tune-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

async function audioFileToReviewCandidate(file, draft, token, driveApi, uploadToDrive) {
  const metadata = await readAudioFileMetadata(file)
  const title = metadata.title || (draft && draft.tune && draft.tune.name) || file.name
  const artist = metadata.artist || (draft && draft.tune ? primaryArtist(draft.tune) : '') || ''
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

  // /review is the search-suggestions list page; Import Review stays an overlay elsewhere.
  const showImportOverlay = !onReviewRoute

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

    if (useBlankAdd) {
      // Transient Add form: drop any prior Add draft, keep parked review items.
      const parked = removeAddDraftFromSession(getImportReviewSession())
      const nextSession = ensureBlankAddSession(parked, {
        book: opts.book || props.currentTuneBook,
        tags: opts.tags,
        skipEnrichment: !resolverAvailable,
      })
      setImportReviewSession(nextSession)
      showImportReviewUi()
      navigate('/add')
      return
    }

    const seedList = listIn

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
        },
      })
    }

    if (split.nonDuplicates.length > 0) {
      openSession(split.nonDuplicates)
    }
  }, [props.tunebook, props.tunesHash, props.currentTuneBook, resolverAvailable, navigate])

  useEffect(function() {
    registerImportReviewStarter(startReview)
    return function() {
      registerImportReviewStarter(null)
    }
  }, [startReview])

  // Field searches no longer promote into Import Review — suggestions stay on
  // the field-lookup queue / edit form strip / Review suggestions page.
  useEffect(function() {
    return undefined
  }, [])

  // Keep linked import-draft field lookups applying into the open import session
  // only; do not reopen Import Review from form resolves.
  useEffect(function() {
    setFieldLookupResolvedHandler(function(job) {
      const current = getImportReviewSession()
      if (!current || !job || !job.appliedCandidate) return
      if (!job.reviewCandidateId) return
      const abcTools = props.tunebook && props.tunebook.abcTools
      const next = applyResolvedFieldLookupToImportSession(current, job, abcTools)
      if (next && next !== current) updateSession(next)
    })
    return function() {
      setFieldLookupResolvedHandler(null)
    }
  }, [updateSession, props.tunebook])

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
      const draftTune = (draft && draft.tune) || candidate.tune || {}
      const built = applyInlineImportToForm(tuneToFormValues(draftTune), importedTune || {})
      const mergedTune = formValuesToTune(built.formValues, Object.assign({}, draftTune, importedTune || {}))
      updateSession(updateCurrentCandidate(sessionNow, {
        tune: mergedTune,
        mergeTargetId: (draft && draft.mergeTargetId) || candidate.mergeTargetId || null,
        sourceKind: candidate.sourceKind && candidate.sourceKind !== 'manual'
          ? candidate.sourceKind
          : 'abc',
        pendingInlineSuggestions: built.suggestions || {},
      }))
    }

    const normalizedInput = input && input.file ? input.file : input
    let result
    try {
      result = await dispatchAddImport(normalizedInput, importContext)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Import failed.')
      return
    }
    if (!result || result.action === 'error') {
      toast.error(result && result.message ? result.message : 'Import failed.')
      return
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
    // Add Enhance handoff removed; Enhance remains for import/bulk chrome only.
    const candidate = currentCandidate(persistedSession)
    if (!candidate) return
    const fromAdd = isAddTunesChrome(persistedSession)
      || (persistedSession && persistedSession.entryMode === 'add')
    if (fromAdd) return
    let jobs = (persistedSession.enrichmentJobs || []).slice()
    let job = findEnrichmentJob(jobs, candidate.id)
    if (!job) {
      jobs.push(createEnrichmentJob(candidate))
      job = findEnrichmentJob(jobs, candidate.id)
    }
    jobs = startEnrichmentJob(jobs, job.id)
    let next = deferCandidateForEnhancement(persistedSession, jobs)
    next = Object.assign({}, next, {
      phase: 'enrichment',
      entryMode: 'import',
      step: next.step === 'done' ? 'review' : next.step,
    })
    updateSession(next)
    if (next.step === 'done') {
      hideImportReviewUi()
      navigate('/tunes')
    }
  }, [updateSession, navigate])

  const handleReviewYouTubeImport = useCallback(function(link, draft) {
    if (!link || !link.link) return
    const sessionNow = getImportReviewSession()
    if (!sessionNow) return
    const candidate = currentCandidate(sessionNow)
    const draftTune = (draft && draft.tune)
      || (candidate && candidate.tune)
      || {}
    const youtubeLink = {
      title: link.title || '',
      link: link.link,
      startAt: '',
      endAt: '',
    }
    if (link.image) youtubeLink.image = link.image

    // Add draft / single open candidate: apply onto the current form instead of
    // appending a second queued item the user never navigates to.
    if (isAddTunesChrome(sessionNow) || (candidate && !candidate.mergeTargetId
      && (!Array.isArray(sessionNow.candidates) || sessionNow.candidates.length <= 1))) {
      if (!candidate) return
      const existingLinks = Array.isArray(draftTune.links) ? draftTune.links.slice() : []
      const nextLinks = [youtubeLink].concat(existingLinks.filter(function(item) {
        return !(item && item.link && String(item.link) === String(youtubeLink.link))
      }))
      const nextName = String(draftTune.name || '').trim() || String(link.title || '').trim()
      updateSession(updateCurrentCandidate(sessionNow, {
        tune: Object.assign({}, draftTune, {
          name: nextName,
          links: nextLinks,
        }),
      }))
      return
    }

    const independent = asIndependentReviewCandidate({
      tune: {
        name: draftTune.name || link.title || '',
        composer: draftTune.composer || '',
        links: [youtubeLink],
      },
      sourceKind: 'youtube',
      mergeTargetId: null,
    }, draft)
    updateSession(appendImportReviewCandidates(sessionNow, [independent]))
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
      let merged = Object.assign({}, existing, candidate.tune)
      merged.id = candidate.mergeTargetId
      merged.links = mergeImportedLinks(existing.links, candidate.tune && candidate.tune.links)
      merged.lastUpdated = Date.now()
      attachPendingFileFromCandidate(merged, candidate.pendingFile, {
        token: props.token,
        driveApi: driveApi,
      }).then(function(withFile) {
        tunebook.saveTune(withFile)
        if (typeof props.forceRefresh === 'function') props.forceRefresh()
        if (typeof done === 'function') done(withFile)
      })
      fieldLookupJobIdsForCandidate(candidate).forEach(function(jobId) {
        dismissFieldLookup(jobId)
      })
      return
    } else {
      let tune = Object.assign({}, candidate.tune)
      if (book) {
        const books = Array.isArray(tune.books) ? tune.books.slice() : []
        if (books.indexOf(book) === -1) books.push(book)
        tune.books = books
      }
      // saveTune assigns id when missing
      tunebook.saveTune(tune)
      const savedId = tune.id
      const saved = props.tunes && savedId ? (props.tunes[savedId] || tune) : tune
      attachPendingFileFromCandidate(saved, candidate.pendingFile, {
        token: props.token,
        driveApi: driveApi,
      }).then(function(withFile) {
        if (withFile && withFile !== saved) tunebook.saveTune(withFile)
        if (typeof props.forceRefresh === 'function') props.forceRefresh()
        if (typeof done === 'function') done(withFile || saved || tune)
      })
      fieldLookupJobIdsForCandidate(candidate).forEach(function(jobId) {
        dismissFieldLookup(jobId)
      })
      return
    }
  }, [props, driveApi])

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
        let merged = Object.assign({}, existing, candidate.tune)
        merged.id = candidate.mergeTargetId
        merged.links = mergeImportedLinks(existing.links, candidate.tune && candidate.tune.links)
        merged.lastUpdated = Date.now()
        attachPendingFileFromCandidate(merged, candidate.pendingFile, {
          token: props.token,
          driveApi: driveApi,
        }).then(function(withFile) {
          tunebook.saveTune(withFile)
          tunesSnapshot[candidate.mergeTargetId] = withFile
        })
        tunesSnapshot[candidate.mergeTargetId] = merged
      } else {
        const tune = Object.assign({}, candidate.tune)
        if (book) {
          const books = Array.isArray(tune.books) ? tune.books.slice() : []
          if (books.indexOf(book) === -1) books.push(book)
          tune.books = books
        }
        tunebook.saveTune(tune)
        attachPendingFileFromCandidate(tune, candidate.pendingFile, {
          token: props.token,
          driveApi: driveApi,
        }).then(function(withFile) {
          if (withFile && withFile.id) {
            tunebook.saveTune(withFile)
            tunesSnapshot[withFile.id] = withFile
          }
        })
        if (tune.id) tunesSnapshot[tune.id] = tune
      }

      fieldLookupJobIdsForCandidate(candidate).forEach(function(jobId) {
        dismissFieldLookup(jobId)
      })
    })

    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof done === 'function') done()
  }, [props, driveApi])

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

  const autoAdvanceMerge = !!props.autoAdvanceMerge
  const showModal = !!(session && session.step !== 'done' && uiVisible && showImportOverlay)

  const handleContinueLater = useCallback(function() {
    const summary = getBackgroundReviewSummary()
    if (summary && summary.processing > 0) {
      showBackgroundJobsContinuingNotice({ summary: summary })
    }
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
          artist: primaryArtist(tune),
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
    const fromAdd = isAddTunesChrome(updatedSession)
      || (updatedSession && updatedSession.entryMode === 'add')
    finishCandidate(updatedSession, function(savedTune) {
      if (fromAdd) {
        clearImportReviewEnrichmentBridge()
        clearImportReviewSession()
        dismissContentHashDuplicateToast()
        dismissBackgroundReviewToast()
        if (savedTune && savedTune.id) {
          navigate('/tunes/' + encodeURIComponent(savedTune.id))
        } else {
          navigate('/tunes')
        }
        if (typeof done === 'function') done(savedTune)
        return
      }
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
      if (typeof done === 'function') done(savedTune)
    })
  }, [finishCandidate, autoAdvanceMerge, updateSession, navigate])

  const handleDiscardAddDraft = useCallback(function() {
    const current = getImportReviewSession()
    const next = removeAddDraftFromSession(current)
    dismissContentHashDuplicateToast()
    if (next) {
      updateSession(next)
      hideImportReviewUi()
    } else {
      clearImportReviewEnrichmentBridge()
      clearImportReviewSession()
    }
    if (location.pathname.indexOf('/add') === 0) {
      navigate('/tunes')
    }
  }, [updateSession, navigate, location.pathname])

  return (
    <>
      <ImportReviewModal
        show={showModal}
        embedded={!!props.embedded}
        reviewPageMode={false}
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
        onDiscardAddDraft={handleDiscardAddDraft}
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
