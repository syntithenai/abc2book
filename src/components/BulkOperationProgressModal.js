import { Modal } from 'react-bootstrap'
import SearchProgressBar from './SearchProgressBar'

export default function BulkOperationProgressModal({
  show,
  title,
  progress,
}) {
  const current = progress && typeof progress.current === 'number' ? progress.current : 0
  const total = progress && typeof progress.total === 'number' ? progress.total : 0
  const percent = progress && typeof progress.percent === 'number'
    ? progress.percent
    : (total > 0 ? Math.round((current / total) * 100) : 0)
  const message = progress && progress.message ? progress.message : 'Working…'

  return (
    <Modal
      show={!!show}
      backdrop="static"
      keyboard={false}
      centered
      data-testid="bulk-operation-progress-modal"
    >
      <Modal.Header>
        <Modal.Title>{title || 'Working…'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">{message}</p>
        <SearchProgressBar
          visible={true}
          percent={percent}
          message={total > 0 ? (current + ' of ' + total) : message}
          defaultMessage="Working…"
        />
      </Modal.Body>
    </Modal>
  )
}
