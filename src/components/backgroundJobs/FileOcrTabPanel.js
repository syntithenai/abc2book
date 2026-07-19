import { Button, ListGroup } from 'react-bootstrap'
import useAllFileOcrJobs from '../../useAllFileOcrJobs'
import {
  cancelFileOcrJob,
  cancelAllActiveFileOcrJobs,
  clearInactiveFileOcrJobs,
} from '../../fileOcrJobs'

function statusLabel(job) {
  if (!job) return 'unknown'
  if (job.status === 'pending' || job.status === 'running') return job.status
  if (job.status === 'ready') return 'ready for review'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'cancelled') return 'cancelled'
  if (job.status === 'dismissed') return 'dismissed'
  return job.status
}

function statusBadgeClass(job) {
  if (!job) return 'secondary'
  if (job.status === 'pending' || job.status === 'running') return 'primary'
  if (job.status === 'ready') return 'success'
  if (job.status === 'failed') return 'danger'
  return 'secondary'
}

export default function FileOcrTabPanel() {
  const jobs = useAllFileOcrJobs()
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
            onClick={clearInactiveFileOcrJobs}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllActiveFileOcrJobs}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No file OCR jobs.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const isActive = job.status === 'pending' || job.status === 'running'
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.tuneName || 'Untitled'}</strong>
                    {job.fileName ? (
                      <span className="text-muted"> — {job.fileName}</span>
                    ) : null}
                  </div>
                  {isActive ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { cancelFileOcrJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge background-jobs-queue-badge-' + statusBadgeClass(job)}>
                    {statusLabel(job)}
                  </span>
                  {isActive && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                </div>
                {job.message ? (
                  <div className="text-muted background-jobs-queue-item-message">{job.message}</div>
                ) : null}
                {job.error && job.status === 'failed' ? (
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
