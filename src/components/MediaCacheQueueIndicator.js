import { Button } from 'react-bootstrap'
import useMediaCacheQueue from '../useMediaCacheQueue'
import MediaCacheQueueModal from './MediaCacheQueueModal'
import { useState } from 'react'

export default function MediaCacheQueueIndicator({ tunebook }) {
  const queue = useMediaCacheQueue()
  const [show, setShow] = useState(false)

  if (queue.pendingCount <= 0) {
    return null
  }

  return (
    <>
      <Button
        variant="outline-primary"
        size="sm"
        className="media-cache-queue-indicator"
        onClick={function() { setShow(true) }}
        title="Open media download queue"
      >
        {tunebook.icons.waiting} Queue ({queue.pendingCount})
      </Button>
      <MediaCacheQueueModal
        show={show}
        onHide={function() { setShow(false) }}
        tunebook={tunebook}
      />
    </>
  )
}
