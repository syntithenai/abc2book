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

export function clampMarkerTime(seconds, duration) {
  const value = roundMarkerTime(seconds)
  const max = Number.isFinite(duration) && duration > 0 ? duration : value
  return Math.max(0, Math.min(max, value))
}

/**
 * Map a timeline X coordinate (viewport pixels) to seconds.
 */
export function markerTimeFromClientX(clientX, layout) {
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
  const ratio = xInWaveform / waveformWidth
  return clampMarkerTime(ratio * duration, duration)
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
  const xInWaveform = (time / duration) * waveformWidth
  const xInTracks = controlWidth + xInWaveform - tracksScrollLeft
  return xInTracks - wrapLeft
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
  return {
    duration: duration,
    wrapLeft: wrapRect.left,
    tracksLeft: tracksRect.left,
    tracksScrollLeft: tracks.scrollLeft,
    waveformWidth: waveformWidth,
    controlWidth: controlWidth,
  }
}
