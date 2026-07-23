import { useEffect, useRef, useState, useCallback } from 'react'
import {
  clampMarkerTime,
  formatMarkerTime,
  markerClientXFromTime,
  markerTimeFromClientX,
  measureTimelineLayout,
} from '../../scratchpadAudioMarkers'

export default function ScratchpadAudioMarkerLayer(props) {
  const editorRef = props.editorRef
  const wrapRef = props.wrapRef
  const markers = props.markers || []
  const duration = props.duration || 0
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

  if (!duration || !markers.length || !layout) return null

  return (
    <div className="scratchpad-audio-marker-layer" aria-hidden="false">
      {markers.map(function(marker, index) {
        const left = markerClientXFromTime(marker.time, layout)
        const isLoopStart = marker.loopRole === 'start'
        const isLoopEnd = marker.loopRole === 'end'
        const atStart = marker.time <= 0
        return (
          <div
            key={index}
            className={
              'scratchpad-audio-marker'
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
                dragRef.current = { index: index, startX: e.clientX, moved: false }
                try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
              }}
              onClick={function(e) {
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
            <div className="scratchpad-audio-marker-line" />
          </div>
        )
      })}
    </div>
  )
}

export function normalizeMarker(marker, duration) {
  return Object.assign({}, marker, {
    time: clampMarkerTime(marker.time, duration),
  })
}

export function normalizeMarkers(markers, duration) {
  return (markers || []).map(function(marker) {
    return normalizeMarker(marker, duration)
  })
}

export function setMarkerLoopRole(markers, index, role) {
  return (markers || []).map(function(marker, i) {
    const next = Object.assign({}, marker)
    if (i === index) {
      if (next.loopRole === role) delete next.loopRole
      else next.loopRole = role
    } else if (role && next.loopRole === role) {
      delete next.loopRole
    }
    return next
  })
}
