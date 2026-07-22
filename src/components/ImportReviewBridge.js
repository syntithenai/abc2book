import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ImportReviewModal from './ImportReviewModal'
import AudioDriveUploadModal from './AudioDriveUploadModal'
import {
  appendImportReviewCandidates,
  asImportReviewChrome,
  createImportReviewSession,
  beginMergeForJob,
  currentCandidate,
  deferCandidateForEnhancement,
  ensureBlankAddSession,
  isAddTunesChrome,
  isReviewSessionActive,
  removeAddDraftFromSession,
  sessionWithoutIdleAddDraft,
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
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { normalizeAccessToken } from '../mediaProxyClient'
import { tryRefreshAccessToken } from '../googleLoginRefreshRegistry'
import useGoogleDocument from '../useGoogleDocument'
import { toast } from 'react-toastify'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { processReviewResult } from '../addSongModalHelper'
import { buildMediaImportCandidatesFromFiles } from '../mediaImportCandidates'
import { isAudioImportFile, isVideoImportFile } from '../audioFileMetadata'
import { runPendingShareImportSideEffect } from '../shareImportSession'
import { applyAddFormInlineImport } from '../importReviewFieldUtils'
import { mergeTuneCollectionExtras } from '../tuneMergeExtras'
import { attachPendingFileFromCandidate } from '../attachPendingTuneFile'
import { attachMidiMediaLinkFromPendingFile } from '../attachMidiMediaLink'
import { primaryArtist } from '../tuneBibliographicUtils'
import {
  asIndependentReviewCandidate,
  fieldLookupJobIdsForCandidate,
  mergeImportDraftTune,
} from '../importReviewCandidateUtils'
import {
  runAddTuneAutoEnrich,
} from '../addTuneAutoEnrich'
import { inferNotationSongType } from '../textSearchIndexUtils'
import {
  getPendingAbcImportBatch,
  getPendingAbcImportBatchRevision,
  setPendingAbcImportBatch,
  clearPendingAbcImportBatch,
  subscribePendingAbcImportBatch,
} from '../abcImportBatchStore'
import {
  applyCertainFromAbcBatch,
  uncertainCandidatesForReview,
} from '../abcImportBatchActions'
import AbcImportBatchModal from './AbcImportBatchModal'
import AddAttachAnalyzeModal from './AddAttachAnalyzeModal'
import FileOcrReviewModal from './FileOcrReviewModal'
import { isSheetImageImportFile } from '../importSourceParse'
import {
  attachSheetImageToAddDraft,
  attachMediaFilesToAddDraft,
} from '../addFormAttach'
import {
  queueOcrFromAddDraft,
  queueMediaAnalysisFromAddDraft,
} from '../addAttachAnalyzeActions'
import {
  getFileOcrReviewUiState,
  hideFileOcrReview,
  subscribeFileOcrReviewUi,
} from '../fileOcrReviewUiStore'
import BulkSheetSnapshotImportModal from './BulkSheetSnapshotImportModal'
import {
  buildSheetSnapshotCandidatesFromFiles,
  isBulkSheetSnapshotFileList,
  resetBulkSheetSnapshotImportState,
  summarizeSheetSnapshotCandidates,
} from '../bulkSheetSnapshotImport'

function isMediaImportFile(file) {
  return !!(file && (isAudioImportFile(file) || isVideoImportFile(file)))
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
  const { available: resolverAvailable, features, status: resolverStatus } = useMediaResolverHealth()
  const driveApi = useGoogleDocument(props.token, props.logout || function() {}, props.forceRefresh)
  const runningJobRef = useRef(null)
  const sessionRef = useRef(null)
  const [pendingAudioFiles, setPendingAudioFiles] = useState([])
  const [pendingAudioDraft, setPendingAudioDraft] = useState(null)
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false)
  const [attachAnalyzePrompt, setAttachAnalyzePrompt] = useState(null)
  const [attachAnalyzeBusy, setAttachAnalyzeBusy] = useState(false)
  const [bulkSnapshotProgress, setBulkSnapshotProgress] = useState(null)
  const [abcBatchBusy, setAbcBatchBusy] = useState(false)
  const fileOcrReviewUi = useSyncExternalStore(
    subscribeFileOcrReviewUi,
    getFileOcrReviewUiState,
    getFileOcrReviewUiState
  )
  const analysisDeps = useMemo(function() {
    return {
      tunebook: props.tunebook,
      tunes: props.tunes || {},
      token: props.token,
      forceRefresh: props.forceRefresh,
      accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
      driveApi: driveApi,
      abcjsParser: abcjsParser,
    }
  }, [props.tunebook, props.tunes, props.token, props.forceRefresh, driveApi, abcjsParser])
  const pendingAbcBatch = useSyncExternalStore(
    subscribePendingAbcImportBatch,
    getPendingAbcImportBatch,
    getPendingAbcImportBatch
  )
  useSyncExternalStore(
    subscribePendingAbcImportBatch,
    getPendingAbcImportBatchRevision,
    getPendingAbcImportBatchRevision
  )

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
      // Transient Add form: keep an existing Add draft when present; otherwise park review items.
      const current = getImportReviewSession()
      const nextSession = ensureBlankAddSession(current, {
        book: opts.book || props.currentTuneBook,
        tags: opts.tags,
        skipEnrichment: !resolverAvailable,
        addPanelMode: opts.addPanelMode,
      })
      setImportReviewSession(nextSession)
      showImportReviewUi()
      navigate(opts.addPanelMode === 'bulk' ? '/add/bulk' : '/add')
      return
    }

    const seedList = listIn

    const tunebook = props.tunebook
    const tunesHash = props.tunesHash
    const split = detectContentHashDuplicates(seedList, tunebook, tunesHash, props.tunes)
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

  const handleBulkSheetSnapshotImport = useCallback(async function(files, draft) {
    const current = getImportReviewSession()
    if (!current) {
      toast.error('Open the Add form before importing files.')
      return
    }
    const list = Array.isArray(files) ? files.filter(Boolean) : []
    if (!list.length) return
    setAttachAnalyzeBusy(true)
    setBulkSnapshotProgress({
      current: 0,
      total: list.length,
      fileName: '',
      message: 'Preparing ' + list.length + ' sheet file' + (list.length === 1 ? '' : 's') + '…',
    })
    try {
      resetBulkSheetSnapshotImportState()
      let accessToken = normalizeAccessToken(props.token)
      if (!accessToken) {
        accessToken = getActiveResolverAccessToken() || ''
      }
      const refreshed = await tryRefreshAccessToken()
      if (refreshed) {
        accessToken = normalizeAccessToken(refreshed) || accessToken
      }
      const outcome = await buildSheetSnapshotCandidatesFromFiles(list, {
        resolverAvailable: resolverAvailable,
        sheetImageOcr: !!(features && (features.sheetImageOcr || features.sheetImage)),
        requireAuth: !!(resolverStatus && resolverStatus.requireAuth),
        accessToken: accessToken,
        books: props.currentTuneBook ? [props.currentTuneBook] : [],
        onProgress: setBulkSnapshotProgress,
      })
      const candidates = outcome && outcome.candidates ? outcome.candidates : []
      const metadataSupport = outcome && outcome.metadataSupport ? outcome.metadataSupport : null
      if (!candidates.length) {
        toast.error('No sheet image or PDF files were recognized.')
        return
      }
      const independent = candidates.map(function(candidate) {
        return asIndependentReviewCandidate(candidate, draft)
      })
      let next = appendImportReviewCandidates(sessionWithoutIdleAddDraft(getImportReviewSession()), independent)
      if (next && next.entryMode === 'add' && independent.length) {
        next = asImportReviewChrome(next)
      }
      updateSession(next)
      const summary = summarizeSheetSnapshotCandidates(candidates)
      let message = 'Prepared ' + summary.total + ' sheet snapshot'
        + (summary.total === 1 ? '' : 's') + ' for review'
      const fromSheet = summary.ocr + summary.cloudOcr + summary.pdfText
      if (fromSheet) {
        message += ' — ' + fromSheet + ' title' + (fromSheet === 1 ? '' : 's') + ' read from sheets'
        if (summary.filename) {
          message += ', ' + summary.filename + ' from filenames (please review)'
        }
      } else if (summary.filename) {
        message += ' — titles from filenames'
        if (metadataSupport && metadataSupport.reason) {
          message += ' (' + metadataSupport.reason + ')'
        } else {
          message += ' (sheet OCR did not return titles)'
        }
      }
      toast.info(message, { autoClose: 10000 })
    } catch (e) {
      toast.error((e && e.message) || 'Could not prepare sheet snapshots.')
    } finally {
      setAttachAnalyzeBusy(false)
      setBulkSnapshotProgress(null)
    }
  }, [resolverAvailable, resolverStatus, features, props.token, props.currentTuneBook, updateSession])

  const appendMediaImportCandidates = useCallback(async function(files, draft, options) {
    const list = Array.isArray(files) ? files.filter(Boolean) : []
    if (!list.length) return 0
    const candidates = await buildMediaImportCandidatesFromFiles(list, Object.assign({
      draft: draft,
      token: props.token,
      driveApi: driveApi,
    }, options || {}))
    const independent = candidates.map(function(candidate) {
      return asIndependentReviewCandidate(candidate, draft)
    })
    const baseSession = sessionWithoutIdleAddDraft(getImportReviewSession())
    let next = appendImportReviewCandidates(baseSession, independent)
    if (next && next.entryMode === 'add' && independent.length) {
      next = asImportReviewChrome(next)
    }
    updateSession(next)
    return independent.length
  }, [props.token, driveApi, updateSession])

  const handleReviewMediaFilesImport = useCallback(async function(files, draft, options) {
    const list = Array.isArray(files) ? files.filter(Boolean) : []
    if (!list.length) return
    const sessionNow = getImportReviewSession()
    if (!sessionNow) {
      toast.error('Open the Add form before importing a file.')
      return
    }
    const addChrome = isAddTunesChrome(sessionNow) || sessionNow.entryMode === 'add'
    const opts = options || {}

    if (addChrome && list.length === 1) {
      setAttachAnalyzePrompt({
        kind: 'media',
        files: list,
        mediaAction: opts.mediaAction || 'audio',
        draft: draft || null,
        fileName: list[0].name || 'media file',
        sourceUrl: opts.sourceUrl || null,
      })
      return
    }

    if (addChrome) {
      const count = await appendMediaImportCandidates(list, draft, {
        uploadToDrive: false,
        sourceUrl: opts.sourceUrl || null,
      })
      toast.success('Added ' + count + ' media file' + (count === 1 ? '' : 's') + ' to import review')
      return
    }

    setPendingAudioDraft(Object.assign({}, draft || null, {
      mediaAction: opts.mediaAction || 'audio',
      sourceUrl: opts.sourceUrl || null,
    }))
    setPendingAudioFiles(list)
    setShowAudioDriveUploadModal(true)
  }, [appendMediaImportCandidates])

  const handleReviewSourceImport = useCallback(async function(input, draft) {
    const current = getImportReviewSession()
    if (!current) {
      toast.error('Open the Add form before importing a file.')
      return
    }
    const addChrome = isAddTunesChrome(current) || current.entryMode === 'add'

    const importContext = buildImportContext({
      resolverAvailable: resolverAvailable,
      token: props.token,
      driveApi: driveApi,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      book: props.currentTuneBook,
      tunes: props.tunes || {},
      midiMode: (input && input.midiMode) || null,
      midiStrategy: (input && input.midiStrategy) || 'auto',
      includeChords: input && input.includeChords !== undefined ? input.includeChords : null,
    })

    const appendCandidates = function(candidates) {
      const independent = (candidates || []).map(function(candidate) {
        return asIndependentReviewCandidate(candidate, draft)
      })
      const baseSession = sessionWithoutIdleAddDraft(getImportReviewSession())
      let next = appendImportReviewCandidates(baseSession, independent)
      if (next && next.entryMode === 'add' && independent.length) {
        next = asImportReviewChrome(next)
      }
      updateSession(next)
    }

    const applyImportedTune = function(importedTune, importedCandidate) {
      const sessionNow = getImportReviewSession()
      if (!sessionNow) return false
      const candidateIndex = sessionNow.mergeIndex != null ? sessionNow.mergeIndex : sessionNow.index
      const candidate = sessionNow.candidates[candidateIndex]
      if (!candidate) return false
      const draftTune = (draft && draft.tune) || candidate.tune || {}
      // Prefer import as the base; keep only non-empty draft fields (book/tags/links).
      const mergedTune = mergeImportDraftTune(importedTune, draftTune)
      const built = applyAddFormInlineImport(draftTune, importedTune || {})
      const sourceKind = (importedCandidate && importedCandidate.sourceKind)
        || (candidate.sourceKind && candidate.sourceKind !== 'manual' ? candidate.sourceKind : null)
        || 'abc'
      updateSession(updateCurrentCandidate(sessionNow, {
        tune: mergedTune,
        mergeTargetId: (draft && draft.mergeTargetId) || candidate.mergeTargetId || null,
        sourceKind: sourceKind,
        pendingInlineSuggestions: built.suggestions || {},
        inlineFormValues: built.formValues || null,
        importWarnings: (importedCandidate && importedCandidate.importWarnings) || candidate.importWarnings || null,
        midiImport: (importedCandidate && importedCandidate.midiImport) || candidate.midiImport || null,
        pendingFile: (importedCandidate && importedCandidate.pendingFile) || candidate.pendingFile || null,
        inlineImportRevision: (Number(candidate.inlineImportRevision) || 0) + 1,
      }))
      return true
    }

    const normalizedInput = input && input.file ? input.file : input

    // Add chrome: sheet images/PDFs → Skip/OCR dialog (default Skip = attach only).
    if (addChrome && typeof File !== 'undefined' && normalizedInput instanceof File
      && isSheetImageImportFile(normalizedInput)) {
      setAttachAnalyzePrompt({
        kind: 'sheetImage',
        file: normalizedInput,
        draft: draft || null,
        fileName: normalizedInput.name || 'file',
      })
      return
    }

    let result
    try {
      const dispatchInput = (input && input.file)
        ? Object.assign({ file: input.file }, input)
        : normalizedInput
      result = await dispatchAddImport(dispatchInput, importContext)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Import failed.')
      return
    }
    if (!result || result.action === 'error') {
      toast.error(result && result.message ? result.message : 'Import failed.')
      return
    }

    if (result.action === 'audio' || result.action === 'video') {
      const files = result.files || []
      if (files.length === 0) return
      await handleReviewMediaFilesImport(files, draft, {
        mediaAction: result.action,
        sourceUrl: result.sourceUrl || null,
      })
      return
    }

    if (result.action === 'batch' && result.batchSummary) {
      setPendingAbcImportBatch(result.batchSummary)
      return
    }

    if (result.action === 'review') {
      if (input && input.forceApplyToCurrent && result.candidates && result.candidates.length === 1) {
        applyImportedTune(result.candidates[0].tune, result.candidates[0])
        return
      }
      // Sheet-image transcription review: on Add, still offer attach dialog if somehow reached.
      if (addChrome && result.candidates && result.candidates.length === 1
        && result.candidates[0] && result.candidates[0].sourceKind === 'sheetimage'
        && result.candidates[0].pendingFile) {
        const pending = result.candidates[0].pendingFile
        const file = pending.blob || pending
        if (file) {
          setAttachAnalyzePrompt({
            kind: 'sheetImage',
            file: file,
            draft: draft || null,
            fileName: (file && file.name) || 'file',
          })
          return
        }
      }
      const outcome = processReviewResult(
        result,
        { stayOnForm: true, entryPoint: 'add' },
        applyImportedTune,
        appendCandidates,
        toast
      )
      if (outcome.handled) return
    }
  }, [resolverAvailable, props.token, props.tunebook, props.currentTuneBook, props.tunes, abcjsParser, driveApi, updateSession, props.forceRefresh, handleReviewMediaFilesImport])

  const handleMidiReimport = useCallback(async function(mode, includeChords) {
    const sessionNow = getImportReviewSession()
    const candidate = currentCandidate(sessionNow)
    if (!candidate || !candidate.pendingFile || !candidate.pendingFile.blob) {
      toast.error('Original MIDI file is not available for re-import.')
      return
    }
    const file = candidate.pendingFile.blob instanceof File
      ? candidate.pendingFile.blob
      : new File(
        [candidate.pendingFile.blob],
        candidate.pendingFile.name || 'import.mid',
        { type: candidate.pendingFile.type || 'audio/midi' }
      )
    await handleReviewSourceImport({
      file: file,
      midiMode: mode,
      midiStrategy: 'auto',
      includeChords: includeChords,
      forceApplyToCurrent: true,
    }, {
      tune: candidate.tune,
      mergeTargetId: candidate.mergeTargetId,
    })
    const chordLabel = includeChords === false ? ' without chords' : (includeChords ? ' with chords' : '')
    toast.info(mode === 'multi_voice' ? 'Re-imported with all voices' + chordLabel : 'Re-imported melody only' + chordLabel)
  }, [handleReviewSourceImport])

  const resolveAttachBaseTune = useCallback(function(draft) {
    const sessionNow = getImportReviewSession()
    const candidate = currentCandidate(sessionNow)
    return (draft && draft.tune)
      || (candidate && candidate.tune)
      || {}
  }, [])

  const applyOntoAddDraft = useCallback(function(nextTune, extra) {
    const sessionNow = getImportReviewSession()
    if (!sessionNow) return
    const candidate = currentCandidate(sessionNow)
    if (!candidate) return
    updateSession(updateCurrentCandidate(sessionNow, Object.assign({
      tune: nextTune,
      mergeTargetId: null,
      skipEnrich: true,
      sourceKind: candidate.sourceKind || 'manual',
    }, extra || {})))
  }, [updateSession])

  const handleAttachAnalyzeSkip = useCallback(async function() {
    const prompt = attachAnalyzePrompt
    if (!prompt) return
    setAttachAnalyzeBusy(true)
    try {
      const baseTune = resolveAttachBaseTune(prompt.draft)
      if (prompt.kind === 'media') {
        const nextTune = await attachMediaFilesToAddDraft(baseTune, prompt.files, prompt.mediaAction)
        applyOntoAddDraft(nextTune, {
          sourceKind: prompt.mediaAction,
          skipEnrich: true,
        })
        toast.success(prompt.mediaAction === 'video'
          ? 'Added video to links'
          : 'Added audio to links')
      } else {
        const nextTune = await attachSheetImageToAddDraft(baseTune, prompt.file, {
          resolverAvailable: resolverAvailable,
          accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
        })
        applyOntoAddDraft(nextTune, { sourceKind: 'sheetimage', skipEnrich: true })
        toast.success('Added file to this tune')
      }
      setAttachAnalyzePrompt(null)
    } catch (e) {
      toast.error((e && e.message) || 'Could not attach')
    } finally {
      setAttachAnalyzeBusy(false)
    }
  }, [attachAnalyzePrompt, resolveAttachBaseTune, applyOntoAddDraft, resolverAvailable, props.token])

  const handleAttachAnalyzeOcr = useCallback(async function() {
    const prompt = attachAnalyzePrompt
    if (!prompt || prompt.kind === 'media') return
    setAttachAnalyzeBusy(true)
    try {
      const baseTune = resolveAttachBaseTune(prompt.draft)
      const nextTune = await attachSheetImageToAddDraft(baseTune, prompt.file, {
        resolverAvailable: resolverAvailable,
        accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
      })
      applyOntoAddDraft(nextTune, { sourceKind: 'sheetimage', skipEnrich: true })
      await queueOcrFromAddDraft({
        tune: nextTune,
        tunebook: props.tunebook,
        token: props.token,
        driveApi: driveApi,
        updateSession: updateSession,
        navigate: navigate,
      })
      setAttachAnalyzePrompt(null)
    } catch (e) {
      toast.error((e && e.message) || 'Could not start OCR')
    } finally {
      setAttachAnalyzeBusy(false)
    }
  }, [attachAnalyzePrompt, resolveAttachBaseTune, applyOntoAddDraft, props.tunebook, props.token, driveApi, updateSession, navigate, resolverAvailable])

  const handleAttachAnalyzeMedia = useCallback(async function() {
    const prompt = attachAnalyzePrompt
    if (!prompt || prompt.kind !== 'media') return
    setAttachAnalyzeBusy(true)
    try {
      const baseTune = resolveAttachBaseTune(prompt.draft)
      const nextTune = await attachMediaFilesToAddDraft(baseTune, prompt.files, prompt.mediaAction)
      applyOntoAddDraft(nextTune, {
        sourceKind: prompt.mediaAction,
        skipEnrich: true,
      })
      const deps = Object.assign({}, analysisDeps, {
        tunes: Object.assign({}, analysisDeps.tunes || {}, { [nextTune.id]: nextTune }),
      })
      await queueMediaAnalysisFromAddDraft({
        tune: nextTune,
        tunebook: props.tunebook,
        analysisDeps: deps,
        updateSession: updateSession,
        navigate: navigate,
      })
      setAttachAnalyzePrompt(null)
    } catch (e) {
      toast.error((e && e.message) || 'Could not start analysis')
    } finally {
      setAttachAnalyzeBusy(false)
    }
  }, [attachAnalyzePrompt, resolveAttachBaseTune, applyOntoAddDraft, analysisDeps, props.tunebook, updateSession, navigate])

  const openAbcBatchInReview = useCallback(function(includeDuplicates) {
    const batch = getPendingAbcImportBatch()
    if (!batch) return
    const candidates = uncertainCandidatesForReview(batch, { includeDuplicates: !!includeDuplicates })
    clearPendingAbcImportBatch()
    if (!candidates.length) {
      toast.info('Nothing left to review.')
      return
    }
    startReview(candidates, { entryMode: 'import' })
  }, [startReview])

  const applyCertainAbcBatch = useCallback(function() {
    const batch = getPendingAbcImportBatch()
    if (!batch || !props.tunebook) return
    setAbcBatchBusy(true)
    applyCertainFromAbcBatch(props.tunebook, batch).then(function(outcome) {
      const applied = outcome && outcome.applied ? outcome.applied : {}
      const remaining = (outcome && outcome.remaining) || []
      const parts = []
      if (applied.updates) parts.push(applied.updates + ' updated')
      if (applied.inserts) parts.push(applied.inserts + ' inserted')
      if (applied.deletes) parts.push(applied.deletes + ' deleted')
      if (parts.length) {
        toast.success('Applied: ' + parts.join(', '))
      } else {
        toast.info('Nothing certain to apply.')
      }
      clearPendingAbcImportBatch()
      if (remaining.length) {
        startReview(remaining, { entryMode: 'import' })
      } else if (typeof props.forceRefresh === 'function') {
        props.forceRefresh()
      }
    }).catch(function(e) {
      toast.error((e && e.message) || 'Could not apply import.')
    }).finally(function() {
      setAbcBatchBusy(false)
    })
  }, [props.tunebook, props.forceRefresh, startReview])

  const cancelAbcBatch = useCallback(function() {
    clearPendingAbcImportBatch()
  }, [])
  const continuePendingAudioImport = useCallback(async function(uploadToDriveFlags) {
    const files = pendingAudioFiles.slice()
    const draft = pendingAudioDraft
    setShowAudioDriveUploadModal(false)
    setPendingAudioFiles([])
    setPendingAudioDraft(null)
    if (!files.length) return
    const count = await appendMediaImportCandidates(files, draft, {
      uploadToDriveFlags: uploadToDriveFlags,
      sourceUrl: draft && draft.sourceUrl ? draft.sourceUrl : null,
    })
    if (count > 0) {
      toast.success('Added ' + count + ' media file' + (count === 1 ? '' : 's') + ' to import review')
    }
  }, [pendingAudioFiles, pendingAudioDraft, appendMediaImportCandidates])

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

  function attachCandidateSourceFiles(tune, candidate, attachOptions) {
    return attachPendingFileFromCandidate(tune, candidate.pendingFile, attachOptions)
      .then(function(withFile) {
        return attachMidiMediaLinkFromPendingFile(withFile, candidate.pendingFile, attachOptions)
      })
  }

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
      mergeTuneCollectionExtras(merged, existing, candidate.tune)
      merged.lastUpdated = Date.now()
      attachCandidateSourceFiles(merged, candidate, {
        token: props.token,
        driveApi: driveApi,
        uploadToDrive: !!(props.token && driveApi && !candidate.addDraft),
        resolverAvailable: resolverAvailable,
        accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
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
      attachCandidateSourceFiles(saved, candidate, {
        token: props.token,
        driveApi: driveApi,
        uploadToDrive: !!(props.token && driveApi && !candidate.addDraft),
        resolverAvailable: resolverAvailable,
        accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
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
        mergeTuneCollectionExtras(merged, existing, candidate.tune)
        merged.lastUpdated = Date.now()
        attachCandidateSourceFiles(merged, candidate, {
          token: props.token,
          driveApi: driveApi,
          uploadToDrive: !!(props.token && driveApi && !candidate.addDraft),
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
        attachCandidateSourceFiles(tune, candidate, {
          token: props.token,
          driveApi: driveApi,
          uploadToDrive: !!(props.token && driveApi && !candidate.addDraft),
          resolverAvailable: resolverAvailable,
          accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
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
    runPendingShareImportSideEffect()
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

  // Curated collection links (from the Add chrome's Curated Collections panel or
  // elsewhere) navigate to /importlink or /importdoc. Drop the transient Add
  // draft so the fullscreen Add dialog doesn't stay on top of the import page.
  useEffect(function() {
    const onImportRoute = location.pathname.indexOf('/importlink') === 0
      || location.pathname.indexOf('/importdoc') === 0
    if (!onImportRoute) return
    const current = getImportReviewSession()
    if (!current || !isAddTunesChrome(current)) return
    const next = removeAddDraftFromSession(current)
    if (next) {
      updateSession(next)
      hideImportReviewUi()
    } else {
      clearImportReviewEnrichmentBridge()
      clearImportReviewSession()
    }
  }, [location.pathname, updateSession])

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
          runAddTuneAutoEnrich({
            tune: savedTune,
            tunebook: props.tunebook,
            abcjsParser: abcjsParser,
            accessToken: props.token && props.token.access_token ? props.token.access_token : '',
            resolverAvailable: resolverAvailable,
            searchIndex: props.searchIndex,
            loadTuneTexts: props.loadTuneTexts,
            forceRefresh: props.forceRefresh,
            songType: inferNotationSongType(savedTune.rhythm || '', savedTune.composer || ''),
          })
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
  }, [finishCandidate, autoAdvanceMerge, updateSession, navigate, props.tunebook, props.token, props.searchIndex, props.loadTuneTexts, props.forceRefresh, abcjsParser, resolverAvailable])

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
        logout={props.logout}
        requestGoogleScopes={props.requestGoogleScopes}
        forceRefresh={props.forceRefresh}
        searchIndex={props.searchIndex}
        loadTuneTexts={props.loadTuneTexts}
        resolverAvailable={resolverAvailable}
        currentTuneBook={props.currentTuneBook}
        setCurrentTuneBook={props.setCurrentTuneBook}
        onImportFile={handleReviewSourceImport}
        onImportFiles={function(files, draft) {
          const list = Array.isArray(files) ? files.filter(Boolean) : []
          if (list.length && isBulkSheetSnapshotFileList(list)) {
            return handleBulkSheetSnapshotImport(list, draft)
          }
          const mediaFiles = list.filter(isMediaImportFile)
          const otherFiles = list.filter(function(file) { return !isMediaImportFile(file) })
          const tasks = []
          if (mediaFiles.length) {
            tasks.push(handleReviewMediaFilesImport(mediaFiles, draft))
          }
          otherFiles.forEach(function(file) {
            tasks.push(handleReviewSourceImport(file, draft))
          })
          return Promise.all(tasks)
        }}
        onImportText={handleReviewSourceImport}
        onImportSource={handleReviewSourceImport}
        onImportYouTube={handleReviewYouTubeImport}
        onMidiReimport={handleMidiReimport}
      />
      <AudioDriveUploadModal
        show={showAudioDriveUploadModal}
        files={pendingAudioFiles}
        loggedIn={!!(props.token && props.token.access_token)}
        onConfirm={continuePendingAudioImport}
        onCancel={cancelPendingAudioImport}
      />
      <AbcImportBatchModal
        summary={pendingAbcBatch}
        busy={abcBatchBusy}
        onReviewAll={function() { openAbcBatchInReview(false) }}
        onIncludeDuplicates={function() { openAbcBatchInReview(true) }}
        onApplyCertain={applyCertainAbcBatch}
        onCancel={cancelAbcBatch}
      />
      <AddAttachAnalyzeModal
        show={!!attachAnalyzePrompt}
        kind={attachAnalyzePrompt && attachAnalyzePrompt.kind}
        fileName={attachAnalyzePrompt && attachAnalyzePrompt.fileName}
        busy={attachAnalyzeBusy}
        onSkip={handleAttachAnalyzeSkip}
        onOcr={handleAttachAnalyzeOcr}
        onAnalyze={handleAttachAnalyzeMedia}
        onCancel={function() {
          if (attachAnalyzeBusy) return
          setAttachAnalyzePrompt(null)
        }}
      />
      <FileOcrReviewModal
        show={!!fileOcrReviewUi.show}
        focusJobId={fileOcrReviewUi.focusJobId}
        onHide={hideFileOcrReview}
        tunes={props.tunes}
        tunebook={props.tunebook}
      />
      <BulkSheetSnapshotImportModal
        show={!!bulkSnapshotProgress}
        progress={bulkSnapshotProgress}
      />
    </>
  )
}
