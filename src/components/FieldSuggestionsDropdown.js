import { Dropdown } from 'react-bootstrap'

/**
 * Count + caret dropdown for awaiting field-lookup suggestions.
 * Clear is the first menu item; remaining items are candidates.
 */
export default function FieldSuggestionsDropdown(props) {
  const items = Array.isArray(props.items) ? props.items : []
  const count = typeof props.count === 'number' ? props.count : items.length
  if (count <= 0) return null

  const getLabel = typeof props.getLabel === 'function'
    ? props.getLabel
    : function(item) {
      if (!item || typeof item !== 'object') return String(item || '')
      return item.artist || item.genre || item.title || item.alias || item.label
        || item.preview || String(item)
    }

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="info"
        disabled={!!props.disabled}
        aria-label="Open field suggestions"
        data-testid="field-suggestions-dropdown"
      >
        {String(count)}
      </Dropdown.Toggle>
      <Dropdown.Menu renderOnMount>
        <Dropdown.Item
          data-testid="field-suggestions-clear"
          onClick={function(e) {
            e.preventDefault()
            if (typeof props.onClear === 'function') props.onClear()
          }}
        >
          Clear suggestions
        </Dropdown.Item>
        {items.length > 0 ? <Dropdown.Divider /> : null}
        {items.map(function(item, index) {
          const label = getLabel(item, index)
          return (
            <Dropdown.Item
              key={(label || 'item') + '-' + index}
              data-testid={'field-suggestions-item-' + index}
              onClick={function(e) {
                e.preventDefault()
                if (typeof props.onSelect === 'function') props.onSelect(item, index)
              }}
            >
              {label || ('Suggestion ' + (index + 1))}
            </Dropdown.Item>
          )
        })}
      </Dropdown.Menu>
    </Dropdown>
  )
}
