import { useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import { useAutoLinkPlaybackRegionScan } from './useAutoLinkPlaybackRegionScan'
import useAbcjsParser from './useAbcjsParser'
import {
  runBulkCheckFixAction,
  syncTuneFromStore,
  previewStructureFix,
  STRUCTURE_FIX_ACTIONS,
} from './bulkCheckFixActions'
import { isSafeNormalizePreview } from './tuneAbcStructureFix'
import { BULK_CHECK_NAV_ACTIONS, diffTuneFields } from './bulkCheckIssueGroups'

function actionIdFromAction(action) {
  if (!action) return ''
  return typeof action === 'string' ? action : action.id
}

export default function useBulkCheckFixRunner(props) {
  const [busy, setBusy] = useState(false)
  const [previewState, setPreviewState] = useState(null)
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
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
    }
  }

  async function applyFix(action) {
    const actionId = actionIdFromAction(action)
    if (!tune || !props.tunebook || busy || props.busy) return

    if (actionId === 'editTuneLinks' || actionId === 'editTunePractice') {
      if (typeof props.onEditTune === 'function') props.onEditTune(tune.id)
      return
    }

    if (actionId === 'searchAll' && typeof props.onIgnoreTune === 'function') {
      props.onIgnoreTune(tune.id)
    }
    setBusy(true)
    const controller = new AbortController()
    const fixOpts = Object.assign({}, buildFixOpts(action), { signal: controller.signal })
    try {
      const updated = await runBulkCheckFixAction(actionId, fixOpts)
      const synced = syncTuneFromStore(updated, fixOpts)
      if (actionId !== 'stems' && !BULK_CHECK_NAV_ACTIONS.has(actionId)) {
        props.tunebook.saveTune(synced, false, { historyLabel: 'Bulk check fix', immediate: true })
      }
      if (props.forceRefresh) props.forceRefresh()
      if (props.onFixComplete) props.onFixComplete(synced)
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
    const structureAction = STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId })
    if (structureAction && structureAction.requiresPreview) {
      const fixOpts = buildFixOpts(action)
      const preview = previewStructureFix(
        actionId,
        tune,
        props.tunebook.abcTools,
        fixOpts.parseAndRender
      )
      if (!preview) {
        toast.info('No changes would be made by this fix.')
        return
      }
      let warning = ''
      if (actionId === 'normalizeAbc' && !isSafeNormalizePreview(preview, props.tunebook.abcTools)) {
        warning = 'Note content may change after normalization. Review carefully before applying.'
      }
      const fieldDiffs = diffTuneFields(tune, preview.tune, props.tunebook.abcTools)
      setPreviewState({
        actionId: actionId,
        actionLabel: structureAction.label,
        preview: preview,
        warning: warning,
        fieldDiffs: fieldDiffs,
        tuneId: tune.id,
      })
      return
    }
    applyFix(action)
  }

  function handlePreviewConfirm() {
    if (!previewState) return
    applyFix(previewState.actionId)
    setPreviewState(null)
  }

  const isDisabled = busy || props.busy || !tune

  return {
    busy: busy,
    isDisabled: isDisabled,
    runAction: runAction,
    previewState: previewState,
    clearPreview: function() { setPreviewState(null) },
    handlePreviewConfirm: handlePreviewConfirm,
    tuneId: tune && tune.id ? tune.id : null,
  }
}
