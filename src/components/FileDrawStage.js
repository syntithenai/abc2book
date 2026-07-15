import { useEffect, useRef, useState } from 'react'
import {
  appendStrokePoint,
  createStroke,
  drawStrokeOnContext,
  redrawInkLayer,
} from '../fileDrawStrokeUtils'

/**
 * Pan/zoom stage with pen ink and pinch zoom.
 * Fingers: pinch-zoom / pan. Pen (and mouse): draw/erase.
 */
export default function FileDrawStage(props) {
  const {
    image,
    tool,
    color,
    width,
    strokes,
    onStrokesChange,
  } = props

  const wrapRef = useRef(null)
  const inkRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [cursorPos, setCursorPos] = useState(null)
  const drawingRef = useRef(null)
  const panRef = useRef(null)
  const pinchRef = useRef(null)

  useEffect(function() {
    if (!image || !inkRef.current) return
    const canvas = inkRef.current
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    redrawInkLayer(canvas, strokes)
  }, [image])

  useEffect(function() {
    redrawInkLayer(inkRef.current, strokes)
  }, [strokes])

  useEffect(function() {
    if (!image) return undefined
    function fitToStage() {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const iw = image.naturalWidth || image.width
      const ih = image.naturalHeight || image.height
      if (iw <= 0 || ih <= 0) return
      // Modal open can leave height 0 for a frame — fall back to width-based fit.
      const availW = Math.max(rect.width, 1)
      const availH = Math.max(rect.height, 1)
      const fit = Math.min(availW / iw, availH / ih)
      setScale(fit > 0 && Number.isFinite(fit) ? fit : 1)
      setOffset({ x: 0, y: 0 })
    }
    fitToStage()
    const raf = requestAnimationFrame(fitToStage)
    const t = setTimeout(fitToStage, 50)
    return function() {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [image])

  function toImageCoords(clientX, clientY) {
    const canvas = inkRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function updateCursorFromEvent(e) {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function onPointerDown(e) {
    updateCursorFromEvent(e)
    const isPen = e.pointerType === 'pen' || e.pointerType === 'mouse'
    if (isPen) {
      const pt = toImageCoords(e.clientX, e.clientY)
      if (!pt) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const stroke = createStroke(tool, color, width)
      appendStrokePoint(stroke, pt.x, pt.y, e.pressure)
      drawingRef.current = stroke
      drawStrokeOnContext(inkRef.current.getContext('2d'), stroke)
      return
    }
    // touch
    if (e.pointerType === 'touch') {
      if (!pinchRef.current) {
        pinchRef.current = { pointers: {} }
      }
      pinchRef.current.pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pinchRef.current.pointers)
      if (ids.length === 1) {
        panRef.current = {
          x: e.clientX,
          y: e.clientY,
          ox: offset.x,
          oy: offset.y,
        }
      } else if (ids.length === 2) {
        const a = pinchRef.current.pointers[ids[0]]
        const b = pinchRef.current.pointers[ids[1]]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchRef.current.startDist = dist
        pinchRef.current.startScale = scale
        panRef.current = null
      }
    }
  }

  function onPointerMove(e) {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      updateCursorFromEvent(e)
    }
    if (drawingRef.current) {
      const pt = toImageCoords(e.clientX, e.clientY)
      if (!pt) return
      appendStrokePoint(drawingRef.current, pt.x, pt.y, e.pressure)
      redrawInkLayer(inkRef.current, (strokes || []).concat([drawingRef.current]))
      return
    }
    if (pinchRef.current && pinchRef.current.pointers[e.pointerId]) {
      pinchRef.current.pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pinchRef.current.pointers)
      if (ids.length === 2 && pinchRef.current.startDist > 0) {
        const a = pinchRef.current.pointers[ids[0]]
        const b = pinchRef.current.pointers[ids[1]]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const next = pinchRef.current.startScale * (dist / pinchRef.current.startDist)
        setScale(Math.min(8, Math.max(0.25, next)))
      } else if (ids.length === 1 && panRef.current) {
        setOffset({
          x: panRef.current.ox + (e.clientX - panRef.current.x),
          y: panRef.current.oy + (e.clientY - panRef.current.y),
        })
      }
    }
  }

  function onPointerUp(e) {
    if (drawingRef.current) {
      const next = (strokes || []).concat([drawingRef.current])
      drawingRef.current = null
      if (onStrokesChange) onStrokesChange(next)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      return
    }
    if (pinchRef.current) {
      delete pinchRef.current.pointers[e.pointerId]
      if (Object.keys(pinchRef.current.pointers).length === 0) {
        pinchRef.current = null
        panRef.current = null
      }
    }
  }

  function onPointerLeave(e) {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      if (!drawingRef.current) setCursorPos(null)
    }
  }

  function resetZoom() {
    if (!image || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const iw = image.naturalWidth || image.width
    const ih = image.naturalHeight || image.height
    const fit = Math.min(rect.width / iw, rect.height / ih)
    setScale(fit > 0 ? fit : 1)
    setOffset({ x: 0, y: 0 })
  }

  // expose reset via prop callback
  useEffect(function() {
    if (props.onRegisterResetZoom) props.onRegisterResetZoom(resetZoom)
  })

  if (!image) {
    return <div className="file-draw-stage-empty">Loading…</div>
  }

  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  const brushDiameter = Math.max(6, (width || 4) * (scale || 1))
  const cursorBorder = tool === 'eraser' ? '#666666' : (color || '#111111')

  return (
    <div
      className="file-draw-stage"
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{
        touchAction: 'none',
        overflow: 'hidden',
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        minHeight: '12rem',
        position: 'relative',
        background: '#333',
        cursor: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: iw,
          height: ih,
          transform: 'translate(-50%, -50%) translate(' + offset.x + 'px,' + offset.y + 'px) scale(' + scale + ')',
          transformOrigin: 'center center',
        }}
      >
        <img
          src={image.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: iw,
            height: ih,
            maxWidth: 'none',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        <canvas
          ref={inkRef}
          width={iw}
          height={ih}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: iw,
            height: ih,
          }}
        />
      </div>
      {cursorPos ? (
        <div
          className={'file-draw-brush-cursor' + (tool === 'eraser' ? ' file-draw-brush-cursor--eraser' : '')}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: cursorPos.x,
            top: cursorPos.y,
            width: brushDiameter,
            height: brushDiameter,
            marginLeft: -brushDiameter / 2,
            marginTop: -brushDiameter / 2,
            borderRadius: '50%',
            border: '2px solid ' + cursorBorder,
            background: tool === 'eraser' ? 'rgba(255,255,255,0.15)' : 'transparent',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      ) : null}
    </div>
  )
}
