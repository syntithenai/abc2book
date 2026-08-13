import { useSyncExternalStore } from 'react'
import { Badge, Button, ListGroup, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import {
  cancelJob,
  cancelAllJobs,
  clearFinishedJobs,
  getState,
  subscribe,
} from '../../chordReadinessCleanupQueue'
import { CHORD_READINESS_STATUSES } from '../../tuneChordReadinessAudit'
import { buildSearchFilterParams } from '../../searchFilterParams'

function statusVariant(status) {
  if (status === 'running' || status === 'pending') return 'primary'
  if (status === 'error') return 'danger'
  if (status === 'done') return 'success'
  return 'secondary'
}

function actionLabel(action) {
  if (action === 'tagOnly') return 'Tag only'
  if (action === 'apply') return 'Apply fixes'
  return 'Audit'
}

function formatPercent(rate) {
  if (!Number.isFinite(rate)) return '0%'
  return (rate * 100).toFixed(1) + '%'
}

function chordStatusVariant(status) {
  if (status === CHORD_READINESS_STATUSES.READY) return 'success'
  if (status === CHORD_READINESS_STATUSES.INSTRUMENTAL) return 'secondary'
  return 'warning'
}

function tuneSearchHref(tag, bookName) {
  const params = buildSearchFilterParams({
    currentTuneBook: bookName || '',
    tagFilter: [tag],
  })
  const query = Object.keys(params)
    .filter(function(key) { return params[key] })
    .map(function(key) { return key + '=' + encodeURIComponent(params[key]) })
    .join('&')
  return '/tunes' + (query ? '?' + query : '')
}

export default function ChordReadinessCleanupTabPanel() {
  const state = useSyncExternalStore(subscribe, getState, getState)
  const jobs = state.jobs || []
  const activeCount = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length
  const currentJob = jobs.find(function(job) { return job.id === state.currentJobId })
  const summary = state.lastAuditReport && state.lastAuditReport.summary
    ? state.lastAuditReport.summary
    : null
  const auditBook = (state.jobs || []).find(function(job) {
    return job.action === 'audit' && job.status === 'done' && job.auditReport
  })
  const tagSearchBook = auditBook && auditBook.book ? auditBook.book : null

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} running · {jobs.length} total
          {state.running && currentJob ? (' · ' + (currentJob.message || actionLabel(currentJob.action))) : ''}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="warning"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllJobs}
          >
            Cancel all
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            onClick={clearFinishedJobs}
          >
            Clear finished
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="text-muted">No chord readiness jobs. Start audit, tagging, or fixes from Settings → Cleanup.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list mb-3">
          {jobs.map(function(job) {
            const active = job.status === 'pending' || job.status === 'running'
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{actionLabel(job.action)}</strong>
                    <span className="text-muted">
                      {job.book ? (' · book: ' + job.book) : ' · all tunes'}
                      {job.action !== 'audit' ? (' · batch ' + job.limit + (job.dryRun ? ' · dry run' : '')) : ''}
                    </span>
                  </div>
                  {active ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { cancelJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + statusVariant(job.status)}>
                    {job.status}
                  </span>
                  {active && job.progress > 0 ? (
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
                {job.status === 'done' && job.batchResult ? (
                  <div className="text-muted background-jobs-queue-item-message">
                    Processed {job.batchResult.processed} of {job.batchResult.totalCandidates}
                    {job.batchResult.remaining > 0 ? (' · ' + job.batchResult.remaining + ' remaining') : ''}
                  </div>
                ) : null}
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}

      {summary ? (
        <div className="background-jobs-chord-audit-summary">
          <h4 className="h6">Latest audit summary</h4>
          <dl className="row mb-3">
            <dt className="col-sm-4">Total songs</dt>
            <dd className="col-sm-8">{summary.totalTunes}</dd>
            <dt className="col-sm-4">Ready</dt>
            <dd className="col-sm-8">{summary.readyCount} ({formatPercent(summary.readyRate)})</dd>
            <dt className="col-sm-4">Display ready</dt>
            <dd className="col-sm-8">
              {(summary.displayReadyCount != null ? summary.displayReadyCount : 0)}
              {' '}({formatPercent(summary.displayReadyRate)})
            </dd>
            <dt className="col-sm-4">Needs work</dt>
            <dd className="col-sm-8">{summary.needsWorkCount}</dd>
          </dl>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {Object.keys(summary.byStatus || {}).sort().map(function(status) {
              return (
                <Badge
                  key={status}
                  bg={chordStatusVariant(status)}
                  text={status === CHORD_READINESS_STATUSES.READY ? 'dark' : undefined}
                >
                  {status}: {summary.byStatus[status]}
                </Badge>
              )
            })}
          </div>
          {Object.keys(summary.byRenderMode || {}).length > 0 ? (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {Object.keys(summary.byRenderMode).sort().map(function(mode) {
                return (
                  <Badge key={mode} bg="info" text="dark">
                    {mode}: {summary.byRenderMode[mode]}
                  </Badge>
                )
              })}
            </div>
          ) : null}
          {Object.keys(summary.byTag || {}).length > 0 ? (
            <Table responsive size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(summary.byTag).sort().map(function(tag) {
                  return (
                    <tr key={tag}>
                      <td>
                        <Link to={tuneSearchHref(tag, tagSearchBook)}>{tag}</Link>
                      </td>
                      <td>{summary.byTag[tag]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
