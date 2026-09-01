import { Button, Modal } from 'react-bootstrap'

export default function ClearMyDataConfirmModal(props) {
  const show = !!props.show
  const busy = !!props.busy
  const signedIn = !!props.signedIn
  const online = props.online !== false

  return (
    <Modal show={show} onHide={function() { if (!busy && props.onCancel) props.onCancel() }} backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>Clear my data?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This permanently deletes your songbook, playlists, sets, practice lists, scratchpad,
          and media stored in this app
          {signedIn ? ' and on your Google Drive' : ''}.
        </p>
        <p>
          <strong>This cannot be undone.</strong> Deleted data is gone for good
          {signedIn ? ' on this device and every device that syncs with this Google account' : ''}.
        </p>
        {!signedIn ? (
          <p className="app-text-muted" style={{ marginBottom: 0 }}>
            You are not signed in. Local data will be cleared now. Any Google Drive copy will be
            blanked or deleted the next time you sign in online.
          </p>
        ) : !online ? (
          <p className="app-text-muted" style={{ marginBottom: 0 }}>
            You are offline. Local data will be cleared now. Google Drive will be blanked or deleted
            the next time this client is online and signed in.
          </p>
        ) : (
          <p className="app-text-muted" style={{ marginBottom: 0 }}>
            Your Google Drive songbook will be blanked and owned media files will be deleted now.
          </p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={props.onCancel}>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={props.onConfirm}>
          {busy ? 'Clearing…' : 'Clear all my data'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
