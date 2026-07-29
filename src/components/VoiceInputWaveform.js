import { useEffect, useRef } from 'react'

const VARIANTS = {
  header: { width: 80, height: 24 },
  field: { width: 56, height: 16 },
}

export default function VoiceInputWaveform(props) {
  const canvasRef = useRef(null)
  const analyser = props.analyserNode
  const variant = props.variant === 'field' ? 'field' : 'header'
  const size = VARIANTS[variant]

  useEffect(function() {
    if (!analyser || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0

    function draw() {
      frame = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(data)
      const w = canvas.width
      const h = canvas.height
      const midY = h / 2
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
      ctx.fillRect(0, 0, w, h)
      ctx.beginPath()
      const sliceWidth = w / data.length
      let x = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128
        const y = midY + v * (midY - 1)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.strokeStyle = variant === 'header' ? '#dc3545' : '#6c757d'
      ctx.lineWidth = variant === 'header' ? 1.5 : 1
      ctx.stroke()
    }

    draw()
    return function() { cancelAnimationFrame(frame) }
  }, [analyser, variant])

  if (!analyser) return null

  return (
    <canvas
      ref={canvasRef}
      className={'voice-input-waveform voice-input-waveform--' + variant}
      width={size.width}
      height={size.height}
      title="Input level"
      aria-label="Microphone input waveform"
    />
  )
}
