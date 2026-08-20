import { useEffect, useRef } from 'react'
import { beatToX, midiToY } from '../notation/pianoRollGeometry'
import { pitchRangeFromNotes } from './PracticeWarmupPitchRoll'
import { takeWaveformOpacity } from '../playalongLineNotes'

const PADDING_LEFT = 8
const PADDING_RIGHT = 8
const PADDING_Y = 8
const MIN_HEIGHT = 72

function pitchToY(midi, range, rowHeight) {
  return PADDING_Y + midiToY(midi, range, rowHeight) + rowHeight / 2
}

function peakScale(peaks) {
  let loudest = 0
  ;(peaks || []).forEach(function(peak) {
    if (!peak) return
    const hi = Math.abs(peak.max || 0)
    const lo = Math.abs(peak.min || 0)
    if (hi > loudest) loudest = hi
    if (lo > loudest) loudest = lo
  })
  if (loudest < 0.02) return 8
  return 0.92 / loudest
}

function drawWaveform(ctx, peaks, startBeat, endBeat, beatWidth, height, color, opacity) {
  if (!peaks || !peaks.length) return
  const span = Math.max(0.05, endBeat - startBeat)
  const mid = height / 2
  const amp = Math.max(2, (height / 2 - 4))
  const scale = peakScale(peaks)
  const xs = []
  const yMaxs = []
  const yMins = []
  peaks.forEach(function(peak, i) {
    const beat = peak.beat != null ? peak.beat : startBeat + (i / Math.max(1, peaks.length - 1)) * span
    xs.push(PADDING_LEFT + beatToX(beat - startBeat, beatWidth))
    const max = Math.max(0.08, (peak.max || 0) * scale)
    const min = Math.min(-0.08, (peak.min || 0) * scale)
    yMaxs.push(mid - max * amp)
    yMins.push(mid - min * amp)
  })
  ctx.save()
  ctx.beginPath()
  xs.forEach(function(x, i) {
    if (i === 0) ctx.moveTo(x, yMaxs[i])
    else ctx.lineTo(x, yMaxs[i])
  })
  for (let i = xs.length - 1; i >= 0; i -= 1) {
    ctx.lineTo(xs[i], yMins[i])
  }
  ctx.closePath()
  ctx.globalAlpha = opacity * 0.55
  ctx.fillStyle = color
  ctx.fill()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

function drawNotes(ctx, notes, startBeat, beatWidth, range, rowHeight) {
  ;(notes || []).forEach(function(note) {
    const localStart = Math.max(0, note.startBeat - startBeat)
    const localDur = Math.max(0.05, note.endBeat - note.startBeat)
    const x = PADDING_LEFT + beatToX(localStart, beatWidth)
    const w = Math.max(4, beatToX(localDur, beatWidth))
    const centerY = pitchToY(note.midi, range, rowHeight)
    const noteH = Math.max(6, rowHeight * 0.7)
    ctx.fillStyle = 'rgba(100, 116, 139, 0.55)'
    ctx.fillRect(x, centerY - noteH / 2, w, noteH)
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, centerY - noteH / 2, w, noteH)
  })
}

function drawLine(ctx, width, height, props) {
  const notes = props.notes || []
  const startBeat = props.startBeat || 0
  const endBeat = props.endBeat > startBeat ? props.endBeat : startBeat + 1
  const takes = props.takes || []
  const range = pitchRangeFromNotes(notes)
  const innerW = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT)
  const innerH = Math.max(1, height - PADDING_Y * 2)
  const beatWidth = innerW / Math.max(0.25, endBeat - startBeat)
  const rowHeight = Math.max(8, innerH / Math.max(1, range.max - range.min))

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, width, height)

  const midiStart = Math.floor(range.min)
  const midiEnd = Math.ceil(range.max)
  for (let midi = midiStart; midi <= midiEnd; midi += 1) {
    const y = PADDING_Y + midiToY(midi, range, rowHeight)
    ctx.strokeStyle = midi % 12 === 0 ? '#ced4da' : '#e9ecef'
    ctx.lineWidth = midi % 12 === 0 ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(PADDING_LEFT, y)
    ctx.lineTo(width - PADDING_RIGHT, y)
    ctx.stroke()
  }

  takes.forEach(function(take, index) {
    drawWaveform(
      ctx,
      take.linePeaks || [],
      startBeat,
      endBeat,
      beatWidth,
      height,
      '#2563eb',
      takeWaveformOpacity(index, takes.length)
    )
  })

  drawNotes(ctx, notes, startBeat, beatWidth, range, rowHeight)
}

export default function PlayalongLineRoll(props) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(function() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined

    let disposed = false
    function paint() {
      if (disposed) return
      const latest = propsRef.current || {}
      const dpr = window.devicePixelRatio || 1
      const cssW = Math.max(160, wrap.clientWidth || 160)
      const cssH = Math.max(MIN_HEIGHT, latest.height || MIN_HEIGHT)
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      canvas.style.width = cssW + 'px'
      canvas.style.height = cssH + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawLine(ctx, cssW, cssH, latest)
    }

    paint()
    const onResize = function() { paint() }
    window.addEventListener('resize', onResize)
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onResize)
      observer.observe(wrap)
    }
    return function() {
      disposed = true
      window.removeEventListener('resize', onResize)
      if (observer) observer.disconnect()
    }
  }, [props.notes, props.takes, props.startBeat, props.endBeat])

  return (
    <div className="playalong-line-roll" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="playalong-line-roll-canvas"
        aria-label={props.label || 'Play-along piano roll'}
      />
    </div>
  )
}
