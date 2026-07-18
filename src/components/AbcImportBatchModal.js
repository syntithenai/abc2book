/**
 * Modal host for ImportBatchSummaryPanel used by Add-from-file ABC imports.
 */
import { Modal } from 'react-bootstrap';
import ImportBatchSummaryPanel from './ImportBatchSummaryPanel';

export default function AbcImportBatchModal(props) {
  const summary = props.summary
  if (!summary) return null

  return (
    <Modal
      show
      onHide={props.onCancel}
      backdrop="static"
      keyboard={false}
      size="lg"
      data-testid="abc-import-batch-modal"
    >
      <Modal.Header closeButton={false}>
        <Modal.Title>Import ABC file</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Matching by tune id where possible. Apply certain updates and new tunes in one step,
          or review only the items that need a decision (local-newer, duplicates, library title matches).
        </p>
        <ImportBatchSummaryPanel
          summary={summary}
          onReviewAll={props.onReviewAll}
          onIncludeDuplicates={props.onIncludeDuplicates}
          onApplyCertain={props.onApplyCertain}
          onCancel={props.onCancel}
        />
      </Modal.Body>
    </Modal>
  )
}
