import { useMemo } from 'react'
import { Button, ListGroup } from 'react-bootstrap'
import useTuneFieldLookupQueue from '../../useTuneFieldLookupQueue'
import { isMediaAnalysisLookupJob } from '../../mediaAnalysisSuggestions'
import { cancelTrackedJob, useActiveTrackedJobs } from '../../longRunningJobRegistry'

function statusLabel(status) {
  if (status === 'awaiting') return 'awaiting review'
  if (status === 'running') return 'running'
  if (status === 'pending') return 'pending'
  if (status === 'error') return 'error'
  return status || 'unknown'
}

function statusBadgeClass(status) {
  if (status === 'awaiting') return 'background-jobs-queue-badge-warning'
  if (status === 'running') return 'background-jobs-queue-badge-primary'
  if (status === 'error') return 'background-jobs-queue-badge-danger'
  return 'background-jobs-queue-badge-secondary'
}

export default function ActiveSearchesTabPanel() {
  const queue = useTuneFieldLookupQueue()
  const trackedJobs = useActiveTrackedJobs()
  const manualTrackedJobs = useMemo(function() {
    return trackedJobs.filter(function(job) {
      return !job.id || job.id.indexOf('stem-lrj-') !== 0
    })
  }, [trackedJobs])
  const fieldJobs = (queue.state.jobs || []).filter(function(job) {
    if (isMediaAnalysisLookupJob(job)) return false
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
      || job.status === 'error'
  })
  const jobs = fieldJobs
  const activeCount = fieldJobs.length + manualTrackedJobs.length
  const awaitingCount = fieldJobs.filter(function(job) { return job.status === 'awaiting' }).length
  const errorCount = fieldJobs.filter(function(job) { return job.status === 'error' }).length
  const canClearFinished = queue.finishedCount > 0 || awaitingCount > 0 || errorCount > 0

  return (
    <>
      <p className="text-muted settings-background-jobs-tab-note">
        Lyrics, chords, artist, notation, and link searches keep running while you browse.
        When results need a choice they stay here as awaiting review; open Review from the
        top menu (or the toast) to accept suggestions, or use Choose next to the field in
        the tune editor. Clear finished also removes awaiting review entries.
      </p>
      <div className="background-jobs-queue-toolbar">
        <span className="background-jobs-queue-summary">
          {activeCount} active search{activeCount === 1 ? '' : 'es'}
          {awaitingCount > 0 ? (' · ' + awaitingCount + ' awaiting') : ''}
          {errorCount > 0 ? (' · ' + errorCount + ' failed') : ''}
        </span>
        <div className="background-jobs-queue-toolbar-actions">
          <Button
            variant="outline-secondary"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={!canClearFinished}
            onClick={queue.clearFinished}
          >
            Clear finished
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="background-jobs-queue-toolbar-btn"
            disabled={activeCount === 0}
            onClick={function() {
              queue.cancelAll()
              manualTrackedJobs.forEach(function(job) {
                cancelTrackedJob(job.id)
              })
            }}
          >
            Cancel all
          </Button>
        </div>
      </div>
      {activeCount === 0 ? (
        <p className="text-muted">No active lyrics, chords, artist, notation, or link searches.</p>
      ) : (
        <ListGroup className="background-jobs-queue-list">
          {manualTrackedJobs.map(function(job) {
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.label || 'Search'}</strong>
                  </div>
                  <div className="d-flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      className="background-jobs-queue-item-cancel"
                      onClick={function() { cancelTrackedJob(job.id) }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                <div className="background-jobs-queue-item-meta">
                  <span className="background-jobs-queue-badge background-jobs-queue-badge-primary">
                    running
                  </span>
                </div>
              </ListGroup.Item>
            )
          })}
          {jobs.map(function(job) {
            return (
              <ListGroup.Item key={job.id} className="background-jobs-queue-item">
                <div className="background-jobs-queue-item-header">
                  <div className="background-jobs-queue-item-title">
                    <strong>{job.label || 'Search'}</strong>
                    {job.tuneName ? <span className="text-muted"> — {job.tuneName}</span> : null}
                  </div>
                  <div className="d-flex gap-2">
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
