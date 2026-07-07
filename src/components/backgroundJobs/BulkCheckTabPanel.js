import { useMemo, useSyncExternalStore } from 'react'
import { Button } from 'react-bootstrap'
import {
  getActiveBulkCheckSession,
  subscribeBulkCheckSession,
  clearBulkCheckSession,
  isBulkCheckPhaseRunning,
} from '../../bulkCheckSessionStore'
import {
  cancelBulkCheckRun,
  isBulkCheckRunnerActive,
  subscribeBulkCheckRunner,
} from '../../bulkCheckRunner'

function getBulkCheckSessionRevision() {
  const session = getActiveBulkCheckSession()
  if (!session) return ''
  const links = session.links || {}
  return [
    session.phase,
    links.checkedCount || 0,
    links.totalCount || 0,
    links.progressMessage || '',
    links.progressPercent || 0,
    session.completeness && session.completeness.issues
      ? session.completeness.issues.length
      : 0,
    session.abcCorrectness && session.abcCorrectness.issues
      ? session.abcCorrectness.issues.length
      : 0,
  ].join('|')
}

function useBulkCheckState() {
  const sessionRevision = useSyncExternalStore(
    subscribeBulkCheckSession,
    getBulkCheckSessionRevision,
    function() { return '' }
  )
  const session = useMemo(function() {
    return getActiveBulkCheckSession()
  }, [sessionRevision])
  const runnerActive = useSyncExternalStore(
    subscribeBulkCheckRunner,
    isBulkCheckRunnerActive,
    function() { return false }
  )
  return { session: session, runnerActive: runnerActive }
}

export default function BulkCheckTabPanel() {
  const { session, runnerActive } = useBulkCheckState()
  const isRunning = runnerActive || (session && isBulkCheckPhaseRunning(session.phase))
  const links = session && session.links ? session.links : null

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {session ? ('Phase: ' + session.phase) : 'No bulk check session'}
          {links && links.totalCount > 0
            ? (' · ' + links.checkedCount + ' / ' + links.totalCount + ' links checked')
            : ''}
          {session && session.completeness && session.completeness.issues
            ? (' · ' + session.completeness.issues.length + ' completeness issues')
            : ''}
          {session && session.abcCorrectness && session.abcCorrectness.issues
            ? (' · ' + session.abcCorrectness.issues.length + ' ABC issues')
            : ''}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="warning"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!isRunning}
            onClick={cancelBulkCheckRun}
          >
            Cancel run
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!session}
            onClick={clearBulkCheckSession}
          >
            Clear session
          </Button>
        </div>
      </div>
      {!session ? (
        <p className="text-muted">No bulk check session. Start a bulk check from the tune list.</p>
      ) : (
        <div className="background-jobs-bulk-check-detail">
          {links && links.progressMessage ? (
            <p className="text-muted">{links.progressMessage}</p>
          ) : null}
          {session.phase === 'static-done' || session.phase === 'links-done' ? (
            <p className="text-muted">Last bulk check finished{session.linksChecked ? ' (links checked)' : ''}.</p>
          ) : null}
          {session.phase === 'cancelled' ? (
            <p className="text-muted">Last bulk check was cancelled.</p>
          ) : null}
        </div>
      )}
    </>
  )
}
