import React, { useRef, useEffect } from 'react'
import { formatCents, formatFrequency, smoothNeedleCents, smoothNeedleRange } from './tunerDisplayUtils'

function meterAccent(cents) {
  if (cents == null) return '#2c3e50'
  const abs = Math.abs(cents)
  if (abs <= 5) return '#27ae60'
  if (abs <= 15) return '#f39c12'
  return '#e74c3c'
}

function drawArcMeter(ctx, width, height, cents, halfRange, inTuneFlash) {
  const cx = width / 2
  const cy = height - 24
  const radius = Math.min(width * 0.42, height - 70)
  const startAngle = Math.PI
  const endAngle = 2 * Math.PI
  const range = halfRange > 0 ? halfRange : 50

  ctx.clearRect(0, 0, width, height)

  if (inTuneFlash) {
    ctx.fillStyle = 'rgba(39, 174, 96, 0.12)'
    ctx.fillRect(0, 0, width, height)
  }

  ctx.strokeStyle = '#dee2e6'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, radius, startAngle, endAngle)
  ctx.stroke()

  const majorStep = range <= 6 ? 1 : range <= 12 ? 2 : range <= 25 ? 5 : 10
  for (let c = -range; c <= range; c += majorStep) {
    const angle = Math.PI + ((c + range) / (range * 2)) * Math.PI
    const inner = radius - (c % (majorStep * 2) === 0 ? 18 : 10)
    const outer = radius
    const x1 = cx + Math.cos(angle) * inner
    const y1 = cy + Math.sin(angle) * inner
    const x2 = cx + Math.cos(angle) * outer
    const y2 = cy + Math.sin(angle) * outer
    ctx.strokeStyle = c === 0 ? '#f1c40f' : '#adb5bd'
    ctx.lineWidth = c === 0 ? 3 : 1.5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    if (c % (majorStep * 2) === 0 || majorStep >= range) {
      ctx.fillStyle = '#6c757d'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelRadius = radius + 16
      const lx = cx + Math.cos(angle) * labelRadius
      const ly = cy + Math.sin(angle) * labelRadius
      ctx.fillText(String(Math.round(c)), lx, ly)
    }
  }

  if (cents == null) return

  const needleColor = meterAccent(cents)
  const clamped = Math.max(-range, Math.min(range, cents || 0))
  const needleAngle = -Math.PI / 2 + (clamped / range) * (Math.PI / 2)

  ctx.fillStyle = '#f8f9fa'
  ctx.beginPath()
  ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ced4da'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(needleAngle)
  ctx.fillStyle = needleColor
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-5, 12)
  ctx.lineTo(0, -radius + 8)
  ctx.lineTo(5, 12)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export default function TunerVuMeter(props) {
  const canvasRef = useRef(null)
  const targetCentsRef = useRef(props.cents)
  const targetRangeRef = useRef(props.halfRange || 50)
  const smoothedCentsRef = useRef(props.cents)
  const smoothedRangeRef = useRef(props.halfRange || 50)
  const inTuneFlashRef = useRef(props.inTuneFlash)

  useEffect(function() {
    targetCentsRef.current = props.cents
  }, [props.cents])

  useEffect(function() {
    targetRangeRef.current = props.halfRange || 50
  }, [props.halfRange])

  useEffect(function() {
    inTuneFlashRef.current = props.inTuneFlash
  }, [props.inTuneFlash])

  useEffect(function() {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let frameId = 0
    let lastTs = performance.now()

    function drawFrame(ts) {
      const delta = Math.min(48, Math.max(1, ts - lastTs))
      lastTs = ts

      const targetCents = targetCentsRef.current
      const targetRange = targetRangeRef.current

      smoothedRangeRef.current = smoothNeedleRange(
        smoothedRangeRef.current,
        targetRange,
        delta
      )

      if (targetCents != null && Number.isFinite(targetCents)) {
        smoothedCentsRef.current = smoothNeedleCents(
          smoothedCentsRef.current,
          targetCents,
          delta
        )
      }

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawArcMeter(
        ctx,
        rect.width,
        rect.height,
        smoothedCentsRef.current,
        smoothedRangeRef.current,
        inTuneFlashRef.current
      )

      frameId = requestAnimationFrame(drawFrame)
    }

    frameId = requestAnimationFrame(drawFrame)
    return function() {
      cancelAnimationFrame(frameId)
    }
  }, [])

  const displayCents = props.cents
  const readoutClass = 'tuner-readout' + (props.isHeld ? ' tuner-readout-held' : '')

  return (
    <div className="tuner-vu-meter">
      <canvas ref={canvasRef} className="tuner-vu-canvas" />
      <div className={readoutClass} style={{ color: meterAccent(displayCents) }}>
        {props.noteLabel ? (
          <div className="tuner-readout-note">{props.noteLabel}</div>
        ) : null}
        <div className="tuner-readout-cents">{formatCents(displayCents)}</div>
        <div className="tuner-readout-freq">{formatFrequency(props.frequency)}</div>
        {props.isHeld ? (
          <div className="tuner-readout-held-label">Last reading</div>
        ) : null}
      </div>
    </div>
  )
}
