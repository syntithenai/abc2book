import { Alert, Button } from 'react-bootstrap'

/**
 * Inline merge / draft-save failure banner shown above a chord chart textarea.
 */
export default function ChordMergeFailureToast(props) {
  const failure = props.failure
  if (!failure) return null

  return (
    <Alert
      variant="warning"
      className="chord-merge-failure-toast mb-2 py-2"
    >
      <div className="d-flex flex-wrap align-items-start gap-2">
        <div style={{ flex: '1 1 12rem' }}>
          <Alert.Heading as="h6" className="mb-1">Could not save chords to notation</Alert.Heading>
          <div>{failure.message || failure.code}</div>
          {failure.fixHint ? (
            <div className="small mt-1"><strong>What to do:</strong> {failure.fixHint}</div>
          ) : null}
          {failure.blockTitle ? (
            <div className="small text-muted mt-1">Section: {failure.blockTitle}</div>
          ) : null}
        </div>
        <div className="d-flex flex-column gap-1">
          {props.onRefresh ? (
            <Button size="sm" variant="danger" onClick={props.onRefresh}>
              Refresh grid from notation
            </Button>
          ) : null}
          <Button size="sm" variant="outline-danger" onClick={props.onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </Alert>
  )
}
