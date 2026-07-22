import { useEffect, useState } from 'react'
import { listItems } from '../../scratchpadStore'
import ScratchpadItemCard from './ScratchpadItemCard'

export default function ScratchpadItemGrid(props) {
  const [items, setItems] = useState([])

  useEffect(function() {
    if (!props.workspaceId) {
      setItems([])
      return
    }
    setItems(listItems(props.workspaceId))
  }, [props.workspaceId, props.revision])

  if (!props.workspaceId) {
    return <div className="scratchpad-grid-empty p-3">Select or create a workspace.</div>
  }

  if (!items.length) {
    return (
      <div className="scratchpad-grid-empty p-3">
        No items yet. Use <strong>Create</strong> to add text, images, or notation.
      </div>
    )
  }

  return (
    <div className="scratchpad-grid">
      {items.map(function(item) {
        return (
          <ScratchpadItemCard
            key={item.id}
            item={item}
            tunebook={props.tunebook}
            onClick={function() {
              if (props.onItemClick) props.onItemClick(item.id)
            }}
          />
        )
      })}
    </div>
  )
}
