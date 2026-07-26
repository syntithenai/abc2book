import { useMemo } from 'react'
import { getScratchpadListItems } from '../../scratchpadListSearch'
import ScratchpadItemCard from './ScratchpadItemCard'

export default function ScratchpadItemGrid(props) {
  const visibleItems = useMemo(function() {
    return getScratchpadListItems(props.workspaceFilterId, props.search)
  }, [props.workspaceFilterId, props.search, props.revision])

  const allItems = useMemo(function() {
    return getScratchpadListItems(props.workspaceFilterId, '')
  }, [props.workspaceFilterId, props.revision])

  if (!allItems.length) {
    return (
      <div className="scratchpad-grid-empty p-3">
        No items yet. Use <strong>Create</strong> to add text, images, or notation.
      </div>
    )
  }

  if (!visibleItems.length) {
    return (
      <div className="scratchpad-grid-empty p-3">
        No scratchpad items match <strong>{props.search}</strong>.
      </div>
    )
  }

  return (
    <div className="scratchpad-grid">
      {visibleItems.map(function(item) {
        return (
          <ScratchpadItemCard
            key={item.id}
            item={item}
            tunebook={props.tunebook}
            selected={!!(props.selected && props.selected[item.id])}
            onToggleSelect={function() {
              if (props.onToggleSelect) props.onToggleSelect(item.id)
            }}
            onClick={function() {
              if (props.onItemClick) props.onItemClick(item.id)
            }}
          />
        )
      })}
    </div>
  )
}
