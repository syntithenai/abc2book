import { Button, Modal } from 'react-bootstrap'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import JobQueueTabPanel from './backgroundJobs/JobQueueTabPanel'
import { fifoStatusVariant } from './backgroundJobs/jobQueueUtils'

function statusLabel(job) {
  if (job.status === 'awaiting') return 'awaiting review'
  return job.status
}

export default function TuneFieldLookupQueueModal({
  show,
  onHide,
  tunebook,
  title,
}) {
  const queue = useTuneFieldLookupQueue()
  const summary = queue.state.jobs.reduce(function(acc, job) {
    if (job.status === 'error') acc.errors += 1
    return acc
  }, { errors: 0 })
  const currentJob = queue.state.jobs.find(function(job) {
    return job.id === queue.state.currentJobId
  })

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      scrollable
      className="bulk-bg-queue-modal"
      backdropClassName="bulk-bg-queue-backdrop"
      dialogClassName="bulk-bg-queue-modal-dialog"
      contentClassName="bulk-bg-queue-modal-content"
    >
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Field lookup queue'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <JobQueueTabPanel
          jobs={queue.state.jobs}
          running={queue.state.running}
          paused={queue.state.paused}
          overallProgress={queue.overallProgress}
          finishedCount={queue.finishedCount}
          totalCount={queue.totalCount}
          currentJobMessage={currentJob && currentJob.message ? currentJob.message : ''}
          progressHasErrors={summary.errors > 0}
          onStart={queue.start}
          onStop={queue.stop}
          onClearFinished={queue.clearFinished}
          onCancelAll={queue.cancelAll}
          onCancelJob={queue.cancelJob}
          classPrefix="bulk-bg"
          renderJobTitle={function(job) {
            return (
              <>
                <strong>{job.tuneName || job.title || 'Untitled'}</strong>
                {job.kind ? <span className="text-muted"> — {job.kind}</span> : null}
              </>
            )
          }}
          renderJobMeta={function(job, QueueBadge) {
            return (
              <>
                <QueueBadge variant={fifoStatusVariant(job.status)} classPrefix="bulk-bg">
                  {statusLabel(job)}
                </QueueBadge>
                {job.status === 'running' && job.progress > 0 ? (
                  <QueueBadge variant="info" classPrefix="bulk-bg">{job.progress + '%'}</QueueBadge>
                ) : null}
              </>
            )
          }}
          renderJobExtra={function(job) {
            return (
              <>
                {job.message ? (
                  <div className="text-muted bulk-bg-queue-item-message">{job.message}</div>
                ) : null}
                {job.error ? (
                  <div className="text-danger bulk-bg-queue-item-error">{job.error}</div>
                ) : null}
              </>
            )
          }}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
