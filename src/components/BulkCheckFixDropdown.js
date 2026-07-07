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
} from '../bulkCheckFixActions'

export default function BulkCheckFixDropdown(props) {
  const [busy, setBusy] = useState(false)
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const { available: resolverAvailable, checked: resolverChecked } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const tune = props.tune
  const hasAudio = tuneHasAudioForFix(tune, props.tunebook)

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

  async function runAction(actionId) {
    if (!tune || !props.tunebook || busy || props.busy) return
    if (actionId === 'searchAll' && typeof props.onIgnoreTune === 'function') {
      props.onIgnoreTune(tune.id)
    }
    setBusy(true)
    const controller = new AbortController()
    const fixOpts = {
      tune: tune,
      tunebook: props.tunebook,
      token: props.token,
      signal: controller.signal,
      maybeAutoScan: maybeAutoScan,
      runMediaAnalysis: runMediaAnalysis,
      resolverAvailable: resolverChecked ? resolverAvailable : undefined,
      renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
    }
    try {
      const updated = await runBulkCheckFixAction(actionId, fixOpts)
      const synced = syncTuneFromStore(updated, fixOpts)
      if (actionId !== 'stems') {
        props.tunebook.saveTune(synced, false, { historyLabel: 'Bulk check fix', immediate: true })
      }
      if (props.forceRefresh) props.forceRefresh()
      if (props.onFixComplete) props.onFixComplete(synced)
      toast.success(actionId === 'searchAll' ? 'Search All completed.' : 'Fix applied.')
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        toast.error(e && e.message ? e.message : 'Fix failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const isDisabled = busy || props.busy || !tune
  const individualActions = BULK_CHECK_FIX_ACTIONS.filter(function(action) {
    return action.id !== 'searchAll'
  })

  return (
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
  )
}
