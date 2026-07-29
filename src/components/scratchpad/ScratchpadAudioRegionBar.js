import { useEffect, useRef, useState, useCallback } from 'react'
import {
  formatMarkerTime,
  markerClientXFromTime,
  markerTimeFromClientX,
  measureTimelineLayout,
  selectionBetweenMarkers,
  waveformBoundsInWrap,
} from '../../scratchpadAudioMarkers'
import { normalizeMarker } from './ScratchpadAudioMarkerLayer'

export default function ScratchpadAudioRegionBar(props) {
  const editorRef = props.editorRef
  const wrapRef = props.wrapRef
  const markers = props.markers || []
  const duration = props.duration || 0
  const selection = props.selection
  const [layout, setLayout] = useState(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)

  const refreshLayout = useCallback(function() {
    if (!editorRef || !editorRef.current || !wrapRef || !wrapRef.current || !duration) {
      setLayout(null)
      return
    }
    setLayout(measureTimelineLayout(editorRef.current, wrapRef.current, duration))
  }, [editorRef, wrapRef, duration])

  useEffect(function() {
    refreshLayout()
    const editorEl = editorRef && editorRef.current
    if (!editorEl) return undefined
    const tracks = editorEl.querySelector('.playlist-tracks')
    const onScroll = function() { refreshLayout() }
    const onResize = function() { refreshLayout() }
    if (tracks) tracks.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    const interval = setInterval(refreshLayout, 250)
    return function() {
      if (tracks) tracks.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      clearInterval(interval)
    }
  }, [editorRef, wrapRef, duration, refreshLayout, props.reloadKey])

  useEffect(function() {
    if (props.onLayoutRefresh) props.onLayoutRefresh(refreshLayout)
  }, [props.onLayoutRefresh, refreshLayout])

  useEffect(function() {
    function onPointerMove(e) {
      if (!dragRef.current || !layout) return
      if (Math.abs(e.clientX - dragRef.current.startX) > 3) {
        dragRef.current.moved = true
      }
      const index = dragRef.current.index
      const time = markerTimeFromClientX(e.clientX, layout, { continuous: true })
      if (props.onMarkerDrag) props.onMarkerDrag(index, time)
    }

    function onPointerUp(e) {
      if (!dragRef.current) return
      const index = dragRef.current.index
      const moved = dragRef.current.moved
      dragRef.current = null
      if (moved) suppressClickRef.current = true
      if (layout && props.onMarkerDragEnd) {
        const time = markerTimeFromClientX(e.clientX, layout, { continuous: true })
        props.onMarkerDragEnd(index, time, moved)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return function() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [layout, props.onMarkerDrag, props.onMarkerDragEnd])

  function handleDoubleClick(e) {
    if (!layout || !duration || !markers.length) return
    const clickTime = markerTimeFromClientX(e.clientX, layout, { continuous: true })
    const sel = selectionBetweenMarkers(markers, clickTime, duration)
    if (!sel || sel.end <= sel.start) return
    if (props.onSelectionChange) props.onSelectionChange(sel)
  }

  if (!duration || !layout) {
    return <div className="scratchpad-audio-region-bar" aria-hidden="true" />
  }

  const hasSel = selection && selection.end > selection.start
  const bounds = waveformBoundsInWrap(layout)
  const selLeft = hasSel ? markerClientXFromTime(selection.start, layout) : 0
  const selRight = hasSel ? markerClientXFromTime(selection.end, layout) : 0
  const selWidth = hasSel ? Math.max(0, selRight - selLeft) : 0

  return (
    <div
      className="scratchpad-audio-region-bar"
      title={markers.length ? 'Double-click to select between markers' : 'Add markers via Process menu'}
      onDoubleClick={handleDoubleClick}
    >
      {hasSel ? (
        <div
          className="scratchpad-audio-region-bar-selection"
          style={{
            left: selLeft + 'px',
            width: selWidth + 'px',
          }}
        />
      ) : null}
      {markers.map(function(marker, index) {
        const left = markerClientXFromTime(marker.time, layout)
        const isLoopStart = marker.loopRole === 'start'
        const isLoopEnd = marker.loopRole === 'end'
        const atStart = marker.time <= 0
        if (left < bounds.left - 2 || left > bounds.right + 2) return null
        return (
          <div
            key={index}
            className={
              'scratchpad-audio-marker scratchpad-audio-marker--region'
              + (isLoopStart ? ' scratchpad-audio-marker--loop-start' : '')
              + (isLoopEnd ? ' scratchpad-audio-marker--loop-end' : '')
            }
            style={{ left: left + 'px' }}
          >
            <button
              type="button"
              className={
                'scratchpad-audio-marker-chip'
                + (atStart ? ' scratchpad-audio-marker-chip--at-start' : '')
              }
              title={marker.label + ' (' + formatMarkerTime(marker.time) + 's) — drag to move, click to edit'}
              onPointerDown={function(e) {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                dragRef.current = { index: index, startX: e.clientX, moved: false }
                try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
              }}
              onClick={function(e) {
                e.stopPropagation()
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  e.preventDefault()
                  return
                }
                if (props.onMarkerClick) props.onMarkerClick(index)
              }}
            >
              {marker.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export { normalizeMarker }
