import { useEffect, useRef } from 'react'

const VARIANTS = {
  header: { width: 88, height: 44, bars: 14, gain: 3.2 },
  field: { width: 64, height: 32, bars: 10, gain: 3.5 },
}

/** Map normalized level 0–1 to a green → amber → red hue. */
function levelColor(level) {
  const t = Math.min(1, Math.max(0, level))
  if (t < 0.45) {
    const u = t / 0.45
    return 'hsl(' + Math.round(130 - u * 20) + ', 78%, ' + Math.round(38 + u * 14) + '%)'
  }
  if (t < 0.75) {
    const u = (t - 0.45) / 0.3
    return 'hsl(' + Math.round(48 - u * 6) + ', 92%, ' + Math.round(48 + u * 6) + '%)'
  }
  const u = (t - 0.75) / 0.25
  return 'hsl(' + Math.round(6 + u * 4) + ', 88%, ' + Math.round(52 - u * 8) + '%)'
}

export default function VoiceInputWaveform(props) {
  const canvasRef = useRef(null)
  const analyser = props.analyserNode
  const variant = props.variant === 'field' ? 'field' : 'header'
  const config = VARIANTS[variant]

  useEffect(function() {
    if (!analyser || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const freqData = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0

    function draw() {
      frame = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(freqData)

      const w = canvas.width
      const h = canvas.height
      const barCount = config.bars
      const gap = variant === 'header' ? 2 : 1.5
      const barWidth = (w - gap * (barCount - 1)) / barCount
      const binsPerBar = Math.max(1, Math.floor(freqData.length / barCount))

      ctx.clearRect(0, 0, w, h)

      // Dark track behind bars
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.fillRect(0, 0, w, h)

      for (let b = 0; b < barCount; b += 1) {
        let sum = 0
        const start = b * binsPerBar
        const end = Math.min(freqData.length, start + binsPerBar)
        for (let i = start; i < end; i += 1) {
          sum += freqData[i]
        }
        const avg = sum / (end - start) / 255
        const level = Math.min(1, avg * config.gain)
        const barHeight = Math.max(2, level * (h - 2))
        const x = b * (barWidth + gap)
        const y = h - barHeight

        ctx.fillStyle = levelColor(level)
        ctx.fillRect(x, y, barWidth, barHeight)

        // Brighter cap on active bars
        if (level > 0.08) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
          ctx.fillRect(x, y, barWidth, Math.min(3, barHeight))
        }
      }
    }

    draw()
    return function() { cancelAnimationFrame(frame) }
  }, [analyser, variant, config.bars, config.gain])

  if (!analyser) return null

  return (
    <canvas
      ref={canvasRef}
      className={'voice-input-waveform voice-input-waveform--' + variant}
      width={config.width}
      height={config.height}
      title="Input level"
      aria-label="Microphone input level"
    />
  )
}
