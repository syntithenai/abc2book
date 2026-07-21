import { useEffect, useRef, useState } from 'react'
import {
  appendStrokePoint,
  createStroke,
  drawStrokeOnContext,
  redrawInkLayer,
} from '../fileDrawStrokeUtils'

const MIN_STAGE_SCALE = 0.25
const MAX_STAGE_SCALE = 8
const ZOOM_STEP = 1.15

export function clampFileDrawStageScale(scale) {
  const value = parseFloat(scale)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(MAX_STAGE_SCALE, Math.max(MIN_STAGE_SCALE, value))
}

/**
 * Pan/zoom stage with ink drawing and pinch zoom.
 * One finger / pen / mouse: draw or erase. Two fingers: pinch zoom.
 * Use zoom controls when the image is larger than the viewport.
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

  const shellRef = useRef(null)
  const wrapRef = useRef(null)
  const inkRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [cursorPos, setCursorPos] = useState(null)
  const drawingRef = useRef(null)
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

  function getStageMetrics() {
    if (!image || !wrapRef.current) return null
    const rect = wrapRef.current.getBoundingClientRect()
    const iw = image.naturalWidth || image.width
    const ih = image.naturalHeight || image.height
    if (iw <= 0 || ih <= 0) return null
    return {
      availW: Math.max(rect.width, 1),
      availH: Math.max(rect.height, 1),
      iw: iw,
      ih: ih,
    }
  }

  function fitHeight() {
    const metrics = getStageMetrics()
    if (!metrics) return
    const next = clampFileDrawStageScale(metrics.availH / metrics.ih)
    setScale(next)
    requestAnimationFrame(scrollContentToOrigin)
  }

  function fitWidth() {
    const metrics = getStageMetrics()
    if (!metrics) return
    const next = clampFileDrawStageScale(metrics.availW / metrics.iw)
    setScale(next)
    requestAnimationFrame(scrollContentToOrigin)
  }

  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return
    setScale(function(current) {
      return clampFileDrawStageScale(current * factor)
    })
  }

  function resetViewZoom() {
    setScale(1)
    requestAnimationFrame(scrollContentToOrigin)
  }

  function scrollContentToOrigin() {
    const el = wrapRef.current
    if (!el) return
    el.scrollLeft = 0
    el.scrollTop = 0
  }

  useEffect(function() {
    if (!image) return undefined
    function fitWhenReady() {
      fitWidth()
    }
    fitWhenReady()
    const raf = requestAnimationFrame(fitWhenReady)
    const t = setTimeout(fitWhenReady, 50)
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

  function pointerInShell(clientX, clientY) {
    const shell = shellRef.current
    if (!shell) return false
    const rect = shell.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
  }

  function updateCursorFromEvent(e) {
    if (!shellRef.current) return
    if (!pointerInShell(e.clientX, e.clientY)) {
      setCursorPos(null)
      return
    }
    const rect = shellRef.current.getBoundingClientRect()
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function clearCursor() {
    setCursorPos(null)
  }

  function beginStroke(e) {
    const pt = toImageCoords(e.clientX, e.clientY)
    if (!pt) return false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    if (e.cancelable) e.preventDefault()
    const stroke = createStroke(tool, color, width)
    appendStrokePoint(stroke, pt.x, pt.y, e.pressure)
    drawingRef.current = stroke
    drawStrokeOnContext(inkRef.current.getContext('2d'), stroke)
    return true
  }

  function onPointerDown(e) {
    updateCursorFromEvent(e)

    // Two-finger pinch takes priority over drawing.
    if (e.pointerType === 'touch') {
      if (!pinchRef.current) {
        pinchRef.current = { pointers: {} }
      }
      pinchRef.current.pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pinchRef.current.pointers)
      if (ids.length >= 2) {
        // Cancel any in-progress one-finger stroke when a second finger lands.
        drawingRef.current = null
        if (e.cancelable) e.preventDefault()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
        const a = pinchRef.current.pointers[ids[0]]
        const b = pinchRef.current.pointers[ids[1]]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchRef.current.startDist = dist
        pinchRef.current.startScale = scale
        return
      }
    }

    beginStroke(e)
  }

  function onPointerMove(e) {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      updateCursorFromEvent(e)
    }
    if (drawingRef.current) {
      if (e.cancelable) e.preventDefault()
      const pt = toImageCoords(e.clientX, e.clientY)
      if (!pt) return
      appendStrokePoint(drawingRef.current, pt.x, pt.y, e.pressure)
      redrawInkLayer(inkRef.current, (strokes || []).concat([drawingRef.current]))
      return
    }
    if (pinchRef.current && pinchRef.current.pointers[e.pointerId]) {
      const ids = Object.keys(pinchRef.current.pointers)
      if (ids.length >= 2) {
        if (e.cancelable) e.preventDefault()
        pinchRef.current.pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
        if (pinchRef.current.startDist > 0) {
          const a = pinchRef.current.pointers[ids[0]]
          const b = pinchRef.current.pointers[ids[1]]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          const next = pinchRef.current.startScale * (dist / pinchRef.current.startDist)
          setScale(clampFileDrawStageScale(next))
        }
      }
    }
  }

  function onPointerUp(e) {
    if (drawingRef.current) {
      const next = (strokes || []).concat([drawingRef.current])
      drawingRef.current = null
      if (onStrokesChange) onStrokesChange(next)
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      if (!pointerInShell(e.clientX, e.clientY)) clearCursor()
      else updateCursorFromEvent(e)
      return
    }
    if (pinchRef.current) {
      delete pinchRef.current.pointers[e.pointerId]
      const remaining = Object.keys(pinchRef.current.pointers).length
      if (remaining === 0) {
        pinchRef.current = null
      } else if (remaining === 1) {
        pinchRef.current.startDist = 0
      }
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    }
  }

  function onShellPointerLeave(e) {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      clearCursor()
    }
  }

  useEffect(function() {
    const el = wrapRef.current
    if (!el || !image) return undefined
    function blockBrowserGesture(e) {
      // Block page scroll / browser pinch while drawing or pinching on the stage.
      if (drawingRef.current || (e.touches && e.touches.length >= 2)) {
        e.preventDefault()
      }
    }
    el.addEventListener('touchmove', blockBrowserGesture, { passive: false })
    return function() {
      el.removeEventListener('touchmove', blockBrowserGesture)
    }
  }, [image])

  useEffect(function() {
    if (!props.onRegisterViewControls) return
    props.onRegisterViewControls({
      fitHeight: fitHeight,
      fitWidth: fitWidth,
      zoomIn: function() { zoomBy(ZOOM_STEP) },
      zoomOut: function() { zoomBy(1 / ZOOM_STEP) },
      resetZoom: resetViewZoom,
    })
  })

  if (!image) {
    return <div className="file-draw-stage-empty">Loading…</div>
  }

  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  const contentW = iw * scale
  const contentH = ih * scale
  const brushDiameter = Math.max(6, (width || 4) * (scale || 1))
  const cursorBorder = tool === 'eraser' ? '#666666' : (color || '#111111')

  return (
    <div
      className="file-draw-stage-shell"
      ref={shellRef}
      onPointerLeave={onShellPointerLeave}
      style={{
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        minHeight: '12rem',
        position: 'relative',
        overflow: 'hidden',
        background: '#333',
        cursor: cursorPos ? 'none' : 'default',
      }}
    >
      <div
        className="file-draw-stage file-draw-stage--draw"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          WebkitOverflowScrolling: 'touch',
          width: '100%',
          height: '100%',
          position: 'relative',
          background: '#333',
          cursor: 'inherit',
        }}
      >
        <div
          className="file-draw-stage-sizer"
          style={{
            display: 'grid',
            placeItems: 'center',
            boxSizing: 'border-box',
            minWidth: '100%',
            minHeight: '100%',
            width: 'max(100%, ' + contentW + 'px)',
            height: 'max(100%, ' + contentH + 'px)',
          }}
        >
          <div
            className="file-draw-stage-content"
            style={{
              width: contentW,
              height: contentH,
              position: 'relative',
              flexShrink: 0,
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
                width: '100%',
                height: '100%',
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
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        </div>
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
