import { Button, Dropdown, DropdownButton } from 'react-bootstrap'

const CARET_TITLE = (
  <span aria-hidden="true" style={{ display: 'inline-block', lineHeight: 1 }}>▾</span>
)

/**
 * Caret control that reopens cached field-search results.
 * - openPickerOnToggle: caret click opens full picker via onOpen(candidates)
 * - otherwise lists labels and calls onSelect(candidate, index) or onOpen
 */
export default function FieldSearchResultsCaret(props) {
  const candidates = Array.isArray(props.candidates) ? props.candidates : []
  const disabled = !!props.disabled
  const className = props.className || 'select-input-options-dropdown'
  const testId = props['data-testid'] || 'field-search-results-caret'
  const ariaLabel = props['aria-label'] || 'Search result suggestions'
  const labels = typeof props.getLabel === 'function'
    ? candidates.map(props.getLabel)
    : candidates.map(function(item) {
      if (item == null) return ''
      if (typeof item === 'string') return item
      return String(
        item.artist
        || item.genre
        || item.title
        || item.alias
        || item.meter
        || item.key
        || item.tempo
        || item.preview
        || item.label
        || ''
      ).trim()
    })
  if (!candidates.length) return null

  const openPickerOnToggle = !!props.openPickerOnToggle
  const onOpen = typeof props.onOpen === 'function' ? props.onOpen : null
  const onSelect = typeof props.onSelect === 'function' ? props.onSelect : null

  if (openPickerOnToggle && onOpen) {
    return (
      <Button
        type="button"
        variant="outline-secondary"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        title={ariaLabel}
        data-testid={testId}
        onClick={function() { onOpen(candidates) }}
      >
        {CARET_TITLE}
      </Button>
    )
  }

  return (
    <span data-testid={testId} className="field-search-results-caret-wrap">
      <DropdownButton
        variant="outline-secondary"
        className={className}
        title={CARET_TITLE}
        align="end"
        disabled={disabled}
        aria-label={ariaLabel}
        onSelect={function(eventKey) {
          const index = parseInt(eventKey, 10)
          const candidate = candidates[index]
          if (!candidate) return
          if (onSelect) {
            onSelect(candidate, index)
            return
          }
          if (onOpen) onOpen(candidates)
        }}
      >
        {candidates.map(function(candidate, index) {
          const label = labels[index] || ('Result ' + (index + 1))
          if (!label) return null
          return (
            <Dropdown.Item key={label + ':' + index} eventKey={String(index)}>
              {label}
            </Dropdown.Item>
          )
        })}
      </DropdownButton>
    </span>
  )
}
