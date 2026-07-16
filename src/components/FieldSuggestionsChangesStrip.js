import { Button } from 'react-bootstrap'

const KIND_LABELS = {
  lyrics: 'Lyrics',
  chords: 'Chords',
  composer: 'Composer',
  notation: 'Notation',
  links: 'Links',
  genre: 'Genre',
  title: 'Title',
  artists: 'Artists',
  aliases: 'Aliases',
  background: 'Background',
}

/**
 * Top-of-form suggestions strip:
 * Clear Suggestions (red, left) | Suggestions | [Composer] [Genre] …
 * Field name buttons open the relevant selection dialog.
 */
export default function FieldSuggestionsChangesStrip(props) {
  const items = Array.isArray(props.items) ? props.items : []
  if (!items.length) return null

  return (
    <div
      className="field-suggestions-changes-strip border rounded p-2 mb-2 bg-light d-flex align-items-center gap-2 flex-wrap"
      data-testid="field-suggestions-changes-strip"
    >
      <Button
        size="sm"
        variant="danger"
        className="field-suggestions-clear-all"
        data-testid="suggestions-clear-all"
        onClick={function() {
          if (typeof props.onClearAll === 'function') props.onClearAll()
        }}
      >
        Clear Suggestions
      </Button>
      <strong className="mb-0 me-1">Suggestions</strong>
      {items.map(function(item) {
        const kind = item.kind || 'field'
        const label = KIND_LABELS[kind] || kind
        const count = Number(item.count) || 0
        return (
          <Button
            key={item.jobId || kind}
            size="sm"
            variant="info"
            data-testid={'suggestions-open-' + kind}
            onClick={function() {
              if (typeof props.onOpen === 'function') props.onOpen(item)
            }}
          >
            {label}
            {count > 0 ? (
              <span className="badge bg-dark rounded-pill ms-1">{count}</span>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}
