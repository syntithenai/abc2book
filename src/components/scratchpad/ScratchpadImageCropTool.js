import { useEffect, useRef, useState } from 'react'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function clampCrop(next) {
  const x = Math.max(0, Math.min(100, next.x))
  const y = Math.max(0, Math.min(100, next.y))
  const width = Math.max(5, Math.min(100 - x, next.width))
  const height = Math.max(5, Math.min(100 - y, next.height))
  return { x: x, y: y, width: width, height: height }
}

export default function ScratchpadImageCropTool(props) {
  const crop = props.crop || { x: 10, y: 10, width: 80, height: 80 }
  const [local, setLocal] = useState(crop)
  const dragRef = useRef(null)
  const localRef = useRef(local)

  useEffect(function() {
    const next = props.crop || { x: 10, y: 10, width: 80, height: 80 }
    setLocal(next)
    localRef.current = next
  }, [props.crop])

  function emit(next) {
    const clamped = clampCrop(next)
    setLocal(clamped)
    localRef.current = clamped
    if (props.onChange) props.onChange(clamped)
  }

  function onPointerDown(e, handle) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      handle: handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: Object.assign({}, localRef.current),
    }
  }

  useEffect(function() {
    function onPointerMove(e) {
      if (!dragRef.current || !props.containerRef || !props.containerRef.current) return
      const rect = props.containerRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100
      const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100
      const start = dragRef.current.startCrop
      let next = Object.assign({}, start)
      const handle = dragRef.current.handle

      if (handle === 'move') {
        next.x = start.x + dx
        next.y = start.y + dy
      } else {
        if (handle.indexOf('w') >= 0) {
          next.x = start.x + dx
          next.width = start.width - dx
        }
        if (handle.indexOf('e') >= 0) {
          next.width = start.width + dx
        }
        if (handle.indexOf('n') >= 0) {
          next.y = start.y + dy
          next.height = start.height - dy
        }
        if (handle.indexOf('s') >= 0) {
          next.height = start.height + dy
        }
      }
      emit(next)
    }

    function onPointerUp() {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return function() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [props.containerRef])

  if (!props.active) return null

  return (
    <div className="scratchpad-crop-overlay">
      <div
        className="scratchpad-crop-box"
        style={{
          left: local.x + '%',
          top: local.y + '%',
          width: local.width + '%',
          height: local.height + '%',
        }}
        onPointerDown={function(e) { onPointerDown(e, 'move') }}
      >
        {HANDLES.map(function(handle) {
          return (
            <div
              key={handle}
              className={'scratchpad-crop-handle scratchpad-crop-handle-' + handle}
              onPointerDown={function(e) { onPointerDown(e, handle) }}
            />
          )
        })}
      </div>
    </div>
  )
}
