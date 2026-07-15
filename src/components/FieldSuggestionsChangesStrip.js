import { Badge, Button, ButtonGroup } from 'react-bootstrap'

const KIND_LABELS = {
  lyrics: 'Lyrics',
  chords: 'Chords',
  composer: 'Composer',
  notation: 'Notation',
  links: 'Links',
  genre: 'Genre',
  artists: 'Artists',
  aliases: 'Aliases',
  background: 'Background',
}

/**
 * Compact Accept / Clear / Open strip for pending field suggestions on a tune.
 */
export default function FieldSuggestionsChangesStrip(props) {
  const items = Array.isArray(props.items) ? props.items : []
  if (!items.length) return null

  return (
    <div
      className="field-suggestions-changes-strip border rounded p-2 mb-2 bg-light"
      data-testid="field-suggestions-changes-strip"
    >
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
        <strong className="mb-0">Search suggestions</strong>
        <ButtonGroup size="sm">
          <Button
            variant="success"
            data-testid="suggestions-accept-all"
            onClick={function() {
              if (typeof props.onAcceptAll === 'function') props.onAcceptAll()
            }}
          >
            Accept all
          </Button>
          <Button
            variant="outline-secondary"
            data-testid="suggestions-clear-all"
            onClick={function() {
              if (typeof props.onClearAll === 'function') props.onClearAll()
            }}
          >
            Clear all
          </Button>
        </ButtonGroup>
      </div>
      <ul className="list-unstyled mb-0">
        {items.map(function(item) {
          const kind = item.kind || 'field'
          const label = KIND_LABELS[kind] || kind
          const count = Number(item.count) || 0
          return (
            <li
              key={item.jobId || kind}
              className="d-flex align-items-center justify-content-between gap-2 flex-wrap py-1 border-top"
              data-testid={'suggestions-row-' + kind}
            >
              <div>
                <span>{label}</span>
                {count > 0 ? (
                  <Badge bg="secondary" pill className="ms-2">{count}</Badge>
                ) : null}
              </div>
              <ButtonGroup size="sm">
                <Button
                  variant="success"
                  onClick={function() {
                    if (typeof props.onAccept === 'function') props.onAccept(item)
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={function() {
                    if (typeof props.onClear === 'function') props.onClear(item)
                  }}
                >
                  Clear
                </Button>
                <Button
                  variant="info"
                  onClick={function() {
                    if (typeof props.onOpen === 'function') props.onOpen(item)
                  }}
                >
                  Open
                </Button>
              </ButtonGroup>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
