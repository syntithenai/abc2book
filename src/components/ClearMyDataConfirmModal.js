import { Button, Modal } from 'react-bootstrap'

export default function ClearMyDataConfirmModal(props) {
  const show = !!props.show
  const busy = !!props.busy
  const signedIn = !!props.signedIn
  const online = props.online !== false

  function handleConfirm(scope) {
    if (busy || !props.onConfirm) return
    props.onConfirm(scope)
  }

  return (
    <Modal show={show} onHide={function() { if (!busy && props.onCancel) props.onCancel() }} backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>Clear my data?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Choose whether to delete your songbook, playlists, sets, practice lists, scratchpad,
          and media from this browser only, or everywhere including Google Drive
          {signedIn ? '' : ' the next time you sign in'}.
        </p>
        <p>
          <strong>Clear on this device only</strong> removes local copies but leaves your Google
          Drive songbook unchanged. Your data will sync back the next time you sign in with the
          same account — useful on a shared computer.
        </p>
        <p>
          <strong>Clear everywhere</strong> permanently deletes your data
          {signedIn && online
            ? ' on this device and in Google Drive now'
            : signedIn
              ? ' on this device now and in Google Drive when you are back online'
              : ' on this device now and in Google Drive the next time you sign in online'}.
          <strong> This cannot be undone.</strong>
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={busy} onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline-danger"
          disabled={busy}
          onClick={function() { handleConfirm('device') }}
        >
          {busy ? 'Clearing…' : 'Clear on this device only'}
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={function() { handleConfirm('everywhere') }}
        >
          {busy ? 'Clearing…' : 'Clear everywhere'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
