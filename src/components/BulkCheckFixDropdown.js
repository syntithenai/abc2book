import { useState, useMemo, useCallback } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { useAutoLinkPlaybackRegionScan } from '../useAutoLinkPlaybackRegionScan'
import { requestTuneMediaAnalysis } from '../useTuneMediaAnalysis'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import {
  BULK_CHECK_FIX_ACTIONS,
  runBulkCheckFixAction,
  syncTuneFromStore,
  tuneHasAudioForFix,
  previewStructureFix,
  STRUCTURE_FIX_ACTIONS,
} from '../bulkCheckFixActions'
import { getAvailableStructureFixes, isSafeNormalizePreview } from '../tuneAbcStructureFix'
import BulkCheckFixPreviewModal from './BulkCheckFixPreviewModal'

export default function BulkCheckFixDropdown(props) {
  const [busy, setBusy] = useState(false)
  const [previewState, setPreviewState] = useState(null)
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const tune = props.tune
  const hasAudio = tuneHasAudioForFix(tune, props.tunebook)
  const issueCodes = useMemo(function() {
    const issues = props.issues || []
    return issues.map(function(item) { return item.code })
  }, [props.issues])

  const structureFixes = useMemo(function() {
    if (!tune || !props.tunebook || !props.tunebook.abcTools) return []
    return getAvailableStructureFixes(
      tune,
      props.tunebook.abcTools,
      props.issues || [],
      abcjsParser.parseAndRender
    )
  }, [tune, props.tunebook, props.issues, abcjsParser.parseAndRender])

  const analysisDeps = useMemo(function() {
    const tunes = props.tunes || {}
    if (tune && tune.id && !tunes[tune.id]) {
      return {
        tunebook: props.tunebook,
        tunes: Object.assign({}, tunes, { [tune.id]: tune }),
        token: props.token,
        forceRefresh: props.forceRefresh,
        accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
        driveApi: props.driveApi,
      }
    }
    return {
      tunebook: props.tunebook,
      tunes: tunes,
      token: props.token,
      forceRefresh: props.forceRefresh,
      accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
      driveApi: props.driveApi,
    }
  }, [props.tunebook, props.tunes, props.token, props.forceRefresh, props.driveApi, tune])

  const runMediaAnalysis = useCallback(async function(currentTune, options) {
    if (!currentTune || !currentTune.id) return null
    return requestTuneMediaAnalysis(analysisDeps, currentTune.id, Object.assign({}, options, {
      tune: currentTune,
    }))
  }, [analysisDeps])

  function buildFixOpts() {
    return {
      tune: tune,
      tunebook: props.tunebook,
      token: props.token,
      signal: null,
      maybeAutoScan: maybeAutoScan,
      runMediaAnalysis: runMediaAnalysis,
      resolverAvailable: resolverChecked ? resolverAvailable : undefined,
      renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
      parseAndRender: abcjsParser.parseAndRender,
    }
  }

  async function applyFix(actionId) {
    if (!tune || !props.tunebook || busy || props.busy) return
    if (actionId === 'searchAll' && typeof props.onIgnoreTune === 'function') {
      props.onIgnoreTune(tune.id)
    }
    setBusy(true)
    const controller = new AbortController()
    const fixOpts = Object.assign({}, buildFixOpts(), { signal: controller.signal })
    try {
      const updated = await runBulkCheckFixAction(actionId, fixOpts)
      const synced = syncTuneFromStore(updated, fixOpts)
      if (actionId !== 'stems') {
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

  function runAction(actionId) {
    const structureAction = STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId })
    if (structureAction && structureAction.requiresPreview) {
      const fixOpts = buildFixOpts()
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
      setPreviewState({
        actionId: actionId,
        actionLabel: structureAction.label,
        preview: preview,
        warning: warning,
      })
      return
    }
    applyFix(actionId)
  }

  function handlePreviewConfirm() {
    if (!previewState) return
    applyFix(previewState.actionId)
    setPreviewState(null)
  }

  const isDisabled = busy || props.busy || !tune
  const individualActions = BULK_CHECK_FIX_ACTIONS.filter(function(action) {
    return action.id !== 'searchAll'
  })
  const tierAFixes = structureFixes.filter(function(action) { return action.tier === 'a' })
  const tierBFixes = structureFixes.filter(function(action) { return action.tier === 'b' })
  const hasStructureFixes = tierAFixes.length > 0 || tierBFixes.length > 0
  const canFixHeaders = issueCodes.some(function(code) {
    return code === 'missing_meter_header' || code === 'missing_key_header'
  })

  return (
    <>
      <Dropdown align="end" className="bulk-check-fix-dropdown">
        <Dropdown.Toggle variant="outline-primary" size="sm" disabled={isDisabled}>
          {busy || props.busy ? 'Fixing…' : 'Fix'}
        </Dropdown.Toggle>
        <Dropdown.Menu
          popperConfig={{
            strategy: 'fixed',
            modifiers: [{ name: 'offset', options: { offset: [0, 4] } }],
          }}
          renderOnMount
        >
          {hasStructureFixes ? (
            <>
              <Dropdown.Header>Notation fixes</Dropdown.Header>
              {tierAFixes.map(function(action) {
                return (
                  <Dropdown.Item key={action.id} onClick={function() { runAction(action.id) }}>
                    {action.label}
                  </Dropdown.Item>
                )
              })}
              {tierBFixes.map(function(action) {
                return (
                  <Dropdown.Item key={action.id} onClick={function() { runAction(action.id) }}>
                    {action.label}
                  </Dropdown.Item>
                )
              })}
              {canFixHeaders && tierAFixes.every(function(a) { return a.id !== 'fixHeaders' }) ? (
                <Dropdown.Item onClick={function() { runAction('fixHeaders') }}>
                  Fix missing headers
                </Dropdown.Item>
              ) : null}
              <Dropdown.Divider />
            </>
          ) : canFixHeaders ? (
            <>
              <Dropdown.Item onClick={function() { runAction('fixHeaders') }}>
                Fix missing headers
              </Dropdown.Item>
              <Dropdown.Divider />
            </>
          ) : null}
          <Dropdown.Item onClick={function() { runAction('searchAll') }}>
            Search All
          </Dropdown.Item>
          <Dropdown.Divider />
          {individualActions.map(function(action) {
            const disabled = action.requiresAudio && !hasAudio
            return (
              <Dropdown.Item
                key={action.id}
                disabled={disabled}
                onClick={function() { runAction(action.id) }}
              >
                {action.label}
              </Dropdown.Item>
            )
          })}
        </Dropdown.Menu>
      </Dropdown>
      <BulkCheckFixPreviewModal
        show={!!previewState}
        onHide={function() { setPreviewState(null) }}
        onConfirm={handlePreviewConfirm}
        preview={previewState ? previewState.preview : null}
        actionLabel={previewState ? previewState.actionLabel : 'Apply fix'}
        warning={previewState ? previewState.warning : ''}
      />
    </>
  )
}
