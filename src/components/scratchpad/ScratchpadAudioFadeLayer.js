import { useEffect, useRef, useState, useCallback } from 'react'
import {
  markerClientXFromTime,
  markerTimeFromClientX,
  measureTimelineLayout,
  clampMarkerTimeContinuous,
} from '../../scratchpadAudioMarkers'

export default function ScratchpadAudioFadeLayer(props) {
  const editorRef = props.editorRef
  const wrapRef = props.wrapRef
  const tracks = props.tracks || []
  const duration = props.duration || 0
  const [layout, setLayout] = useState(null)
  const dragRef = useRef(null)

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
    const tracksEl = editorEl.querySelector('.playlist-tracks')
    const onScroll = function() { refreshLayout() }
    if (tracksEl) tracksEl.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const interval = setInterval(refreshLayout, 300)
    return function() {
      if (tracksEl) tracksEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      clearInterval(interval)
    }
  }, [editorRef, wrapRef, duration, refreshLayout, props.reloadKey])

  useEffect(function() {
    function onMove(e) {
      if (!dragRef.current || !layout) return
      const time = markerTimeFromClientX(e.clientX, layout, { continuous: true })
      const d = dragRef.current
      const track = tracks.find(function(t) { return t.id === d.trackId })
      if (!track) return
      const take = (track.takes || []).find(function(tk) { return tk.id === track.activeTakeId })
      if (!take) return
      const clipDur = duration
      let fadeIn = take.fadeIn ? Object.assign({}, take.fadeIn) : { start: 0, end: 0 }
      let fadeOut = take.fadeOut ? Object.assign({}, take.fadeOut) : { start: clipDur, end: clipDur }
      if (d.kind === 'fadeInEnd') {
        fadeIn = { start: 0, end: clampMarkerTimeContinuous(time, clipDur) }
      } else if (d.kind === 'fadeOutStart') {
        fadeOut = { start: clampMarkerTimeContinuous(time, clipDur), end: clipDur }
      }
      if (props.onFadeChange) props.onFadeChange(d.trackId, fadeIn, fadeOut)
    }
    function onUp() { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return function() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [layout, tracks, duration, props.onFadeChange])

  if (!layout || !duration) return null

  return (
    <div className="scratchpad-audio-fade-layer" aria-hidden="true">
      {tracks.filter(function(t) { return t.type !== 'midi' }).map(function(track) {
        const take = (track.takes || []).find(function(tk) { return tk.id === track.activeTakeId })
        if (!take) return null
        const fadeInEnd = take.fadeIn && take.fadeIn.end ? take.fadeIn.end : 0
        const fadeOutStart = take.fadeOut && take.fadeOut.start != null ? take.fadeOut.start : duration
        const inX = markerClientXFromTime(fadeInEnd, layout)
        const outX = markerClientXFromTime(fadeOutStart, layout)
        return (
          <div key={track.id} className="scratchpad-audio-fade-handles">
            {fadeInEnd > 0 ? (
              <button
                type="button"
                className="scratchpad-audio-fade-handle scratchpad-audio-fade-handle--in"
                style={{ left: inX + 'px' }}
                title="Fade in end"
                onPointerDown={function(e) {
                  e.preventDefault()
                  dragRef.current = { trackId: track.id, kind: 'fadeInEnd' }
                }}
              />
            ) : null}
            {fadeOutStart < duration ? (
              <button
                type="button"
                className="scratchpad-audio-fade-handle scratchpad-audio-fade-handle--out"
                style={{ left: outX + 'px' }}
                title="Fade out start"
                onPointerDown={function(e) {
                  e.preventDefault()
                  dragRef.current = { trackId: track.id, kind: 'fadeOutStart' }
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
