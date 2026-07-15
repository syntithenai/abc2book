import { Alert, Button } from 'react-bootstrap'

/**
 * Fixed (non-auto-dismiss) merge failure banner for the chords tab.
 */
export default function ChordMergeFailureToast(props) {
  const failure = props.failure
  if (!failure) return null

  return (
    <Alert
      variant="danger"
      className="chord-merge-failure-toast mt-3 mb-0"
      style={{ position: 'sticky', bottom: 0, zIndex: 5 }}
    >
      <div className="d-flex flex-wrap align-items-start gap-2">
        <div style={{ flex: '1 1 12rem' }}>
          <Alert.Heading as="h6" className="mb-1">Could not save chords</Alert.Heading>
          <div>{failure.message || failure.code}</div>
          {failure.fixHint ? (
            <div className="small mt-1"><strong>What to do:</strong> {failure.fixHint}</div>
          ) : null}
          {failure.blockTitle ? (
            <div className="small text-muted mt-1">Section: {failure.blockTitle}</div>
          ) : null}
        </div>
        <Button size="sm" variant="outline-danger" onClick={props.onDismiss}>
          Dismiss
        </Button>
      </div>
    </Alert>
  )
}
