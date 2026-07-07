import { useState } from 'react'
import { Button } from 'react-bootstrap'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import BulkBackgroundResearchQueueModal from './BulkBackgroundResearchQueueModal'

export default function BulkBackgroundResearchQueueIndicator({ tunebook }) {
  const queue = useBulkBackgroundResearchQueue()
  const [show, setShow] = useState(false)

  if (queue.pendingCount <= 0 && queue.state.jobs.length === 0) {
    return null
  }

  const label = queue.pendingCount > 0
    ? ('Research (' + queue.pendingCount + ')')
    : 'Research'

  return (
    <>
      <Button
        variant="outline-primary"
        size="sm"
        className="bulk-bg-queue-indicator"
        onClick={function() { setShow(true) }}
        title="Open background research queue"
      >
        {tunebook.icons.waiting} {label}
      </Button>
      <BulkBackgroundResearchQueueModal
        show={show}
        onHide={function() { setShow(false) }}
        tunebook={tunebook}
      />
    </>
  )
}
