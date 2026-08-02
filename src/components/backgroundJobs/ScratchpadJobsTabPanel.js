import { Button, ListGroup } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import useAllScratchpadBackgroundJobs from '../../useAllScratchpadBackgroundJobs'
import {
  cancelScratchpadBackgroundJob,
  cancelAllActiveScratchpadBackgroundJobs,
  clearInactiveScratchpadBackgroundJobs,
} from '../../scratchpadBackgroundJobs'
import { scratchpadItemPath } from '../../scratchpadExportToast'

function statusLabel(job) {
  if (!job) return 'unknown'
  if (job.status === 'pending' || job.status === 'running') return job.status
  if (job.status === 'done') return 'done'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'cancelled') return 'cancelled'
  return job.status
}

function statusBadgeClass(job) {
  if (!job) return 'secondary'
  if (job.status === 'pending' || job.status === 'running') return 'primary'
  if (job.status === 'done') return 'success'
  if (job.status === 'failed') return 'danger'
  return 'secondary'
}

function jobTypeLabel(job) {
  if (!job) return 'Job'
  if (job.type === 'transcribe') return 'Transcribe'
  return job.type || 'Job'
}

export default function ScratchpadJobsTabPanel() {
  const navigate = useNavigate()
  const jobs = useAllScratchpadBackgroundJobs()
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
            onClick={clearInactiveScratchpadBackgroundJobs}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={cancelAllActiveScratchpadBackgroundJobs}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No scratchpad background jobs.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const isActive = job.status === 'pending' || job.status === 'running'
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.sourceTitle || 'Untitled'}</strong>
                  </div>
                  <div className="d-flex gap-2">
                    {job.status === 'done' && job.createdItemId ? (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="background-jobs-queue-item-cancel"
                        onClick={function() {
                          navigate(scratchpadItemPath(job.createdItemId))
                        }}
                      >
                        Open result
                      </Button>
                    ) : null}
                    {isActive ? (
                      <Button
                        variant="danger"
                        size="sm"
                        className="background-jobs-queue-item-cancel"
                        onClick={function() { cancelScratchpadBackgroundJob(job.id) }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                    {jobTypeLabel(job)}
                  </span>
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
