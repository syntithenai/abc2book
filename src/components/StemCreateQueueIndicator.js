import { useState } from 'react'
import { Button } from 'react-bootstrap'
import useStemCreateQueue from '../useStemCreateQueue'
import StemCreateQueueModal from './StemCreateQueueModal'

export default function StemCreateQueueIndicator({ tunebook }) {
  const queue = useStemCreateQueue()
  const [show, setShow] = useState(false)

  if (queue.pendingCount <= 0 && queue.state.jobs.length === 0) {
    return null
  }

  const label = queue.pendingCount > 0
    ? ('Stems (' + queue.pendingCount + ')')
    : 'Stems'

  return (
    <>
      <Button
        variant="outline-primary"
        size="sm"
        className="bulk-bg-queue-indicator"
        onClick={function() { setShow(true) }}
        title="Open stem creation queue"
      >
        {tunebook.icons.waiting} {label}
      </Button>
      <StemCreateQueueModal
        show={show}
        onHide={function() { setShow(false) }}
        tunebook={tunebook}
      />
    </>
  )
}
