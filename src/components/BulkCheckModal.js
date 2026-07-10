import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import BulkCheckTuneList from './BulkCheckTuneList'
import BulkCheckTuneEditorModal from './BulkCheckTuneEditorModal'
import SearchProgressBar from './SearchProgressBar'
import useBulkCheckRouteSync from '../useBulkCheckRouteSync'
import useAbcjsParser from '../useAbcjsParser'
import {
  getBulkCheckSession,
  isBulkCheckLinkPhaseRunning,
  isBulkCheckPhaseRunning,
  patchBulkCheckSession,
  subscribeBulkCheckSession,
} from '../bulkCheckSessionStore'
import {
  cancelBulkCheckRun,
  isBulkCheckRunnerActive,
  startBulkCheckLinkRun,
  startBulkCheckStaticRun,
} from '../bulkCheckRunner'
import { dismissBulkCheckReturnToast } from '../bulkCheckReturnContext'
import {
  buildLinkCheckQueue,
  getLinkRegionWarnings,
} from '../checkTuneLinkPlayback'
import { buildTuneCheckReports } from '../tuneBulkCheckReport'

export default function BulkCheckModal(props) {
  const bulkCheckRoute = useBulkCheckRouteSync()
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })

  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState('intro')
  const [hasRun, setHasRun] = useState(false)
  const [linksChecked, setLinksChecked] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [linkFailures, setLinkFailures] = useState([])
  const [linkWarnings, setLinkWarnings] = useState([])
  const [ignoredTuneIds, setIgnoredTuneIds] = useState({})
  const [showIgnored, setShowIgnored] = useState(false)
  const [sessionTick, setSessionTick] = useState(0)
  const [editingTuneId, setEditingTuneId] = useState(null)
  const [fixBusyTuneId, setFixBusyTuneId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const selectionKey = useMemo(function() {
    if (!props.selected) return ''
    return Object.keys(props.selected)
      .filter(function(id) { return props.selected[id] })
      .sort()
      .join(',')
  }, [props.selected])

  const selectedTunes = useMemo(function() {
    if (!props.tunebook || !props.selected) return []
    return props.tunebook.fromSelection(props.selected)
  }, [props.tunebook, props.selected, refreshKey])

  const tunesById = useMemo(function() {
    const map = {}
    selectedTunes.forEach(function(tune) {
      if (tune && tune.id) map[tune.id] = tune
    })
    return map
  }, [selectedTunes])

  const queue = useMemo(function() {
    return buildLinkCheckQueue(selectedTunes)
  }, [selectedTunes])

  const hasLinks = props.tunebook && props.tunebook.hasLinks
    ? props.tunebook.hasLinks
    : null

  const checkOptions = useMemo(function() {
    const abcTools = props.tunebook && props.tunebook.abcTools
    return {
      hasChords: abcTools ? abcTools.hasChords.bind(abcTools) : null,
      renderChords: abcjsParser.renderChords,
      abcTools: abcTools,
      hasNotesOrChords: props.tunebook && props.tunebook.hasNotesOrChords
        ? props.tunebook.hasNotesOrChords.bind(props.tunebook)
        : null,
      hasLinks: hasLinks,
      parseAndRender: function(abc) {
        const parsed = abcjsParser.parse(abc)
        return abcjsParser.render(parsed, abc)
      },
    }
  }, [props.tunebook, abcjsParser, hasLinks])

  const isYoutubeLink = props.tunebook && props.tunebook.utils
    ? props.tunebook.utils.isYoutubeLink
    : function() { return false }

  const youtubeGetId = props.tunebook && props.tunebook.utils
    ? props.tunebook.utils.YouTubeGetID
    : function() { return null }

  const reports = useMemo(function() {
    const linkContext = {
      failures: linkFailures,
      warnings: linkWarnings,
      linksChecked: linksChecked,
      hasLinks: hasLinks,
    }
    return buildTuneCheckReports(selectedTunes, Object.assign({}, checkOptions, {
      linkContext: linkContext,
      renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
    }))
  }, [selectedTunes, checkOptions, linkFailures, linkWarnings, linksChecked, hasLinks, abcjsParser, refreshKey])

  function sessionMatchesSelection(session) {
    return !!(session && session.selectionKey === selectionKey)
  }

  function buildSessionSnapshot(overrides) {
    return Object.assign({
      selectionKey: selectionKey,
      phase: phase,
      links: {
        failures: linkFailures,
        warnings: linkWarnings,
        progressMessage: progressMessage,
        checkedCount: 0,
        totalCount: queue.length,
        progressPercent: progressPercent,
      },
      ignoredTuneIds: Object.keys(ignoredTuneIds).filter(function(id) { return ignoredTuneIds[id] }),
      linksChecked: linksChecked,
      hasRun: hasRun,
    }, overrides || {})
  }

  function persistSession(updates) {
    patchBulkCheckSession(selectionKey, updates)
  }

  function restoreFromSession(session) {
    setPhase(session.phase || 'intro')
    setLinkFailures(session.links && Array.isArray(session.links.failures) ? session.links.failures : [])
    setLinkWarnings(session.links && Array.isArray(session.links.warnings) ? session.links.warnings : [])
    setProgressMessage(session.links ? session.links.progressMessage || '' : '')
    setProgressPercent(session.links ? session.links.progressPercent || 0 : 0)
    setLinksChecked(!!session.linksChecked)
    setHasRun(!!session.hasRun)
    const ignored = {}
    ;(session.ignoredTuneIds || []).forEach(function(id) { ignored[id] = true })
    setIgnoredTuneIds(ignored)
  }

  function resetToIntro() {
    setPhase('intro')
    setHasRun(false)
    setLinksChecked(false)
    setLinkFailures([])
    setLinkWarnings(getLinkRegionWarnings(selectedTunes, hasLinks))
    setProgressMessage('')
    setProgressPercent(0)
    setIgnoredTuneIds({})
    setShowIgnored(false)
  }

  function runStaticCheck() {
    const warnings = getLinkRegionWarnings(selectedTunes, hasLinks)
    setLinkWarnings(warnings)
    setHasRun(true)
    startBulkCheckStaticRun({
      selectionKey: selectionKey,
      queueLength: queue.length,
      staticResults: {
        completeness: [],
        abc: [],
        warnings: warnings,
      },
    })
    syncFromSession()
  }

  function runLinkCheck() {
    const warnings = getLinkRegionWarnings(selectedTunes, hasLinks)
    startBulkCheckLinkRun({
      selectionKey: selectionKey,
      queue: queue,
      warnings: warnings,
      isYoutubeLink: isYoutubeLink,
      youtubeGetId: youtubeGetId,
      accessToken: props.token,
    })
  }

  function syncFromSession() {
    const stored = getBulkCheckSession(selectionKey)
    if (!sessionMatchesSelection(stored)) return
    restoreFromSession(stored)
  }

  useEffect(function() {
    return subscribeBulkCheckSession(function() {
      setSessionTick(function(tick) { return tick + 1 })
    })
  }, [])

  useEffect(function() {
    syncFromSession()
  }, [selectionKey, sessionTick])

  useEffect(function() {
    if (!selectionKey) return
    const session = getBulkCheckSession(selectionKey)
    if (!sessionMatchesSelection(session)) return
    if (isBulkCheckPhaseRunning(session.phase) || isBulkCheckRunnerActive()) {
      setShow(true)
      restoreFromSession(session)
    }
  }, [selectionKey])

  function handleClose() {
    persistSession(buildSessionSnapshot())
    setShow(false)
    if (bulkCheckRoute.routeActive) bulkCheckRoute.closeRoute()
  }

  function openModal(options) {
    const opts = options || {}
    dismissBulkCheckReturnToast()
    setShow(true)

    const stored = getBulkCheckSession(selectionKey)
    if (sessionMatchesSelection(stored) && stored.hasRun) {
      restoreFromSession(stored)
      if (opts.autoStartCheck && stored.phase === 'intro') {
        runStaticCheck()
      }
      return
    }

    resetToIntro()
    if (opts.autoStartCheck) {
      runStaticCheck()
    }
  }

  function handleShow() {
    openModal({ autoStartCheck: false })
  }

  useEffect(function() {
    if (!bulkCheckRoute.routeActive) return
    if (!show) {
      openModal({ autoStartCheck: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkCheckRoute.routeActive, selectionKey])

  function handleCheckLinksClick() {
    if (isLinkChecking) {
      cancelBulkCheckRun()
      return
    }
    runLinkCheck()
  }

  function handleIgnoreTune(tuneId) {
    setIgnoredTuneIds(function(prev) {
      const next = Object.assign({}, prev)
      next[tuneId] = true
      persistSession(buildSessionSnapshot({
        ignoredTuneIds: Object.keys(next).filter(function(id) { return next[id] }),
      }))
      return next
    })
  }

  function handleUnignoreTune(tuneId) {
    setIgnoredTuneIds(function(prev) {
      const next = Object.assign({}, prev)
      delete next[tuneId]
      persistSession(buildSessionSnapshot({
        ignoredTuneIds: Object.keys(next).filter(function(id) { return next[id] }),
      }))
      return next
    })
  }

  function handleRecheckTune(tuneId) {
    if (props.forceRefresh) props.forceRefresh()
    setRefreshKey(function(k) { return k + 1 })
    setFixBusyTuneId(null)
    persistSession(buildSessionSnapshot())
  }

  function handleEditorSaved(tuneId) {
    handleRecheckTune(tuneId)
  }

  const isRunning = isBulkCheckPhaseRunning(phase) || isBulkCheckRunnerActive()
  const isLinkChecking = isBulkCheckLinkPhaseRunning(phase) || (isBulkCheckRunnerActive() && phase === 'running-links')
  const editingTune = editingTuneId ? tunesById[editingTuneId] : null

  const ignoredCount = Object.keys(ignoredTuneIds).filter(function(id) {
    return ignoredTuneIds[id]
  }).length

  const checkButtonLabel = isLinkChecking && progressPercent > 0
    ? 'Check Links (' + progressPercent + '%)'
    : (isLinkChecking ? 'Cancel check' : 'Check Links')

  return (
    <>
      <Button
        className="bulk-ops-action-btn"
        variant="success"
        onClick={function() {
          bulkCheckRoute.openRoute()
          openModal({ autoStartCheck: true })
        }}
        aria-label={hasRun ? 'Check' : 'Check'}
        title={isRunning && progressMessage ? progressMessage : 'Check selected tunes'}
      >
        {props.tunebook && props.tunebook.icons ? props.tunebook.icons.check : null}
        <span className="bulk-ops-btn-label"> Check</span>
      </Button>

      <Modal
        show={show}
        onHide={handleClose}
        fullscreen
        scrollable
        className="bulk-check-modal"
        backdropClassName="bulk-check-backdrop"
        dialogClassName="bulk-check-modal-dialog"
        contentClassName="bulk-check-modal-content"
        backdrop={isLinkChecking ? 'static' : true}
      >
        <Modal.Header closeButton className="bulk-check-modal-header">
          <Modal.Title>
            Check {props.selectedCount} selected tune{props.selectedCount === 1 ? '' : 's'}
          </Modal.Title>
          <div className="bulk-check-header-actions">
            {ignoredCount > 0 && (
              <Form.Check
                type="switch"
                id="bulk-check-show-ignored"
                className="bulk-check-show-ignored-toggle"
                label={'Show ignored (' + ignoredCount + ')'}
                checked={showIgnored}
                onChange={function(e) { setShowIgnored(e.target.checked) }}
              />
            )}
            {!hasRun && (
              <Button variant="primary" size="sm" onClick={runStaticCheck}>
                Run check
              </Button>
            )}
            {hasRun && (
              <Button
                variant={isLinkChecking ? 'warning' : 'primary'}
                size="sm"
                onClick={handleCheckLinksClick}
              >
                {checkButtonLabel}
              </Button>
            )}
          </div>
        </Modal.Header>
        <Modal.Body>
          {hasRun && isLinkChecking && (
            <div className="bulk-check-links-progress">
              <SearchProgressBar
                visible={true}
                percent={progressPercent}
                message={progressMessage}
                defaultMessage="Checking links..."
              />
            </div>
          )}

          {hasRun && !isLinkChecking && progressMessage && linksChecked && (
            <p className="bulk-check-status-message text-muted">{progressMessage}</p>
          )}

          <BulkCheckTuneList
            reports={reports}
            hasRun={hasRun}
            showIgnored={showIgnored}
            ignoredTuneIds={ignoredTuneIds}
            tunesById={tunesById}
            tunebook={props.tunebook}
            token={props.token}
            forceRefresh={props.forceRefresh}
            fixBusyTuneId={fixBusyTuneId}
            onEditTune={function(tuneId) { setEditingTuneId(tuneId) }}
            onIgnoreTune={handleIgnoreTune}
            onUnignoreTune={handleUnignoreTune}
            onRecheckTune={handleRecheckTune}
          />
        </Modal.Body>
      </Modal>

      <BulkCheckTuneEditorModal
        show={!!editingTune}
        tune={editingTune}
        tunebook={props.tunebook}
        token={props.token}
        forceRefresh={props.forceRefresh}
        onClose={function() { setEditingTuneId(null) }}
        onSaved={handleEditorSaved}
      />
    </>
  )
}
