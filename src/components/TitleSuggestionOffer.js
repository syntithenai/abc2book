import { Alert, Button } from 'react-bootstrap'

/**
 * Offer one or more alternate titles (MusicBrainz, collection, etc.).
 * Props:
 * - candidates: [{ title, source }]
 * - suggestion/source: legacy single-candidate props (still supported)
 */
export default function TitleSuggestionOffer(props) {
  const fromCandidates = Array.isArray(props.candidates)
    ? props.candidates
      .map(function(item) {
        if (!item) return null
        const title = String(item.title || '').trim()
        if (!title) return null
        return {
          title: title,
          source: item.source ? String(item.source) : '',
        }
      })
      .filter(Boolean)
    : []
  const legacyTitle = String(props.suggestion || '').trim()
  const candidates = fromCandidates.length > 0
    ? fromCandidates
    : (legacyTitle
      ? [{ title: legacyTitle, source: props.source ? String(props.source) : '' }]
      : [])

  if (candidates.length === 0) return null

  return (
    <Alert variant="info" className="mt-2 mb-0" data-testid="title-suggestion-offer">
      {candidates.length === 1 ? (
        <>
          Suggested title: <strong>{candidates[0].title}</strong>
          {candidates[0].source ? (
            <span className="text-muted"> ({candidates[0].source})</span>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-2">Suggested titles:</div>
          <ul className="mb-2 ps-3">
            {candidates.map(function(item, index) {
              return (
                <li key={item.title + '-' + index} className="mb-1">
                  <strong>{item.title}</strong>
                  {item.source ? (
                    <span className="text-muted"> ({item.source})</span>
                  ) : null}
                  {' '}
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="ms-1"
                    data-testid={'title-suggestion-use-' + index}
                    onClick={function() {
                      if (typeof props.onAccept === 'function') props.onAccept(item.title)
                    }}
                  >
                    Use
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="mt-2">
        {candidates.length === 1 ? (
          <>
            <Button
              size="sm"
              variant="primary"
              data-testid="title-suggestion-use-0"
              onClick={function() {
                if (typeof props.onAccept === 'function') props.onAccept(candidates[0].title)
              }}
            >
              Use title
            </Button>
            {' '}
          </>
        ) : null}
        <Button
          size="sm"
          variant="outline-secondary"
          data-testid="title-suggestion-dismiss"
          onClick={props.onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </Alert>
  )
}
