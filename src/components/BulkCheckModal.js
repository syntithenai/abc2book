import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import SearchProgressBar from './SearchProgressBar'
import {
  buildLinkCheckQueue,
} from '../checkTuneLinkPlayback'
import { getLiveTune } from '../bulkCheckTuneSync'
import { dedupeTunesById } from '../tuneListFilter'
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
} from '../bulkCheckRunner'
import {
  groupLinkFailuresByTune,
  linkLabel,
  removeTuneLinkAtIndex,
  removeTuneLinksAtIndexes,
} from '../clearBrokenLinks'
import { toast } from 'react-toastify'
import {
  selectedMapFromSelectionKey,
  subscribeBulkCheckOpenRequest,
} from '../bulkCheckReturnContext'

function formatLinkFailure(item) {
  const label = linkLabel(item && item.link, item && item.linkIndex)
  const error = item && item.error ? String(item.error) : 'Playback failed'
  return { label: label, error: error }
}

export default function BulkCheckModal(props) {
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState('intro')
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [linkFailures, setLinkFailures] = useState([])
  const [needsLoginLinks, setNeedsLoginLinks] = useState([])
  const [linksChecked, setLinksChecked] = useState(false)
  const [sessionTick, setSessionTick] = useState(0)

  const selectionKey = useMemo(function() {
    if (!props.selected) return ''
    return Object.keys(props.selected)
      .filter(function(id) { return props.selected[id] })
      .sort()
      .join(',')
  }, [props.selected])

  const selectedTunes = useMemo(function() {
    if (!props.tunebook || !props.selected) return []
    const tunes = props.tunebook.fromSelection(props.selected).map(function(tune) {
      if (!tune || tune.id == null) return tune
      const live = getLiveTune(tune.id, { tunebook: props.tunebook })
      return live || tune
    })
    return dedupeTunesById(tunes)
  }, [props.tunebook, props.selected, sessionTick])

  const queue = useMemo(function() {
    return buildLinkCheckQueue(selectedTunes)
  }, [selectedTunes])

  const isYoutubeLink = props.tunebook && props.tunebook.utils
    ? props.tunebook.utils.isYoutubeLink
    : function() { return false }

  const youtubeGetId = props.tunebook && props.tunebook.utils
    ? props.tunebook.utils.YouTubeGetID
    : function() { return null }

  const failureGroups = useMemo(function() {
    return groupLinkFailuresByTune(linkFailures)
  }, [linkFailures])

  const needsLoginGroups = useMemo(function() {
    return groupLinkFailuresByTune(needsLoginLinks)
  }, [needsLoginLinks])

  function sessionMatchesSelection(session) {
    return !!(session && session.selectionKey === selectionKey)
  }

  function restoreFromSession(session) {
    setPhase(session.phase || 'intro')
    setLinkFailures(session.links && Array.isArray(session.links.failures) ? session.links.failures : [])
    setNeedsLoginLinks(session.links && Array.isArray(session.links.needsLogin) ? session.links.needsLogin : [])
    setProgressMessage(session.links ? session.links.progressMessage || '' : '')
    setProgressPercent(session.links ? session.links.progressPercent || 0 : 0)
    setLinksChecked(!!session.linksChecked)
  }

  function syncFromSession() {
    const stored = getBulkCheckSession(selectionKey)
    if (!sessionMatchesSelection(stored)) return
    restoreFromSession(stored)
  }

  function runLinkCheck() {
    startBulkCheckLinkRun({
      selectionKey: selectionKey,
      queue: queue,
      warnings: [],
      isYoutubeLink: isYoutubeLink,
      youtubeGetId: youtubeGetId,
      accessToken: props.token,
    })
  }

  function openModal() {
    setShow(true)
    const stored = getBulkCheckSession(selectionKey)
    if (sessionMatchesSelection(stored)
      && (stored.linksChecked || isBulkCheckLinkPhaseRunning(stored.phase))) {
      restoreFromSession(stored)
      return
    }
    setPhase('intro')
    setLinkFailures([])
    setNeedsLoginLinks([])
    setLinksChecked(false)
    setProgressMessage('')
    setProgressPercent(0)
    if (queue.length === 0) {
      setLinksChecked(true)
      setProgressMessage('No links to check in the selection.')
      patchBulkCheckSession(selectionKey, {
        selectionKey: selectionKey,
        phase: 'links-done',
        hasRun: true,
        linksChecked: true,
        links: {
          failures: [],
          needsLogin: [],
          warnings: [],
          progressMessage: 'No links to check in the selection.',
          checkedCount: 0,
          totalCount: 0,
          progressPercent: 100,
        },
      })
      return
    }
    runLinkCheck()
  }

  function restoreSelectionForKey(targetSelectionKey) {
    if (!targetSelectionKey || targetSelectionKey === selectionKey) return false
    if (typeof props.setSelected !== 'function') return false
    const nextSelected = selectedMapFromSelectionKey(targetSelectionKey)
    props.setSelected(nextSelected)
    if (typeof props.setSelectedCount === 'function') {
      props.setSelectedCount(Object.keys(nextSelected).length)
    }
    return true
  }

  useEffect(function() {
    return subscribeBulkCheckOpenRequest(function(request) {
      if (!request || !request.selectionKey) return
      if (restoreSelectionForKey(request.selectionKey)) {
        // selection update will remount with new key; open after restore
        setTimeout(function() { openModal() }, 0)
        return
      }
      openModal()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  function handleClose() {
    const stored = getBulkCheckSession(selectionKey)
    if (stored) {
      patchBulkCheckSession(selectionKey, {
        phase: phase,
        linksChecked: linksChecked,
        links: {
          failures: linkFailures,
          needsLogin: needsLoginLinks,
          warnings: [],
          progressMessage: progressMessage,
          progressPercent: progressPercent,
          checkedCount: stored.links ? stored.links.checkedCount : 0,
          totalCount: queue.length,
        },
      })
    }
    setShow(false)
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

  const saveTune = useCallback(function(nextTune) {
    if (!nextTune || !props.tunebook || typeof props.tunebook.saveTune !== 'function') return
    props.tunebook.saveTune(nextTune)
    setSessionTick(function(tick) { return tick + 1 })
  }, [props.tunebook])

  function clearFailureFromState(predicate) {
    setLinkFailures(function(prev) {
      const next = prev.filter(function(item) { return !predicate(item) })
      patchBulkCheckSession(selectionKey, {
        links: {
          failures: next,
          needsLogin: needsLoginLinks,
          warnings: [],
          progressMessage: progressMessage,
          progressPercent: progressPercent,
          totalCount: queue.length,
          checkedCount: queue.length,
        },
      })
      return next
    })
  }

  function clearOneBrokenLink(failure) {
    if (!failure) return
    const live = getLiveTune(failure.tuneId, { tunebook: props.tunebook })
      || selectedTunes.find(function(t) { return t && String(t.id) === String(failure.tuneId) })
    if (!live) return
    const next = removeTuneLinkAtIndex(live, failure.linkIndex)
    saveTune(next)
    clearFailureFromState(function(item) {
      return String(item.tuneId) === String(failure.tuneId) && item.linkIndex === failure.linkIndex
    })
    toast.success('Cleared broken link')
  }

  function clearBrokenLinksForTune(tuneId) {
    const live = getLiveTune(tuneId, { tunebook: props.tunebook })
      || selectedTunes.find(function(t) { return t && String(t.id) === String(tuneId) })
    if (!live) return
    const indexes = linkFailures
      .filter(function(item) { return String(item.tuneId) === String(tuneId) })
      .map(function(item) { return item.linkIndex })
    const next = removeTuneLinksAtIndexes(live, indexes)
    saveTune(next)
    clearFailureFromState(function(item) {
      return String(item.tuneId) === String(tuneId)
    })
    toast.success('Cleared broken links for tune')
  }

  function clearAllBrokenLinks() {
    if (!linkFailures.length) return
    if (!window.confirm('Clear all ' + linkFailures.length + ' broken link(s) from the selected tunes?')) {
      return
    }
    const byTune = groupLinkFailuresByTune(linkFailures)
    byTune.forEach(function(group) {
      const live = getLiveTune(group.tuneId, { tunebook: props.tunebook })
        || selectedTunes.find(function(t) { return t && String(t.id) === String(group.tuneId) })
      if (!live) return
      const indexes = group.failures.map(function(item) { return item.linkIndex })
      saveTune(removeTuneLinksAtIndexes(live, indexes))
    })
    setLinkFailures([])
    patchBulkCheckSession(selectionKey, {
      links: {
        failures: [],
        needsLogin: needsLoginLinks,
        warnings: [],
        progressMessage: 'All broken links cleared.',
        progressPercent: 100,
        totalCount: queue.length,
        checkedCount: queue.length,
      },
    })
    toast.success('Cleared all broken links')
  }

  const isLinkChecking = isBulkCheckLinkPhaseRunning(phase)
    || (isBulkCheckRunnerActive() && phase === 'running-links')

  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}
  const hasIssues = linkFailures.length > 0 || needsLoginLinks.length > 0
  const alertVariant = linkFailures.length
    ? 'warning'
    : (needsLoginLinks.length ? 'info' : 'success')

  return (
    <>
      <Button
        className="bulk-ops-action-btn"
        variant="success"
        onClick={openModal}
        aria-label="Check Links"
        title="Check playback of links on selected tunes"
      >
        {icons.check || null}
        <span className="bulk-ops-btn-label"> Check Links</span>
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
            Check Links — {props.selectedCount} tune{props.selectedCount === 1 ? '' : 's'}
          </Modal.Title>
          <div className="bulk-check-header-actions">
            {isLinkChecking ? (
              <Button variant="warning" size="sm" onClick={cancelBulkCheckRun}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="outline-primary"
                size="sm"
                onClick={function() {
                  setLinksChecked(false)
                  runLinkCheck()
                }}
                disabled={!queue.length}
              >
                Recheck
              </Button>
            )}
            {!isLinkChecking && linkFailures.length > 0 ? (
              <Button variant="danger" size="sm" onClick={clearAllBrokenLinks}>
                Clear all broken links
              </Button>
            ) : null}
          </div>
        </Modal.Header>
        <Modal.Body>
          {isLinkChecking ? (
            <SearchProgressBar
              percent={progressPercent}
              message={progressMessage}
              defaultMessage="Checking links..."
            />
          ) : null}

          {!isLinkChecking && progressMessage ? (
            <Alert variant={alertVariant} className="mb-3">
              {progressMessage}
            </Alert>
          ) : null}

          {!isLinkChecking && linksChecked && !hasIssues ? (
            <p className="text-muted">No broken links found.</p>
          ) : null}

          {!isLinkChecking && needsLoginGroups.length > 0 ? (
            <div className="bulk-check-links-section mb-4">
              <h5 className="h6 text-info">Needing Login</h5>
              <p className="text-muted small mb-2">
                These sources need you to sign in. They are not broken links.
              </p>
              {needsLoginGroups.map(function(group) {
                return (
                  <div key={'login-' + String(group.tuneId)} className="bulk-check-links-tune mb-3">
                    <div className="mb-2">
                      <strong>{group.tuneName}</strong>
                      {group.composer ? (
                        <span className="text-muted"> — {group.composer}</span>
                      ) : null}
                    </div>
                    <ul className="list-unstyled mb-0">
                      {group.failures.map(function(item) {
                        const formatted = formatLinkFailure(item)
                        return (
                          <li
                            key={'login-' + String(item.tuneId) + '-' + item.linkIndex}
                            className="bulk-check-links-needs-login d-flex align-items-start justify-content-between gap-2 py-2 border-bottom"
                          >
                            <div>
                              <div className="fw-semibold">{formatted.label}</div>
                              <div className="text-info small">{formatted.error}</div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : null}

          {!isLinkChecking && failureGroups.length > 0 ? (
            <div className="bulk-check-links-section mb-2">
              <h5 className="h6 text-danger">Broken links</h5>
            </div>
          ) : null}

          {!isLinkChecking && failureGroups.map(function(group) {
            return (
              <div key={String(group.tuneId)} className="bulk-check-links-tune mb-3">
                <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
                  <div>
                    <strong>{group.tuneName}</strong>
                    {group.composer ? (
                      <span className="text-muted"> — {group.composer}</span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={function() { clearBrokenLinksForTune(group.tuneId) }}
                  >
                    Clear broken links for tune
                  </Button>
                </div>
                <ul className="list-unstyled mb-0">
                  {group.failures.map(function(failure) {
                    const formatted = formatLinkFailure(failure)
                    return (
                      <li
                        key={String(failure.tuneId) + '-' + failure.linkIndex}
                        className="bulk-check-links-failure d-flex align-items-start justify-content-between gap-2 py-2 border-bottom"
                      >
                        <div>
                          <div className="fw-semibold">{formatted.label}</div>
                          <div className="text-danger small">{formatted.error}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={function() { clearOneBrokenLink(failure) }}
                        >
                          Clear link
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </Modal.Body>
      </Modal>
    </>
  )
}
