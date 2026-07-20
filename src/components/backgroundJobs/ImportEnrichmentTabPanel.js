import { useMemo, useSyncExternalStore } from 'react'
import { Button, ListGroup } from 'react-bootstrap'
import {
  getImportReviewEnrichmentSnapshot,
  subscribeImportReviewEnrichment,
} from '../../importReviewEnrichmentBridge'
import { enrichmentSummary } from '../../importReviewEnrichmentQueue'
import {
  getImportReviewSessionRevision,
  hasActiveImportReviewSession,
  isImportReviewUiVisible,
  openImportReviewFromToast,
  subscribeImportReviewSession,
} from '../../importReviewSessionStore'

function getImportEnrichmentRevision() {
  const snapshot = getImportReviewEnrichmentSnapshot()
  if (!snapshot.active) return ''
  return snapshot.jobs.map(function(job) {
    return [
      job.id,
      job.status,
      job.progress,
      job.message,
      job.error,
    ].join(':')
  }).join('|')
}

function useImportEnrichmentBridge() {
  const revision = useSyncExternalStore(
    subscribeImportReviewEnrichment,
    getImportEnrichmentRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getImportReviewEnrichmentSnapshot()
  }, [revision])
}

function statusVariant(status) {
  if (status === 'done') return 'success'
  if (status === 'running') return 'primary'
  if (status === 'error') return 'danger'
  if (status === 'skipped') return 'secondary'
  if (status === 'awaiting') return 'warning'
  return 'warning'
}

export default function ImportEnrichmentTabPanel() {
  const bridge = useImportEnrichmentBridge()
  const summary = enrichmentSummary(bridge.jobs)
  const activeCount = summary.awaiting + summary.pending + summary.running
  const sessionRevision = useSyncExternalStore(
    subscribeImportReviewSession,
    getImportReviewSessionRevision,
    function() { return '' }
  )
  void sessionRevision
  const canContinueReview = hasActiveImportReviewSession() && !isImportReviewUiVisible()

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {summary.awaiting} awaiting · {summary.pending} pending · {summary.running} running
          {' · '}{summary.done} done · {summary.skipped} skipped
          {summary.error > 0 ? (' · ' + summary.error + ' failed') : ''}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          {canContinueReview ? (
            <Button
              variant="primary"
              size="sm"
              className="background-jobs-queue-toolbar-btn"
              data-testid="bg-jobs-continue-import-review"
              onClick={function() {
                openImportReviewFromToast()
              }}
            >
              Continue import review
            </Button>
          ) : null}
          <Button
            variant="warning"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!bridge.onSkipAll || summary.pending === 0}
            onClick={function() {
              if (bridge.onSkipAll) bridge.onSkipAll()
            }}
          >
            Skip all remaining
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!bridge.onClear}
            onClick={function() {
              if (bridge.onClear) bridge.onClear()
            }}
          >
            Clear queue
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!bridge.onSkipAll || activeCount === 0}
            onClick={function() {
              if (bridge.onSkipAll) bridge.onSkipAll()
            }}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {!bridge.active && !hasActiveImportReviewSession() ? (
        <p className="text-muted">No import review session is open.</p>
      ) : !bridge.active ? (
        <p className="text-muted">Import review is paused. Use Continue import review to resume.</p>
      ) : bridge.jobs.length === 0 ? (
        <p className="text-muted">No enrichment jobs in the current import session.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {bridge.jobs.map(function(job) {
            const canCancel = job.status === 'pending'
              || job.status === 'running'
              || job.status === 'awaiting'
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.title || 'Untitled'}</strong>
                    {job.artist ? <span className="text-muted"> — {job.artist}</span> : null}
                  </div>
                  {canCancel && bridge.onSkipJob ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { bridge.onSkipJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + statusVariant(job.status)}>
                    {job.status}
                  </span>
                  {job.status === 'running' && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                </div>
                {job.message ? (
                  <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                ) : null}
                {job.error ? (
                  <div className="text-danger background-jobs-queue-item-error">{job.error}</div>
                ) : null}
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}
    </>
  )
}
