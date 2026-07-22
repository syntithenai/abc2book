import { useState } from 'react'

export default function ScratchpadTextBlockLayer(props) {
  const blocks = props.textBlocks || []
  const [editingId, setEditingId] = useState(null)
  const interactive = props.mode === 'text'

  function updateBlock(id, patch) {
    const next = blocks.map(function(block) {
      if (block.id !== id) return block
      return Object.assign({}, block, patch)
    })
    if (props.onChange) props.onChange(next)
  }

  function removeBlock(id) {
    if (props.onChange) props.onChange(blocks.filter(function(block) { return block.id !== id }))
    if (editingId === id) setEditingId(null)
  }

  function handleDragStart(e, block) {
    if (!interactive) return
    e.dataTransfer.setData('text/plain', block.id)
    if (props.onDragStart) props.onDragStart(block)
  }

  return (
    <div className={'scratchpad-text-block-layer' + (interactive ? '' : ' scratchpad-text-block-layer--readonly')}>
      {blocks.map(function(block) {
        const isEditing = interactive && editingId === block.id
        return (
          <div
            key={block.id}
            className="scratchpad-text-block"
            style={{
              left: (block.x || 0) + '%',
              top: (block.y || 0) + '%',
              width: (block.width || 30) + '%',
              minHeight: (block.height || 8) + '%',
              fontSize: (block.fontSize || 16) + 'px',
              color: block.color || '#111',
            }}
            draggable={interactive}
            onDragStart={function(e) { handleDragStart(e, block) }}
            onClick={function() {
              if (interactive) setEditingId(block.id)
            }}
          >
            {isEditing ? (
              <textarea
                autoFocus
                className="scratchpad-text-block-input"
                value={block.text || ''}
                onChange={function(e) { updateBlock(block.id, { text: e.target.value }) }}
                onBlur={function() { setEditingId(null) }}
                onKeyDown={function(e) {
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <div className="scratchpad-text-block-display">{block.text || 'Text'}</div>
            )}
            {interactive && isEditing ? (
              <button
                type="button"
                className="scratchpad-text-block-remove"
                title="Remove text"
                onMouseDown={function(e) { e.preventDefault() }}
                onClick={function(e) {
                  e.stopPropagation()
                  removeBlock(block.id)
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
