import { Alert, Button } from 'react-bootstrap';

export default function GenreSuggestionOffer({ suggestion, onAccept, onDismiss }) {
  if (!suggestion || !suggestion.genre) return null;

  return (
    <Alert variant="info" style={{ marginTop: '0.75em', clear: 'both' }}>
      Suggested genre: <strong>{suggestion.genre}</strong>
      {suggestion.reason ? <span className="text-muted"> ({suggestion.reason})</span> : null}
      <div style={{ marginTop: '0.5em' }}>
        <Button
          size="sm"
          variant="primary"
          onClick={function() {
            if (typeof onAccept === 'function') onAccept(suggestion.genre);
          }}
        >
          Use genre
        </Button>
        {' '}
        <Button size="sm" variant="outline-secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}
