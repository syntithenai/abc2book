import { Modal, Button } from 'react-bootstrap'

/**
 * Choice dialog after picking an image/PDF or audio/video on Add.
 * Default action is Skip (attach only).
 */
export default function AddAttachAnalyzeModal(props) {
  const kind = props.kind === 'media' ? 'media' : 'sheetImage'
  const fileName = props.fileName || (kind === 'media' ? 'media file' : 'file')
  const busy = !!props.busy

  return (
    <Modal
      show={!!props.show}
      onHide={busy ? undefined : props.onSkip}
      backdrop={busy ? 'static' : true}
      keyboard={!busy}
      centered
      data-testid="add-attach-analyze-modal"
    >
      <Modal.Header closeButton={!busy}>
        <Modal.Title>
          {kind === 'media' ? 'Attach media' : 'Attach file'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          Add <strong>{fileName}</strong> to this tune.
        </p>
        <p className="text-muted small mb-0">
          {kind === 'media'
            ? 'Skip keeps the recording on the form. Analyze queues audio analysis in the background and closes Add.'
            : 'Skip keeps the image/PDF on the form. Transcribe detects chord charts, lyrics, or notation and queues the matching extractor (OCR and/or OMR).'}
        </p>
      </Modal.Body>
      <Modal.Footer className="d-flex flex-wrap gap-2 justify-content-between">
        <Button
          variant="primary"
          disabled={busy}
          data-testid="add-attach-skip"
          onClick={props.onSkip}
          autoFocus
        >
          Skip
        </Button>
        <div className="d-flex gap-2">
          {kind === 'media' ? (
            <Button
              variant="outline-success"
              disabled={busy}
              data-testid="add-attach-analyze"
              onClick={props.onAnalyze}
            >
              {busy ? 'Starting…' : 'Analyze'}
            </Button>
          ) : (
            <Button
              variant="outline-success"
              disabled={busy}
              data-testid="add-attach-ocr"
              onClick={props.onOcr}
            >
              {busy ? 'Starting…' : 'Transcribe'}
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
