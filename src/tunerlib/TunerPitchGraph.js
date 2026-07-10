import React, { useRef, useEffect } from 'react'
import { IN_TUNE_CENTS } from '../tunerTuningUtils'

const GRAPH_HALF_RANGE = 50
const HISTORY_MS = 10000

function centsToY(cents, height, padding) {
  const inner = height - padding * 2
  const clamped = Math.max(-GRAPH_HALF_RANGE, Math.min(GRAPH_HALF_RANGE, cents))
  const ratio = (GRAPH_HALF_RANGE - clamped) / (GRAPH_HALF_RANGE * 2)
  return padding + ratio * inner
}

function drawPitchGraph(ctx, width, height, history, targetLabel) {
  const paddingLeft = 34
  const paddingRight = 12
  const paddingY = 16
  const now = Date.now()
  const minTime = now - HISTORY_MS

  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, width, height)

  for (let c = -GRAPH_HALF_RANGE; c <= GRAPH_HALF_RANGE; c += 5) {
    const y = centsToY(c, height, paddingY)
    ctx.strokeStyle = c % 10 === 0 ? '#ced4da' : '#e9ecef'
    ctx.lineWidth = c % 10 === 0 ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(paddingLeft, y)
    ctx.lineTo(width - paddingRight, y)
    ctx.stroke()
    if (c % 10 === 0) {
      ctx.fillStyle = '#6c757d'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(c), paddingLeft - 6, y)
    }
  }

  const inTuneTop = centsToY(IN_TUNE_CENTS, height, paddingY)
  const inTuneBottom = centsToY(-IN_TUNE_CENTS, height, paddingY)
  ctx.fillStyle = 'rgba(39, 174, 96, 0.18)'
  ctx.fillRect(paddingLeft, inTuneTop, width - paddingLeft - paddingRight, inTuneBottom - inTuneTop)

  ctx.strokeStyle = '#27ae60'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  const zeroY = centsToY(0, height, paddingY)
  ctx.beginPath()
  ctx.moveTo(paddingLeft, zeroY)
  ctx.lineTo(width - paddingRight, zeroY)
  ctx.stroke()
  ctx.setLineDash([])

  const samples = (history || []).filter(function(s) {
    return s && s.t >= minTime && s.cents != null && Number.isFinite(s.cents)
  })

  if (samples.length > 1) {
    const plotWidth = width - paddingLeft - paddingRight
    ctx.strokeStyle = '#5dade2'
    ctx.lineWidth = 2
    ctx.beginPath()
    samples.forEach(function(sample, index) {
      const x = paddingLeft + ((sample.t - minTime) / HISTORY_MS) * plotWidth
      const y = centsToY(sample.cents, height, paddingY)
      if (index === 0) ctx.moveTo(x, y)
      else {
        const prev = samples[index - 1]
        if (sample.t - prev.t > 200) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
    })
    ctx.stroke()
  }

  if (targetLabel) {
    ctx.fillStyle = '#495057'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(targetLabel, width - paddingRight, paddingY)
  }

  if (samples.length) {
    const last = samples[samples.length - 1]
    const lx = paddingLeft + ((last.t - minTime) / HISTORY_MS) * (width - paddingLeft - paddingRight)
    const ly = centsToY(last.cents, height, paddingY)
    ctx.strokeStyle = '#5dade2'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(lx, ly, 5, 0, Math.PI * 2)
    ctx.stroke()
  }
}

export default function TunerPitchGraph(props) {
  const canvasRef = useRef(null)
  const historyRef = useRef(props.history)
  const targetLabel = props.targetLabel
  const active = props.active !== false

  useEffect(function() {
    historyRef.current = props.history
  }, [props.history])

  useEffect(function() {
    const canvas = canvasRef.current
    if (!canvas || !active) return undefined

    let frameId = 0
    function draw() {
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
      drawPitchGraph(ctx, rect.width, rect.height, historyRef.current, targetLabel)
      frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    return function() {
      cancelAnimationFrame(frameId)
    }
  }, [targetLabel, active])

  return (
    <div className="tuner-pitch-graph">
      <canvas ref={canvasRef} className="tuner-pitch-canvas" />
    </div>
  )
}
