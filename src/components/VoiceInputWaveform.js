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

function drawBars(ctx, canvas, barCount, gap, gain, sampleLevels) {
  const w = canvas.width
  const h = canvas.height
  const barWidth = (w - gap * (barCount - 1)) / barCount

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.fillRect(0, 0, w, h)

  for (let b = 0; b < barCount; b += 1) {
    const avg = sampleLevels[b] || 0
    const level = Math.min(1, avg * gain)
    const barHeight = Math.max(2, level * (h - 2))
    const x = b * (barWidth + gap)
    const y = h - barHeight

    ctx.fillStyle = levelColor(level)
    ctx.fillRect(x, y, barWidth, barHeight)

    if (level > 0.08) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.fillRect(x, y, barWidth, Math.min(3, barHeight))
    }
  }
}

/**
 * VU meter for voice capture.
 * Pass either analyserNode (MediaRecorder / Web Audio) or level 0–1
 * (SpeechRecognizer onRmsChanged).
 */
export default function VoiceInputWaveform(props) {
  const canvasRef = useRef(null)
  const analyser = props.analyserNode
  const level = typeof props.level === 'number' ? props.level : null
  const levelRef = useRef(level || 0)
  const variant = props.variant === 'field' ? 'field' : 'header'
  const config = VARIANTS[variant]
  const active = Boolean(analyser) || level != null

  useEffect(function() {
    levelRef.current = level != null ? Math.max(0, Math.min(1, level)) : 0
  }, [level])

  useEffect(function() {
    if (!active || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    let frame = 0
    const gap = variant === 'header' ? 2 : 1.5
    const barCount = config.bars

    function draw() {
      frame = requestAnimationFrame(draw)
      const sampleLevels = new Array(barCount)

      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData)
        const binsPerBar = Math.max(1, Math.floor(freqData.length / barCount))
        for (let b = 0; b < barCount; b += 1) {
          let sum = 0
          const start = b * binsPerBar
          const end = Math.min(freqData.length, start + binsPerBar)
          for (let i = start; i < end; i += 1) {
            sum += freqData[i]
          }
          sampleLevels[b] = sum / (end - start) / 255
        }
      } else {
        const base = levelRef.current
        for (let b = 0; b < barCount; b += 1) {
          // Slight per-bar shape so RMS-driven meter looks like the analyser bars.
          const shape = 0.55 + 0.45 * Math.sin((b / Math.max(1, barCount - 1)) * Math.PI)
          const jitter = 0.85 + 0.15 * Math.sin(Date.now() / 90 + b * 0.7)
          sampleLevels[b] = base * shape * jitter
        }
      }

      drawBars(ctx, canvas, barCount, gap, config.gain, sampleLevels)
    }

    draw()
    return function() { cancelAnimationFrame(frame) }
  }, [active, analyser, variant, config.bars, config.gain])

  if (!active) return null

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
