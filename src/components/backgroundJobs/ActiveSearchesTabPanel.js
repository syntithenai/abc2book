import { Button, ListGroup } from 'react-bootstrap'
import {
  useActiveTrackedJobs,
  cancelTrackedJob,
  cancelAllTrackedJobs,
} from '../../longRunningJobRegistry'

export default function ActiveSearchesTabPanel() {
  const jobs = useActiveTrackedJobs()

  return (
    <>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {jobs.length} active search{jobs.length === 1 ? '' : 'es'}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={jobs.length === 0}
            onClick={cancelAllTrackedJobs}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No active chord, lyrics, notation, or background searches.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.label || 'Search'}</strong>
                  </div>
                  {job.onCancel ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { cancelTrackedJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className="background-jobs-queue-badge background-jobs-queue-badge-primary">
                    running
                  </span>
                </div>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      )}
    </>
  )
}
