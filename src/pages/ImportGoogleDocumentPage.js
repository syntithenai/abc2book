import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'
import ImportScopePicker from '../components/ImportScopePicker'
import { parseImportDocRouteParams, tuneIdsForSet, tuneIdsForPlaylist } from '../shareTunebookUtils'
import { buildNavigateAfterImport, handleImportNavigation } from '../shareImportNavigation'
import { parsePerformanceSetsFromAbc } from '../performanceSetSync'
import { parsePlaylistsFromAbc } from '../playlistSync'
import {
  mergePerformanceSetsFromTuneBookAbc,
  importSinglePerformanceSetFromAbc,
} from '../performanceSetSyncClient'
import {
  mergePlaylistsFromTuneBookAbc,
  importSinglePlaylistFromAbc,
} from '../playlistSyncClient'
import {
  mergePracticeListsFromTuneBookAbc,
} from '../practiceListSyncClient'
import { setPendingShareImportSideEffect, setPendingShareImportSourceRegistration, clearPendingShareImportSourceRegistration } from '../shareImportSession'
import { useDocumentTitle } from '../pageTitle'
import { classifyImportAbcResults, buildBatchSummaryFromClassifier } from '../importAbcClassifier'
import ImportBatchSummaryPanel from '../components/ImportBatchSummaryPanel'
import {
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore'
import {
  filterCertainImportRaw,
  reviewCandidatesFromBatch,
} from '../abcImportBatchActions'
import {
  registerSyncSourceAfterImport,
  stampSrcUrlOnImportResults,
} from '../syncSourceImportUtils'
import { buildGoogleDocUrl } from '../syncSourcesStore'
import { OFFLINE_MESSAGE } from '../offlineNetwork'
import {
  consumeFreshLoadAborted,
  isOffline,
  readFreshParamFromLocation,
} from '../appFreshLoadUtils'

export default function ImportGoogleDocumentPage({
  tunebook,
  token,
  refresh,
  setNavigateAfterImport,
  setCurrentTuneBook,
  setTagFilter,
  setFilter,
}) {
  useDocumentTitle('Import shared tunebook')
  const navigate = useNavigate()
  const params = useParams()
  const docs = useGoogleDocument(token, function() {}, refresh)
  const docsRef = useRef(docs)
  docsRef.current = docs
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [abcText, setAbcText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [batchSummary, setBatchSummary] = useState(null)
  const [pendingScope, setPendingScope] = useState(null)
  const accessToken = token && token.access_token ? token.access_token : ''

  const routeContext = useMemo(function() {
    return parseImportDocRouteParams(params)
  }, [params])

  useEffect(function() {
    if (consumeFreshLoadAborted()) {
      navigate('/tunes', { replace: true })
      return
    }
    if (readFreshParamFromLocation() && isOffline()) {
      navigate('/tunes', { replace: true })
    }
  }, [navigate])

  const preview = useMemo(function() {
    if (!abcText) return { tunes: {}, sets: {}, playlists: {} }
    const tunesList = tunebook.abcTools.abc2Tunebook(abcText)
    const tunes = {}
    tunesList.forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    const parsedSets = parsePerformanceSetsFromAbc(abcText)
    const parsedPlaylists = parsePlaylistsFromAbc(abcText)
    return {
      tunes: tunes,
      sets: parsedSets.sets || {},
      playlists: parsedPlaylists.playlists || {},
    }
  }, [abcText, tunebook])

  useEffect(function() {
    if (!params.googleDocumentId) {
      navigate('/tunes')
      return
    }
    if (!accessToken) return
    if (isOffline()) {
      setLoading(false)
      setError(OFFLINE_MESSAGE)
      return
    }

    var cancelled = false
    setLoading(true)
    setError('')
    setAbcText('')
    docsRef.current.getDocument(params.googleDocumentId).then(function(fullSheet) {
      if (cancelled) return
      if (fullSheet && typeof fullSheet === 'string') {
        setAbcText(fullSheet)
      } else if (fullSheet && typeof fullSheet === 'object' && fullSheet.error) {
        setError('Unable to load import source. Check that the share link is still public and try again.')
      } else if (fullSheet) {
        setAbcText(String(fullSheet))
      } else {
        setError('Unable to load import source. Check that the share link is still public and try again.')
      }
    }).catch(function() {
      if (cancelled) return
      setError('Error loading import source')
    }).finally(function() {
      if (!cancelled) setLoading(false)
    })

    return function() {
      cancelled = true
    }
  }, [params.googleDocumentId, accessToken, navigate])

  const applyImportResults = useCallback(function(results, scopePayload, afterMerge, scopeOption) {
    const docUrl = buildGoogleDocUrl(params.googleDocumentId)
    const stamped = stampSrcUrlOnImportResults(results, docUrl)
    const chain = tunebook.applyMergeData(stamped).then(function() {
      if (afterMerge) return afterMerge()
    })
    return chain.then(function(mergedTunes) {
      registerSyncSourceAfterImport({
        googleDocumentId: params.googleDocumentId,
        scopeOption: scopeOption,
        results: stamped,
        label: 'Shared tunebook',
      })
      handleImportNavigation(scopePayload, {
        navigate: navigate,
        tunebook: tunebook,
        tunes: mergedTunes,
        setCurrentTuneBook: setCurrentTuneBook,
        setTagFilter: setTagFilter,
        setFilter: setFilter,
      })
      if (setNavigateAfterImport) setNavigateAfterImport({})
    })
  }, [tunebook, setNavigateAfterImport, navigate, setCurrentTuneBook, setTagFilter, setFilter, params.googleDocumentId])

  const rememberPendingSourceRegistration = useCallback(function(option, limitToTuneIds) {
    setPendingShareImportSourceRegistration({
      googleDocumentId: params.googleDocumentId,
      scopeOption: Object.assign({}, option, { limitToTuneIds: limitToTuneIds || null }),
      label: 'Shared tunebook',
    })
  }, [params.googleDocumentId])

  const runImportForOption = useCallback(function(option) {
    if (!abcText || !option) return
    setImportBusy(true)

    let limitToTuneId = null
    let limitToBookName = null
    let limitToTagName = null
    let limitToTuneIds = null
    const scopePayload = buildNavigateAfterImport(option.scope, {
      tuneId: option.tuneId,
      bookName: option.bookName,
      setId: option.setId,
      playlistId: option.playlistId,
      tagName: option.tagName,
    })

    if (option.scope === 'tune') {
      limitToTuneId = option.tuneId
    } else if (option.scope === 'book') {
      limitToBookName = option.bookName
    } else if (option.scope === 'tag') {
      limitToTagName = option.tagName
    } else if (option.scope === 'set') {
      const setRecord = preview.sets[option.setId]
      limitToTuneIds = tuneIdsForSet(setRecord)
      if (limitToTuneIds.length === 0) {
        setError('This set has no tunes to import.')
        setImportBusy(false)
        return
      }
    } else if (option.scope === 'playlist') {
      const playlistRecord = preview.playlists[option.playlistId]
      limitToTuneIds = tuneIdsForPlaylist(playlistRecord)
      if (limitToTuneIds.length === 0) {
        setError('This playlist has no tunes to import.')
        setImportBusy(false)
        return
      }
    }

    const results = tunebook.importAbc(abcText, null, limitToTuneId, limitToBookName, limitToTagName, limitToTuneIds)

    // Whole-book (and multi-tune scopes): use Import Review with preserved batch summary.
    if (option.scope === 'all' || option.scope === 'book' || option.scope === 'set' || option.scope === 'playlist' || option.scope === 'tag') {
      const classified = classifyImportAbcResults(results, { includeSkipped: false })
      const summary = buildBatchSummaryFromClassifier(classified)
      setPendingShareImportSideEffect({
        scope: option.scope,
        setId: option.setId || null,
        playlistId: option.playlistId || null,
        abcText: abcText,
      })
      rememberPendingSourceRegistration(option, limitToTuneIds)
      if (setNavigateAfterImport) setNavigateAfterImport(scopePayload)
      setBatchSummary(summary)
      setPendingScope(Object.assign({}, option, { limitToTuneIds: limitToTuneIds }))
      setImportBusy(false)
      return
    }

    if (tunebook.showImportWarning(results)) {
      if (setNavigateAfterImport) setNavigateAfterImport(scopePayload)
      setImportBusy(false)
      return
    }

    let afterMerge = null
    if (option.scope === 'all') {
      afterMerge = function() {
        return mergePerformanceSetsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          .then(function() {
            return mergePlaylistsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          })
          .then(function() {
            return mergePracticeListsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          })
      }
    } else if (option.scope === 'set') {
      afterMerge = function() { return importSinglePerformanceSetFromAbc(abcText, option.setId) }
    } else if (option.scope === 'playlist') {
      afterMerge = function() { return importSinglePlaylistFromAbc(abcText, option.playlistId) }
    }

    applyImportResults(results, scopePayload, afterMerge, Object.assign({}, option, { limitToTuneIds: limitToTuneIds })).finally(function() {
      setImportBusy(false)
    })
  }, [abcText, preview.sets, preview.playlists, tunebook, applyImportResults, setNavigateAfterImport, rememberPendingSourceRegistration])

  const openBatchInReview = useCallback(function(includeDuplicates) {
    if (!batchSummary) return
    const candidates = reviewCandidatesFromBatch(batchSummary, {
      includeDuplicates: !!includeDuplicates,
      onlyUncertain: false,
    })
    if (!candidates.length) {
      setError('Nothing left to review.')
      return
    }
    requestImportReview(candidates, { entryMode: 'import' })
    showImportReviewUi()
    setBatchSummary(null)
  }, [batchSummary])

  const applyCertainFromBatch = useCallback(function() {
    if (!batchSummary || !batchSummary.raw) return
    setImportBusy(true)
    const filtered = filterCertainImportRaw(batchSummary.raw, batchSummary.candidates || [])
    let afterMerge = null
    if (pendingScope && pendingScope.scope === 'all') {
      afterMerge = function() {
        return mergePerformanceSetsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          .then(function() {
            return mergePlaylistsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          })
          .then(function() {
            return mergePracticeListsFromTuneBookAbc(abcText, { interactive: false, applySilently: true })
          })
      }
    } else if (pendingScope && pendingScope.scope === 'set') {
      afterMerge = function() { return importSinglePerformanceSetFromAbc(abcText, pendingScope.setId) }
    } else if (pendingScope && pendingScope.scope === 'playlist') {
      afterMerge = function() { return importSinglePlaylistFromAbc(abcText, pendingScope.playlistId) }
    }
    const scopePayload = pendingScope
      ? buildNavigateAfterImport(pendingScope.scope, {
        tuneId: pendingScope.tuneId,
        bookName: pendingScope.bookName,
        setId: pendingScope.setId,
        playlistId: pendingScope.playlistId,
        tagName: pendingScope.tagName,
      })
      : {}
    applyImportResults(filtered, scopePayload, afterMerge, pendingScope).finally(function() {
      setImportBusy(false)
      setBatchSummary(null)
      setPendingScope(null)
    })
  }, [batchSummary, pendingScope, abcText, applyImportResults])

  if (!params.googleDocumentId || !params.googleDocumentId.trim()) return null

  return (
    <div className="App-import">
      <h1>Import a Shared Tunebook</h1>
      {!accessToken && (
        <p>
          To import this tunebook, log in with Google.
          <Button style={{ marginLeft: '0.3em' }} variant="success" onClick={refresh}>Login</Button>
        </p>
      )}
      {accessToken && loading && !abcText && <p>Loading shared tunebook…</p>}
      {accessToken && error && <p>{error}</p>}
      {accessToken && !error && abcText && batchSummary ? (
        <ImportBatchSummaryPanel
          summary={batchSummary}
          onReviewAll={function() { openBatchInReview(false) }}
          onIncludeDuplicates={function() { openBatchInReview(true) }}
          onApplyCertain={applyCertainFromBatch}
          onCancel={function() {
            setBatchSummary(null)
            setPendingScope(null)
            setPendingShareImportSideEffect(null)
            clearPendingShareImportSourceRegistration()
            navigate('/tunes')
          }}
        />
      ) : null}
      {accessToken && !error && abcText && !batchSummary && (
        <ImportScopePicker
          preview={preview}
          context={routeContext}
          busy={importBusy}
          onSelect={runImportForOption}
          onCancel={function() { navigate('/tunes') }}
        />
      )}
    </div>
  )
}
