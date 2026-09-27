import { anchorZoomScroll } from './scratchpadWaveformZoom'
import usePinchZoomSteps from './usePinchZoomSteps'

function isInsideWaveformColumn(target, wrapEl) {
  if (!target || !wrapEl) return false
  if (!wrapEl.contains(target)) return false
  if (target.closest('.scratchpad-track-sidebar')) return false
  if (target.closest('.scratchpad-audio-transport-dock')) return false
  if (target.closest('.scratchpad-editor-chrome')) return false
  return true
}

export default function useScratchpadWaveformZoom(options) {
  const wrapRef = options.wrapRef
  const editorRef = options.editorRef
  const eeRef = options.eeRef
  const playlistRef = options.playlistRef
  const onZoom = options.onZoom

  usePinchZoomSteps({
    targetRef: wrapRef,
    wheelMode: 'always',
    isEligibleTarget: function(target) {
      return isInsideWaveformColumn(target, wrapRef && wrapRef.current)
    },
    onStep: function(direction, point) {
      const ee = eeRef && eeRef.current
      const playlist = playlistRef && playlistRef.current
      const editorEl = editorRef && editorRef.current
      if (!ee || !playlist) return
      const prev = playlist.samplesPerPixel
      if (direction > 0) ee.emit('zoomin')
      else ee.emit('zoomout')
      if (editorEl && point && typeof point.clientX === 'number') {
        anchorZoomScroll(playlist, editorEl, point.clientX, prev)
      }
      if (onZoom) onZoom()
    },
  })
}
