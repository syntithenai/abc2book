import { useEffect } from 'react'
import { anchorZoomScroll } from './scratchpadWaveformZoom'

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

  useEffect(function() {
    const wrapEl = wrapRef && wrapRef.current
    if (!wrapEl) return undefined

    let pinchStartDist = 0
    let pinchZoomSteps = 0
    const pointers = {}

    function emitZoom(direction, clientX) {
      const ee = eeRef && eeRef.current
      const playlist = playlistRef && playlistRef.current
      const editorEl = editorRef && editorRef.current
      if (!ee || !playlist) return
      const prev = playlist.samplesPerPixel
      if (direction < 0) ee.emit('zoomin')
      else ee.emit('zoomout')
      if (editorEl && typeof clientX === 'number') {
        anchorZoomScroll(playlist, editorEl, clientX, prev)
      }
      if (onZoom) onZoom()
    }

    function onWheel(e) {
      if (!isInsideWaveformColumn(e.target, wrapEl)) return
      const horizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (horizontalDominant && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX
      emitZoom(delta, e.clientX)
    }

    function pointerDistance(a, b) {
      const dx = a.x - b.x
      const dy = a.y - b.y
      return Math.sqrt(dx * dx + dy * dy)
    }

    function onPointerDown(e) {
      if (!isInsideWaveformColumn(e.target, wrapEl)) return
      if (e.pointerType !== 'touch') return
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pointers)
      if (ids.length === 2) {
        const a = pointers[ids[0]]
        const b = pointers[ids[1]]
        pinchStartDist = pointerDistance(a, b)
        pinchZoomSteps = 0
      }
    }

    function onPointerMove(e) {
      if (!pointers[e.pointerId]) return
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY }
      const ids = Object.keys(pointers)
      if (ids.length !== 2 || pinchStartDist <= 0) return
      e.preventDefault()
      const a = pointers[ids[0]]
      const b = pointers[ids[1]]
      const dist = pointerDistance(a, b)
      const ratio = dist / pinchStartDist
      const steps = Math.round(Math.log(ratio) / Math.log(1.12))
      while (steps > pinchZoomSteps) {
        emitZoom(-1, (a.x + b.x) / 2)
        pinchZoomSteps += 1
      }
      while (steps < pinchZoomSteps) {
        emitZoom(1, (a.x + b.x) / 2)
        pinchZoomSteps -= 1
      }
    }

    function onPointerUp(e) {
      delete pointers[e.pointerId]
      if (Object.keys(pointers).length < 2) {
        pinchStartDist = 0
        pinchZoomSteps = 0
      }
    }

    wrapEl.addEventListener('wheel', onWheel, { passive: false })
    wrapEl.addEventListener('pointerdown', onPointerDown, { passive: true })
    wrapEl.addEventListener('pointermove', onPointerMove, { passive: false })
    wrapEl.addEventListener('pointerup', onPointerUp, { passive: true })
    wrapEl.addEventListener('pointercancel', onPointerUp, { passive: true })

    return function() {
      wrapEl.removeEventListener('wheel', onWheel)
      wrapEl.removeEventListener('pointerdown', onPointerDown)
      wrapEl.removeEventListener('pointermove', onPointerMove)
      wrapEl.removeEventListener('pointerup', onPointerUp)
      wrapEl.removeEventListener('pointercancel', onPointerUp)
    }
  }, [wrapRef, editorRef, eeRef, playlistRef, onZoom])
}
