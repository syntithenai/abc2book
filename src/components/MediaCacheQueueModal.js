import { useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import useMediaCacheQueue from '../useMediaCacheQueue'
import JobQueueTabPanel from './backgroundJobs/JobQueueTabPanel'
import { fifoStatusVariant } from './backgroundJobs/jobQueueUtils'

export function MediaCacheQueueModal({
  show,
  onHide,
  tunebook,
  title,
}) {
  const queue = useMediaCacheQueue()

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      scrollable
      className="media-cache-queue-modal"
      backdropClassName="media-cache-queue-backdrop"
      dialogClassName="media-cache-queue-modal-dialog"
      contentClassName="media-cache-queue-modal-content"
    >
      <Modal.Header closeButton>
        <Modal.Title>{title || 'Media download queue'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <JobQueueTabPanel
          jobs={queue.state.jobs}
          running={queue.state.running}
          paused={queue.state.paused}
          onStart={queue.start}
          onStop={queue.stop}
          onClearFinished={queue.clearFinished}
          onCancelAll={queue.cancelAll}
          onCancelJob={queue.cancelJob}
          classPrefix="media-cache"
          renderJobTitle={function(job) {
            return (
              <>
                <strong>{job.tuneName || 'Untitled'}</strong>
                {job.linkTitle ? <span className="text-muted"> — {job.linkTitle}</span> : null}
              </>
            )
          }}
          renderJobMeta={function(job, QueueBadge) {
            return (
              <>
                <QueueBadge variant={job.type === 'download' ? 'info' : 'cache'} classPrefix="media-cache">
                  {job.type === 'download' ? 'Download' : 'Cache'}
                </QueueBadge>
                {job.srcType === 'youtube' ? (
                  <QueueBadge variant="youtube" classPrefix="media-cache">YouTube</QueueBadge>
                ) : null}
                <QueueBadge variant={fifoStatusVariant(job.status)} classPrefix="media-cache">
                  {job.status}
                </QueueBadge>
              </>
            )
          }}
          renderJobExtra={function(job) {
            return job.error ? (
              <div className="text-danger media-cache-queue-item-error">{job.error}</div>
            ) : null
          }}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

export function MediaCacheQueueTriggerButton({
  tunebook,
  label,
  className,
  variant,
  onClick,
  pendingCount,
}) {
  return (
    <Button
      variant={variant || 'outline-primary'}
      className={className || 'bulk-ops-action-btn'}
      onClick={onClick}
      aria-label={label || 'Cache'}
      title={label || 'Cache'}
    >
      {tunebook.icons.save}
      <span className="bulk-ops-btn-label">
        {' '}{label || 'Cache'}
        {pendingCount > 0 ? (' (' + pendingCount + ')') : ''}
      </span>
    </Button>
  )
}

export function useMediaCacheQueueModal() {
  const [show, setShow] = useState(false)
  const queue = useMediaCacheQueue()

  function openQueueModal() {
    setShow(true)
  }

  function closeQueueModal() {
    setShow(false)
  }

  return {
    show: show,
    openQueueModal: openQueueModal,
    closeQueueModal: closeQueueModal,
    queue: queue,
    modalProps: {
      show: show,
      onHide: closeQueueModal,
      queue: queue,
    },
  }
}

export default MediaCacheQueueModal
