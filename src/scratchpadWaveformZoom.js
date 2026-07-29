import { pixelsToSeconds, secondsToPixels } from 'waveform-playlist/lib/utils/conversions'

export function closestZoomLevel(zoomLevels, targetSamplesPerPixel) {
  const levels = zoomLevels || []
  if (!levels.length) return targetSamplesPerPixel
  let best = levels[0]
  let bestDiff = Math.abs(levels[0] - targetSamplesPerPixel)
  for (let i = 1; i < levels.length; i += 1) {
    const diff = Math.abs(levels[i] - targetSamplesPerPixel)
    if (diff < bestDiff) {
      best = levels[i]
      bestDiff = diff
    }
  }
  return best
}

export function zoomPlaylistToSelection(playlist, editorEl, start, end) {
  if (!playlist || !editorEl || end <= start) return false
  const tracksEl = editorEl.querySelector('.playlist-tracks')
  if (!tracksEl) return false
  const controlWidth = playlist.controls && playlist.controls.show ? playlist.controls.width : 0
  const viewportWidth = Math.max(1, tracksEl.clientWidth - controlWidth)
  const selectionDuration = end - start
  const neededSamplesPerPixel = (selectionDuration * playlist.sampleRate) / viewportWidth
  const zoom = closestZoomLevel(playlist.zoomLevels, neededSamplesPerPixel)
  playlist.setZoom(zoom)
  playlist.drawRequest()
  const scrollPx = secondsToPixels(start, zoom, playlist.sampleRate)
  tracksEl.scrollLeft = Math.max(0, scrollPx)
  playlist.ee.emit('scroll')
  return true
}

export function anchorZoomScroll(playlist, editorEl, clientX, prevSamplesPerPixel) {
  if (!playlist || !editorEl || prevSamplesPerPixel === playlist.samplesPerPixel) return
  const tracksEl = editorEl.querySelector('.playlist-tracks')
  if (!tracksEl) return
  const controlWidth = playlist.controls && playlist.controls.show ? playlist.controls.width : 0
  const rect = tracksEl.getBoundingClientRect()
  const xInTracks = clientX - rect.left
  const xInWaveform = xInTracks + tracksEl.scrollLeft - controlWidth
  if (xInWaveform < 0) return
  const time = pixelsToSeconds(xInWaveform, prevSamplesPerPixel, playlist.sampleRate)
  const newScrollPx = secondsToPixels(time, playlist.samplesPerPixel, playlist.sampleRate)
  tracksEl.scrollLeft = Math.max(0, newScrollPx - (xInTracks - controlWidth))
  playlist.ee.emit('scroll')
}
