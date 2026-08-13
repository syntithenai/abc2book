import { Button, ListGroup, Modal } from 'react-bootstrap'

export default function DriveUploadShrinkConfirmModal(props) {
  const warning = props.warning
  const busy = !!props.busy
  if (!warning) return null

  return (
    <Modal show={!!warning} onHide={function() { if (!busy && props.onCancel) props.onCancel() }} backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>Upload a much smaller songbook?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This sync would replace your Google Drive songbook of{' '}
          <strong>{warning.previousCount}</strong> tune{warning.previousCount === 1 ? '' : 's'}
          {' '}with a local copy of{' '}
          <strong>{warning.nextCount}</strong> tune{warning.nextCount === 1 ? '' : 's'}.
        </p>
        <p>
          About <strong>{warning.removedCount}</strong> tune{warning.removedCount === 1 ? '' : 's'} would
          disappear from Drive{warning.addedCount ? (
            <>
              {' '}(and {warning.addedCount} new tune{warning.addedCount === 1 ? '' : 's'} would be added)
            </>
          ) : null}.
        </p>
        {warning.sampleNames && warning.sampleNames.length > 0 ? (
          <>
            <p className="app-text-muted" style={{ marginBottom: '0.5rem' }}>
              Examples that would be removed from Drive:
            </p>
            <ListGroup style={{ maxHeight: '12rem', overflow: 'auto' }}>
              {warning.sampleNames.map(function(name, index) {
                return (
                  <ListGroup.Item key={name + '-' + index} className={index % 2 === 0 ? 'even' : 'odd'}>
                    {name}
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
            {warning.sampleTruncated ? (
              <p className="app-text-muted small" style={{ marginTop: '0.5rem' }}>
                …and more
              </p>
            ) : null}
          </>
        ) : null}
        <p className="app-text-muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          If you meant to delete these, confirm the upload. If this looks accidental, cancel and
          restore from Settings → Backup first.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={props.onCancel}>
          Cancel upload
        </Button>
        <Button variant="danger" disabled={busy} onClick={props.onConfirm}>
          {busy ? 'Uploading…' : 'Upload smaller songbook'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
