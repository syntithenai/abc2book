import { useEffect, useRef } from 'react'

export default function ScratchpadAudioInputMeter(props) {
  const canvasRef = useRef(null)
  const analyser = props.analyserNode

  useEffect(function() {
    if (!analyser || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0

    function draw() {
      frame = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      const level = Math.min(1, rms * 4)
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#dee2e6'
      ctx.fillRect(0, 0, w, h)
      const barW = Math.max(1, Math.round(level * w))
      ctx.fillStyle = level > 0.85 ? '#dc3545' : level > 0.5 ? '#ffc107' : '#28a745'
      ctx.fillRect(0, 0, barW, h)
    }

    draw()
    return function() { cancelAnimationFrame(frame) }
  }, [analyser])

  if (!analyser) {
    return (
      <span className="scratchpad-audio-input-meter scratchpad-audio-input-meter--idle" title="No microphone input">
        Mic
      </span>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="scratchpad-audio-input-meter"
      width={48}
      height={10}
      title="Input level"
      aria-label="Input level"
    />
  )
}
