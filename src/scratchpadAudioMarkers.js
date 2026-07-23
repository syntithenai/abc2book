export const MARKER_TIME_STEP = 0.1

export function roundMarkerTime(seconds, step) {
  const s = step != null ? step : MARKER_TIME_STEP
  const value = Number(seconds)
  if (!Number.isFinite(value)) return 0
  const decimals = Math.max(0, String(s).split('.')[1]?.length || 0)
  const rounded = Math.round(value / s) * s
  return parseFloat(rounded.toFixed(decimals))
}

export function formatMarkerTime(seconds) {
  return roundMarkerTime(seconds).toFixed(1)
}

export function clampMarkerTimeContinuous(seconds, duration) {
  const value = Number(seconds)
  if (!Number.isFinite(value)) return 0
  const max = Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, value)
  return Math.max(0, Math.min(max, value))
}

export function clampMarkerTime(seconds, duration) {
  return clampMarkerTimeContinuous(roundMarkerTime(seconds), duration)
}

/**
 * Map a timeline X coordinate (viewport pixels) to seconds.
 */
export function waveformBoundsInWrap(layout) {
  if (!layout) return { left: 0, right: 0 }
  const {
    tracksLeft,
    wrapLeft,
    tracksScrollLeft,
    waveformWidth,
    controlWidth,
  } = layout
  const left = tracksLeft - wrapLeft + controlWidth - tracksScrollLeft
  const right = left + waveformWidth
  return { left: left, right: right }
}

export function markerTimeFromClientX(clientX, layout, options) {
  if (!layout || !layout.duration) return 0
  const {
    duration,
    tracksLeft,
    tracksScrollLeft,
    waveformWidth,
    controlWidth,
  } = layout
  if (waveformWidth <= 0) return 0
  const xInTracks = clientX - tracksLeft
  const xInWaveform = xInTracks + tracksScrollLeft - controlWidth
  const clampedX = Math.max(0, Math.min(waveformWidth, xInWaveform))
  const ratio = clampedX / waveformWidth
  const time = ratio * duration
  if (options && options.continuous) {
    return clampMarkerTimeContinuous(time, duration)
  }
  return clampMarkerTime(time, duration)
}

/**
 * Map seconds to viewport X (pixels from left of wrap).
 */
export function markerClientXFromTime(time, layout) {
  if (!layout || !layout.duration) return 0
  const {
    duration,
    tracksLeft,
    wrapLeft,
    tracksScrollLeft,
    waveformWidth,
    controlWidth,
  } = layout
  if (waveformWidth <= 0) return tracksLeft - wrapLeft
  const clampedTime = clampMarkerTimeContinuous(time, duration)
  const xInWaveform = (clampedTime / duration) * waveformWidth
  const xInTracks = controlWidth + xInWaveform - tracksScrollLeft
  let left = xInTracks - wrapLeft
  const bounds = waveformBoundsInWrap(layout)
  left = Math.max(bounds.left, Math.min(bounds.right, left))
  return left
}

export function getLoopRegion(markers, explicitLoop) {
  if (explicitLoop && Number.isFinite(explicitLoop.start) && Number.isFinite(explicitLoop.end)) {
    return {
      start: Math.min(explicitLoop.start, explicitLoop.end),
      end: Math.max(explicitLoop.start, explicitLoop.end),
    }
  }
  const startMarker = (markers || []).find(function(m) { return m.loopRole === 'start' })
  const endMarker = (markers || []).find(function(m) { return m.loopRole === 'end' })
  if (startMarker && endMarker) {
    return {
      start: Math.min(startMarker.time, endMarker.time),
      end: Math.max(startMarker.time, endMarker.time),
    }
  }
  return null
}

export function measureTimelineLayout(editorEl, wrapEl, duration) {
  if (!editorEl || !wrapEl || !duration) return null
  const tracks = editorEl.querySelector('.playlist-tracks')
  if (!tracks) return null
  const wrapRect = wrapEl.getBoundingClientRect()
  const tracksRect = tracks.getBoundingClientRect()
  const controlEl = tracks.querySelector('.controls')
  const controlWidth = controlEl ? controlEl.getBoundingClientRect().width : 100
  const waveformWidth = Math.max(0, tracks.scrollWidth - controlWidth)
  const layout = {
    duration: duration,
    wrapLeft: wrapRect.left,
    tracksLeft: tracksRect.left,
    tracksScrollLeft: tracks.scrollLeft,
    waveformWidth: waveformWidth,
    controlWidth: controlWidth,
  }
  const bounds = waveformBoundsInWrap(layout)
  layout.waveformLeftPx = bounds.left
  layout.waveformRightPx = bounds.right
  return layout
}
