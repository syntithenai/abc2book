import { Button, ListGroup } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import useTuneFieldLookupQueue from '../../useTuneFieldLookupQueue'
import { dismissFieldLookup } from '../../tuneFieldLookupQueue'

function statusLabel(status) {
  if (status === 'awaiting') return 'awaiting review'
  if (status === 'running') return 'running'
  if (status === 'pending') return 'pending'
  return status || 'unknown'
}

function statusBadgeClass(status) {
  if (status === 'awaiting') return 'background-jobs-queue-badge-warning'
  if (status === 'running') return 'background-jobs-queue-badge-primary'
  return 'background-jobs-queue-badge-secondary'
}

export default function ActiveSearchesTabPanel() {
  const queue = useTuneFieldLookupQueue()
  const jobs = (queue.state.jobs || []).filter(function(job) {
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
  })

  return (
    <>
      <p className="text-muted settings-background-jobs-tab-note">
        Lyrics, chords, artist, notation, and link searches keep running while you browse.
        When results need a choice they stay here as awaiting review; open the tune editor
        and use the Choose button next to the field.
      </p>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {jobs.length} active search{jobs.length === 1 ? '' : 'es'}
          {queue.awaitingCount > 0 ? (' · ' + queue.awaitingCount + ' awaiting') : ''}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="outline-secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={queue.finishedCount === 0}
            onClick={queue.clearFinished}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={jobs.length === 0}
            onClick={queue.cancelAll}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="text-muted">No active lyrics, chords, artist, notation, or link searches.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {jobs.map(function(job) {
            const tuneLink = job.tuneId ? ('/editor/' + encodeURIComponent(job.tuneId)) : null
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.label || 'Search'}</strong>
                    {job.tuneName ? <span className="text-muted"> — {job.tuneName}</span> : null}
                  </div>
                  <div className="d-flex gap-2">
                    {job.status === 'awaiting' && tuneLink ? (
                      <Button
                        as={Link}
                        to={tuneLink}
                        variant="outline-primary"
                        size="sm"
                      >
                        Review
                      </Button>
                    ) : null}
                    {job.status === 'awaiting' ? (
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={function() { dismissFieldLookup(job.id) }}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { queue.cancelJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className={'background-jobs-queue-badge ' + statusBadgeClass(job.status)}>
                    {statusLabel(job.status)}
                  </span>
                  {job.kind ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.kind}
                    </span>
                  ) : null}
                  {job.status === 'running' && job.progress > 0 ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-info">
                      {job.progress + '%'}
                    </span>
                  ) : null}
                  {job.status === 'awaiting' && Array.isArray(job.candidates) ? (
                    <span className="background-jobs-queue-badge background-jobs-queue-badge-warning">
                      {job.candidates.length} result{job.candidates.length === 1 ? '' : 's'}
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
