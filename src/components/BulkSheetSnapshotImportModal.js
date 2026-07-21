import { Modal, ProgressBar, Alert } from 'react-bootstrap'

export default function BulkSheetSnapshotImportModal(props) {
  const progress = props.progress || {}
  const current = Number(progress.current) || 0
  const total = Number(progress.total) || 0
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  const message = progress.message || 'Reading titles from sheet images and PDFs…'
  const warning = String(progress.warning || '').trim()

  return (
    <Modal
      show={!!props.show}
      backdrop="static"
      keyboard={false}
      centered
      data-testid="bulk-sheet-snapshot-import-modal"
    >
      <Modal.Header>
        <Modal.Title>Reading sheet titles</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {warning ? (
          <Alert variant="warning" className="py-2">
            {warning}
          </Alert>
        ) : null}
        <p className="mb-2">{message}</p>
        {total > 0 && progress.phase !== 'checking' && progress.phase !== 'unavailable' ? (
          <>
            <ProgressBar now={percent} label={percent + '%'} className="mb-2" />
            <p className="text-muted small mb-0">
              {current} of {total} file{total === 1 ? '' : 's'}
              {progress.fileName ? (' — ' + progress.fileName) : ''}
            </p>
          </>
        ) : (
          <p className="text-muted small mb-0">Preparing files…</p>
        )}
        <p className="text-muted small mt-3 mb-0">
          {progress.phase === 'fallback'
            ? 'Sheet OCR is unavailable, so filenames and folder names are being used instead.'
            : 'Import review will open when title extraction finishes for every file.'}
        </p>
      </Modal.Body>
    </Modal>
  )
}
