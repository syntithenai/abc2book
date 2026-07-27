import { useState, useCallback, useRef } from 'react'
import { toast } from 'react-toastify'
import { useAutoLinkPlaybackRegionScan } from './useAutoLinkPlaybackRegionScan'
import useAbcjsParser from './useAbcjsParser'
import useMediaResolverHealth from './useMediaResolverHealth'
import useTuneFieldLookupQueue from './useTuneFieldLookupQueue'
import useBulkBackgroundResearchQueue from './useBulkBackgroundResearchQueue'
import {
  runBulkCheckFixAction,
  syncTuneFromStore,
  previewStructureFix,
  STRUCTURE_FIX_ACTIONS,
} from './bulkCheckFixActions'
import {
  BULK_CHECK_NAV_ACTIONS,
  diffTuneFields,
  listFixAllActionIds,
} from './bulkCheckIssueGroups'
import {
  FIX_ALL_BACKGROUND_ACTIONS,
  FIX_ALL_PREVIEW_ACTIONS,
  orderFixAllActionIds,
} from './bulkCheckFixAll'
import {
  enqueueBulkCheckArtistSearch,
  enqueueBulkCheckBackgroundResearch,
} from './bulkCheckBackgroundSearch'
import { isBulkCheckResolverGatedAction } from './bulkCheckSearchAccess'

function actionIdFromAction(action) {
  if (!action) return ''
  return typeof action === 'string' ? action : action.id
}

