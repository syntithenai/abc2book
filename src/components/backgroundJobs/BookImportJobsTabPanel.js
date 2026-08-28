import { Button, ListGroup, ProgressBar } from 'react-bootstrap'
import useAllBookImportJobs from '../../useAllBookImportJobs'
import {
  cancelBookImportJob,
  cancelAllActiveBookImportJobs,
  clearInactiveBookImportJobs,
} from '../../bookImportJobStore'
import { requestOpenBookImportReview } from '../../bookImportJobToast'

function statusLabel(job) {
  if (!job) return 'unknown'
  if (job.status === 'pending' || job.status === 'running') return job.status
  if (job.status === 'ready') return 'ready for review'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'cancelled') return 'cancelled'
  return job.status
}

function statusBadgeClass(job) {
  if (!job) return 'secondary'
  if (job.status === 'pending' || job.status === 'running') return 'primary'
  if (job.status === 'ready') return 'success'
  if (job.status === 'failed') return 'danger'
  return 'secondary'
}

function progressPct(job) {
  if (!job) return 0
  if (job.status === 'ready') return 100
  const total = Math.max(1, Number(job.total) || 1)
  const current = Number(job.current) || 0
  return Math.min(99, Math.round(100 * current / total))
}

export default function BookImportJobsTabPanel() {
  const jobs = useAllBookImportJobs()
  const activeCount = jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} running · {jobs.length} total
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            onClick={clearInactiveBookImportJobs}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllActiveBookImportJobs}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No import scans / PDF jobs.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const isActive = job.status === 'pending' || job.status === 'running'
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.setName || 'Review set'}</strong>
                    {job.book ? (
                      <span className="text-muted"> — book: {job.book}</span>
                    ) : null}
                    {job.fileCount ? (
                      <span className="text-muted"> · {job.fileCount} file{job.fileCount === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                  <div className="d-flex gap-1 flex-wrap">
                    {job.status === 'ready' ? (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={function() { requestOpenBookImportReview(job.setId) }}
                      >
                        Open review
                      </Button>
                    ) : null}
                    {isActive ? (
                      <Button
                        variant="danger"
                        size="sm"
                        className="background-jobs-queue-item-cancel"
                        onClick={function() { cancelBookImportJob(job.id) }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="small">
                  <span className={'badge bg-' + statusBadgeClass(job)}>{statusLabel(job)}</span>
                  {job.message ? (
                    <span className="text-muted ms-2">{job.message}</span>
                  ) : null}
                </div>
                {isActive ? (
                  <ProgressBar
                    className="mt-2"
                    now={progressPct(job)}
                    label={progressPct(job) + '%'}
                    animated
                  />
                ) : null}
                {job.error ? (
                  <div className="small text-danger mt-1">{job.error}</div>
                ) : null}
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}
    </>
  )
}
