import { useEffect, useRef } from 'react'
import { computeSpectrum } from '../../scratchpadAudioAnalysis'
import { decodeAudioBlob } from '../../audioSilenceUtils'
import { getScratchpadBlob } from '../../scratchpadBlobs'
import { getActiveTake } from '../../scratchpadAudioProject'

export default function ScratchpadAudioSpectrogramLayer(props) {
  const canvasRef = useRef(null)
  const itemId = props.itemId
  const track = props.track
  const selection = props.selection
  const visible = !!props.visible

  useEffect(function() {
    if (!visible || !track || !canvasRef.current) return undefined
    let cancelled = false
    async function draw() {
      const take = getActiveTake(track)
      if (!take || !take.blobKey) return
      const blob = await getScratchpadBlob(take.blobKey)
      if (!blob || cancelled) return
      const buffer = await decodeAudioBlob(blob)
      const start = selection && selection.end > selection.start ? selection.start : 0
      const end = selection && selection.end > selection.start ? selection.end : buffer.duration
      const bins = computeSpectrum(buffer, start, end, 512)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const img = ctx.createImageData(w, h)
      for (let x = 0; x < w; x += 1) {
        const bin = bins[Math.floor((x / w) * bins.length)] || { db: -120 }
        const norm = Math.max(0, Math.min(1, (bin.db + 80) / 80))
        const color = Math.floor(norm * 255)
        for (let y = 0; y < h; y += 1) {
          const row = (h - 1 - y) * w + x
          const idx = row * 4
          img.data[idx] = color
          img.data[idx + 1] = Math.floor(color * 0.6)
          img.data[idx + 2] = 255 - color
          img.data[idx + 3] = 200
        }
      }
      ctx.putImageData(img, 0, 0)
    }
    draw()
    return function() { cancelled = true }
  }, [visible, track, selection, itemId])

  if (!visible) return null

  return (
    <canvas
      ref={canvasRef}
      className="scratchpad-audio-spectrogram"
      width={800}
      height={120}
      aria-hidden="true"
    />
  )
}
