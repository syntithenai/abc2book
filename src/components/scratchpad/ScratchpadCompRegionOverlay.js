import { useEffect, useRef, useState, useCallback } from 'react'
import { measureTimelineLayout } from '../../scratchpadAudioMarkers'

const TAKE_COLORS = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#20c997', '#dc3545']

function colorForTake(takeId, takes) {
  const index = (takes || []).findIndex(function(t) { return t.id === takeId })
  return TAKE_COLORS[index >= 0 ? index % TAKE_COLORS.length : 0]
}

export default function ScratchpadCompRegionOverlay(props) {
  const editorRef = props.editorRef
  const wrapRef = props.wrapRef
  const tracks = props.tracks || []
  const duration = props.duration || 0
  const [layout, setLayout] = useState(null)
  const overlayRef = useRef(null)

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
    const interval = setInterval(refreshLayout, 250)
    return function() {
      if (tracksEl) tracksEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      clearInterval(interval)
    }
  }, [editorRef, wrapRef, duration, refreshLayout, props.reloadKey])

  useEffect(function() {
    if (!props.onLayoutRefresh) return undefined
    props.onLayoutRefresh(refreshLayout)
    return undefined
  }, [props.onLayoutRefresh, refreshLayout])

  if (!layout || !duration) return null

  const segments = []
  tracks.forEach(function(track) {
    if (track.type !== 'audio' || !track.compEnabled) return
    const regions = track.compRegions || []
    if (!regions.length) return
    const mainEl = editorRef.current && editorRef.current.querySelector('.main-' + track.id)
    if (!mainEl) return
    const wrapRect = wrapRef.current.getBoundingClientRect()
    const rowRect = mainEl.getBoundingClientRect()
    const top = rowRect.top - wrapRect.top
    const height = rowRect.height
  const { tracksLeft, wrapLeft, tracksScrollLeft, waveformWidth, controlWidth, duration: dur } = layout
    const leftBase = tracksLeft - wrapLeft + controlWidth - tracksScrollLeft
    regions.forEach(function(region, index) {
      const startX = leftBase + (region.start / dur) * waveformWidth
      const width = ((region.end - region.start) / dur) * waveformWidth
      segments.push({
        key: track.id + '-' + index,
        left: startX,
        width: width,
        top: top,
        height: height,
        color: colorForTake(region.takeId, track.takes),
      })
    })
  })

  if (!segments.length) return null

  return (
    <div className="scratchpad-comp-region-overlay" ref={overlayRef} aria-hidden="true">
      {segments.map(function(seg) {
        return (
          <div
            key={seg.key}
            className="scratchpad-comp-region-segment"
            style={{
              left: seg.left + 'px',
              width: seg.width + 'px',
              top: seg.top + 'px',
              height: seg.height + 'px',
              borderBottomColor: seg.color,
            }}
          />
        )
      })}
    </div>
  )
}
