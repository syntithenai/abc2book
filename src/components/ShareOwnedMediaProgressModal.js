import { Alert, Button, Modal } from 'react-bootstrap'
import SearchProgressBar from './SearchProgressBar'

function eventVariant(type) {
  if (type === 'error') return 'danger'
  if (type === 'warning') return 'warning'
  if (type === 'success') return 'success'
  return 'secondary'
}

export default function ShareOwnedMediaProgressModal(props) {
  const phase = props.phase || 'working'
  const work = props.workSummary || {}
  const progress = props.progress || {}
  const events = Array.isArray(props.events) ? props.events : []
  const current = Number(progress.current) || 0
  const total = Number(progress.total) || 0
  const percent = total > 0 ? Math.round((current / total) * 100) : (phase === 'working' ? 5 : 0)
  const message = progress.message || 'Preparing audio for sharing…'
  const modalStyle = props.dialogZIndex ? { zIndex: props.dialogZIndex } : undefined
  const backdropClassName = props.dialogZIndex ? 'share-owned-media-backdrop-elevated' : undefined

  if (phase === 'warning') {
    const uploadCount = work.needsUpload || 0
    const publicCount = work.needsPublic || 0
    return (
      <Modal
        show={!!props.show}
        onHide={props.onCancel}
        backdrop="static"
        keyboard={false}
        centered
        style={modalStyle}
        backdropClassName={backdropClassName}
        data-testid="share-owned-media-warning-modal"
      >
        <Modal.Header closeButton={!!props.onCancel}>
          <Modal.Title>Upload audio for sharing?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="py-2">
            This share includes tunes with locally attached audio. Recipients can only play that audio after it is uploaded to Google Drive and made publicly readable.
          </Alert>
          <p className="mb-2">
            {uploadCount > 0
              ? uploadCount + ' file' + (uploadCount === 1 ? '' : 's') + ' will be uploaded to Google Drive.'
              : 'All attached audio is already on Google Drive.'}
            {publicCount > 0
              ? ' ' + publicCount + ' file' + (publicCount === 1 ? '' : 's') + ' will be shared publicly.'
              : ''}
          </p>
          {work.displayItems && work.displayItems.length > 0 ? (
            <ul className="small text-muted mb-0">
              {work.displayItems.slice(0, 8).map(function(item, idx) {
                return (
                  <li key={item.tuneName + '-' + item.label + '-' + idx}>
                    {item.tuneName} — {item.label}
                  </li>
                )
              })}
              {work.displayItems.length > 8 ? (
                <li>…and {work.displayItems.length - 8} more</li>
              ) : null}
            </ul>
          ) : work.entries && work.entries.length > 0 ? (
            <ul className="small text-muted mb-0">
              {work.entries.slice(0, 8).map(function(entry, idx) {
                return (
                  <li key={entry.tuneId + '-' + entry.linkIndex + '-' + idx}>
                    {entry.tuneName} — {entry.linkTitle}
                  </li>
                )
              })}
              {work.entries.length > 8 ? (
                <li>…and {work.entries.length - 8} more</li>
              ) : null}
            </ul>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          {props.onCancel ? (
            <Button variant="outline-secondary" onClick={props.onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button variant="primary" onClick={props.onConfirm}>
            Continue sharing
          </Button>
        </Modal.Footer>
      </Modal>
    )
  }

  return (
    <Modal
      show={!!props.show}
      backdrop="static"
      keyboard={false}
      centered
      style={modalStyle}
      backdropClassName={backdropClassName}
      data-testid="share-owned-media-progress-modal"
    >
      <Modal.Header>
        <Modal.Title>Preparing audio for sharing</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">{message}</p>
        <SearchProgressBar
          visible={true}
          percent={percent}
          message={total > 0 ? (current + ' of ' + total) : message}
          defaultMessage="Working…"
        />
        {events.length > 0 ? (
          <div className="share-owned-media-event-log mt-3">
            <div className="small text-muted mb-1">Activity</div>
            <div
              className="share-owned-media-event-list border rounded p-2 bg-light"
              style={{ maxHeight: '12rem', overflowY: 'auto' }}
            >
              {events.map(function(event, idx) {
                return (
                  <div
                    key={(event.timestamp || idx) + '-' + idx}
                    className={'small text-' + eventVariant(event.type)}
                  >
                    {event.message}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted small mt-3 mb-0">Uploading and updating permissions…</p>
        )}
      </Modal.Body>
    </Modal>
  )
}
