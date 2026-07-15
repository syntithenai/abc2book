import { Button, Modal } from 'react-bootstrap'

/**
 * Shared Auto / Review / Cancel confirm before field searches.
 */
export default function FieldSearchModeDialog({
  show,
  onHide,
  onAuto,
  onReview,
  title = 'Search',
  body = 'How should search results be applied?',
}) {
  return (
    <Modal show={!!show} onHide={onHide} centered data-testid="field-search-mode-dialog">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0">{body}</p>
        <ul className="mt-2 mb-0">
          <li>
            <strong>Auto</strong>
            {' '}
            — apply the first match when the search finishes.
          </li>
          <li>
            <strong>Review</strong>
            {' '}
            — choose a match in Review (and on this form if still open).
          </li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          data-testid="field-search-mode-auto"
          onClick={function() {
            if (typeof onAuto === 'function') onAuto()
          }}
        >
          Auto
        </Button>
        <Button
          variant="warning"
          data-testid="field-search-mode-review"
          onClick={function() {
            if (typeof onReview === 'function') onReview()
          }}
        >
          Review
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
