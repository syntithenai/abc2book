import { useState } from 'react'
import { Button } from 'react-bootstrap'

const DEFAULT_LIMIT = 2

/**
 * Renders a limited number of button-like items with a "more" link for the rest.
 */
export default function CollapsibleButtonRow({
  items,
  renderItem,
  limit = DEFAULT_LIMIT,
  className,
}) {
  const list = Array.isArray(items) ? items : []
  const [expanded, setExpanded] = useState(false)
  if (!list.length) return null

  const maxVisible = typeof limit === 'number' ? limit : DEFAULT_LIMIT
  const visibleItems = expanded ? list : list.slice(0, maxVisible)
  const hiddenCount = Math.max(0, list.length - maxVisible)

  return (
    <div className={className || 'collapsible-button-row d-flex align-items-center gap-2 flex-wrap'}>
      {visibleItems.map(function(item, index) {
        return renderItem(item, index)
      })}
      {!expanded && hiddenCount > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="collapsible-button-row-more p-0"
          onClick={function() { setExpanded(true) }}
        >
          +{hiddenCount} more
        </Button>
      ) : null}
      {expanded && list.length > maxVisible ? (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="collapsible-button-row-less p-0"
          onClick={function() { setExpanded(false) }}
        >
          less
        </Button>
      ) : null}
    </div>
  )
}