export default function useBulkCheckFixRunner(props) {
  const [busy, setBusy] = useState(false)
  const [previewState, setPreviewState] = useState(null)
  const fixAllQueueRef = useRef(null)
  const fixAllIndexRef = useRef(0)
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const backgroundQueue = useBulkBackgroundResearchQueue()
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const tune = props.tune

  const parseAndRender = useCallback(function(abc) {
    const parsed = abcjsParser.parse(abc)
    return abcjsParser.render(parsed, abc)
  }, [abcjsParser])

  function buildFixOpts(action) {
    const actionMeta = typeof action === 'object' ? action : null
    return {
      tune: tune,
      tunebook: props.tunebook,
      token: props.token,
      signal: null,
      issues: props.issues || [],
      report: props.report || null,
      maybeAutoScan: maybeAutoScan,
      linkIndex: actionMeta && actionMeta.linkIndex != null ? actionMeta.linkIndex : null,
      renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
      parseAndRender: parseAndRender,
      resolverAvailable: resolverChecked ? resolverAvailable : undefined,
    }
  }

  function buildSearchOptions() {
    return {
      resolverAvailable: resolverChecked ? resolverAvailable : undefined,
      abcTools: props.tunebook && props.tunebook.abcTools ? props.tunebook.abcTools : null,
      renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
    }
  }

  async function applyFix(action) {
    const actionId = actionIdFromAction(action)
    if (!tune || !props.tunebook) return null

    if (actionId === 'editTuneLinks') {
      if (typeof props.onEditTune === 'function') props.onEditTune(tune.id)
      return null
    }

    if (actionId === 'searchChordsLyrics') {
      if (typeof props.onEditTune === 'function') {
        props.onEditTune(tune.id, { initialView: 'chords', autoStartChordSearch: true })
      }
      return null
    }

    const controller = new AbortController()
    const fixOpts = Object.assign({}, buildFixOpts(action), { signal: controller.signal })
    const updated = await runBulkCheckFixAction(actionId, fixOpts)
    const synced = syncTuneFromStore(updated, fixOpts)
    if (actionId !== 'stems' && !BULK_CHECK_NAV_ACTIONS.has(actionId)) {
      props.tunebook.saveTune(synced, false, { historyLabel: 'Bulk check fix', immediate: true })
    }
    if (props.forceRefresh) props.forceRefresh()
    if (props.onFixComplete) props.onFixComplete(synced)
    return synced
  }

  function enqueueBackgroundFixAction(actionId) {
    const searchOpts = {
      token: props.token,
      searchOptions: buildSearchOptions(),
    }
    if (actionId === 'searchArtist') {
      return enqueueBulkCheckArtistSearch(fieldLookupQueue, tune, searchOpts)
    }
    if (actionId === 'backgroundInfo') {
      return enqueueBulkCheckBackgroundResearch(backgroundQueue, tune, searchOpts)
    }
    return false
  }

  function openPreviewForAction(actionId) {
    const structureAction = STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId })
    const fixOpts = buildFixOpts(actionId)
    const preview = previewStructureFix(
      actionId,
      tune,
      props.tunebook.abcTools,
      fixOpts.parseAndRender
    )
    if (!preview) {
      toast.info('No changes would be made by this fix.')
      return false
    }
    const fieldDiffs = diffTuneFields(tune, preview.tune, props.tunebook.abcTools)
    setPreviewState({
      actionId: actionId,
      actionLabel: structureAction ? structureAction.label : actionId,
      preview: preview,
      fieldDiffs: fieldDiffs,
      tuneId: tune.id,
      fixAll: !!fixAllQueueRef.current,
    })
    return true
  }

  async function runFixAllStep(actionId) {
    if (isBulkCheckResolverGatedAction(actionId) && handleBlockedResolverAction(actionId)) {
      return 'continue'
    }
    if (FIX_ALL_PREVIEW_ACTIONS.has(actionId)) {
      openPreviewForAction(actionId)
      return 'preview'
    }
    if (FIX_ALL_BACKGROUND_ACTIONS.has(actionId)) {
      enqueueBackgroundFixAction(actionId)
      return 'continue'
    }
    await applyFix(actionId)
    return 'continue'
  }

  async function processFixAllQueue() {
    const queue = fixAllQueueRef.current
    if (!queue || !tune) {
      setBusy(false)
      return
    }

    while (fixAllIndexRef.current < queue.length) {
      const actionId = queue[fixAllIndexRef.current]
      try {
        const result = await runFixAllStep(actionId)
        if (result === 'preview') return
      } catch (e) {
        if (e && e.name !== 'AbortError') {
          toast.error(e && e.message ? e.message : 'Fix failed.')
        }
      }
      fixAllIndexRef.current += 1
    }

    fixAllQueueRef.current = null
    fixAllIndexRef.current = 0
    setBusy(false)
  }

  async function startFixAll() {
    if (!tune || !props.tunebook || busy || props.busy) return
    if (typeof props.onIgnoreTune === 'function') props.onIgnoreTune(tune.id)

    const fixOpts = buildFixOpts('searchAll')
    const fixAllIds = props.report
      ? listFixAllActionIds(props.report, tune, props.tunebook, fixOpts.parseAndRender)
      : []
    if (fixAllIds.length === 0) return

    fixAllQueueRef.current = orderFixAllActionIds(fixAllIds)
    fixAllIndexRef.current = 0
    setBusy(true)
    await processFixAllQueue()
  }

  function resolveActionAccess(actionId) {
    if (!isBulkCheckResolverGatedAction(actionId) || typeof props.getSearchAccess !== 'function' || !tune) {
      return null
    }
    return props.getSearchAccess(actionId, tune)
  }

  function handleBlockedResolverAction(actionId) {
    const access = resolveActionAccess(actionId)
    if (!access) return false
    if (access.showExternalOnly && access.externalUrl) {
      window.open(access.externalUrl, '_blank', 'noopener,noreferrer')
      return true
    }
    if (!access.canRunAutomatic) {
      if (access.unavailableReason) {
        toast.warning(access.unavailableReason)
      }
      return true
    }
    return false
  }

  async function runSingleAction(action) {
    const actionId = actionIdFromAction(action)
    if (!tune || !props.tunebook || busy || props.busy) return

    if (isBulkCheckResolverGatedAction(actionId) && handleBlockedResolverAction(actionId)) {
      return
    }

    if (actionId === 'editTuneLinks') {
      if (typeof props.onEditTune === 'function') props.onEditTune(tune.id)
      return
    }

    if (actionId === 'searchChordsLyrics') {
      if (typeof props.onEditTune === 'function') {
        props.onEditTune(tune.id, { initialView: 'chords', autoStartChordSearch: true })
      }
      return
    }

    const structureAction = STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId })
    if (structureAction && structureAction.requiresPreview) {
      openPreviewForAction(actionId)
      return
    }

    if (FIX_ALL_BACKGROUND_ACTIONS.has(actionId)) {
      if (handleBlockedResolverAction(actionId)) return
      setBusy(true)
      try {
        const queued = enqueueBackgroundFixAction(actionId)
        if (!queued) {
          toast.info('Could not queue search — tune may need a title or a job is already running.')
        }
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await applyFix(action)
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        toast.error(e && e.message ? e.message : 'Fix failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  function runAction(action) {
    const actionId = actionIdFromAction(action)
    if (actionId === 'searchAll') {
      startFixAll()
      return
    }
    runSingleAction(action)
  }

  async function handlePreviewConfirm() {
    if (!previewState) return
    const actionId = previewState.actionId
    const inFixAll = !!previewState.fixAll
    setBusy(true)
    try {
      await applyFix(actionId)
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        toast.error(e && e.message ? e.message : 'Fix failed.')
      }
    } finally {
      setPreviewState(null)
      if (inFixAll) {
        fixAllIndexRef.current += 1
        await processFixAllQueue()
      } else {
        setBusy(false)
      }
    }
  }

  function clearPreview() {
    const inFixAll = !!(previewState && previewState.fixAll)
    setPreviewState(null)
    if (inFixAll) {
      fixAllIndexRef.current += 1
      setBusy(true)
      processFixAllQueue()
    }
  }

  const isDisabled = busy || props.busy || !tune

  return {
    busy: busy,
    isDisabled: isDisabled,
    runAction: runAction,
    previewState: previewState,
    clearPreview: clearPreview,
    handlePreviewConfirm: handlePreviewConfirm,
    tuneId: tune && tune.id ? tune.id : null,
  }
}
