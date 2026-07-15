import { useEffect, useRef } from 'react'
import { beatToX, midiToY } from '../notation/pianoRollGeometry'
import { IN_TUNE_CENTS } from '../tunerTuningUtils'
import './PracticeWarmupPitchRoll.css'

// First color matches TunerPitchGraph live stroke.
const REP_COLORS = ['#5dade2', '#e67e22', '#1abc9c', '#9b59b6', '#e74c3c', '#f1c40f']
const TRACE_GAP_MS = 200
const PAD_MIDI = 1.5
const ROW_HEIGHT = 18
const MIN_HEIGHT = 220
const PADDING_LEFT = 36
const PADDING_RIGHT = 12
const PADDING_Y = 16

function pitchRangeFromNotes(notes, traces) {
  let min = null
  let max = null
  function consider(midi) {
    if (midi == null || !Number.isFinite(midi)) return
    if (min == null || midi < min) min = midi
    if (max == null || midi > max) max = midi
  }
  ;(notes || []).forEach(function(n) { consider(n.midi) })
  ;(traces || []).forEach(function(trace) {
    ;(trace.points || []).forEach(function(pt) {
      consider(displayMidi(pt))
    })
  })
  if (min == null || max == null) {
    return { min: 55, max: 72 }
  }
  // Extra pad so sharp/flat (±50¢) has room around note boxes.
  return {
    min: Math.max(0, Math.floor(min) - PAD_MIDI - 0.5),
    max: Math.min(127, Math.ceil(max) + PAD_MIDI + 0.5),
  }
}

/**
 * Continuous pitch on the piano-roll scale: expected note ± cents/100.
 * Falls back to absolute midi when no expected note is known.
 */
function displayMidi(pt) {
  if (!pt) return null
  if (pt.expectedMidi != null && pt.cents != null && Number.isFinite(pt.cents)) {
    return pt.expectedMidi + pt.cents / 100
  }
  if (pt.midi != null && Number.isFinite(pt.midi)) return pt.midi
  if (pt.rawMidi != null && Number.isFinite(pt.rawMidi)) return pt.rawMidi
  return null
}

/** Pixel Y for a continuous MIDI pitch (note-box center at integer MIDI). */
function pitchToY(midi, range, rowHeight) {
  return PADDING_Y + midiToY(midi, range, rowHeight) + rowHeight / 2
}

function pointXY(pt, beatWidth, range, rowHeight) {
  return {
    x: PADDING_LEFT + beatToX(pt.beat, beatWidth),
    y: pitchToY(displayMidi(pt), range, rowHeight),
  }
}

function isTraceGap(prev, next) {
  if (!prev) return true
  if (next.beat < prev.beat - 0.05) return true
  if (next.timeMs != null && prev.timeMs != null && next.timeMs - prev.timeMs > TRACE_GAP_MS) {
    return true
  }
  if (next.beat - prev.beat > 0.75) return true
  return false
}

function drawLiveTrace(ctx, points, color, beatWidth, range, rowHeight) {
  const usable = (points || []).filter(function(pt) {
    return displayMidi(pt) != null
  })
  if (!usable.length) return

  // Tuner-style continuous stroke with silence gaps.
  if (usable.length > 1) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    let prev = null
    usable.forEach(function(pt, index) {
      const xy = pointXY(pt, beatWidth, range, rowHeight)
      if (index === 0 || isTraceGap(prev, pt)) ctx.moveTo(xy.x, xy.y)
      else ctx.lineTo(xy.x, xy.y)
      prev = pt
    })
    ctx.stroke()
  }

  const last = usable[usable.length - 1]
  const tip = pointXY(last, beatWidth, range, rowHeight)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2)
  ctx.stroke()
}

function drawRoll(ctx, width, height, props) {
  const notes = props.expectedNotes || []
  const traces = props.repTraces || []
  const patternBeats = Math.max(1, props.patternDurationBeats || 1)
  const playheadBeat = props.playheadBeat || 0
  const range = pitchRangeFromNotes(notes, traces)
  const innerW = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT)
  const innerH = Math.max(1, height - PADDING_Y * 2)
  const beatWidth = innerW / patternBeats
  const rowHeight = Math.max(10, innerH / Math.max(1, range.max - range.min))

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, width, height)

  // Pitch grid (semitone rows)
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
    if (midi % 12 === 0) {
      ctx.fillStyle = '#6c757d'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(midi), PADDING_LEFT - 6, y)
    }
  }

  // Piano-roll expected notes (behind the heard-pitch line)
  notes.forEach(function(note) {
    const x = PADDING_LEFT + beatToX(note.startBeat, beatWidth)
    const w = Math.max(4, beatToX(Math.max(0.05, note.endBeat - note.startBeat), beatWidth))
    const centerY = pitchToY(note.midi, range, rowHeight)
    const noteH = Math.max(6, rowHeight * 0.7)
    const y = centerY - noteH / 2

    // Soft in-tune corridor (±IN_TUNE_CENTS) around the note pitch
    const inTuneHalf = (IN_TUNE_CENTS / 100) * rowHeight
    ctx.fillStyle = 'rgba(39, 174, 96, 0.14)'
    ctx.fillRect(x, centerY - inTuneHalf, w, inTuneHalf * 2)

    ctx.fillStyle = 'rgba(100, 116, 139, 0.28)'
    ctx.fillRect(x, y, w, noteH)
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, noteH)

    // On-pitch dashed line through the note (like tuner's zero, but at note pitch)
    ctx.strokeStyle = '#27ae60'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x, centerY)
    ctx.lineTo(x + w, centerY)
    ctx.stroke()
    ctx.setLineDash([])
  })

  // Heard pitch line segments (tuner style) on the same pitch scale
  const ordered = traces.slice().sort(function(a, b) {
    return (a.repIndex || 0) - (b.repIndex || 0)
  })
  ordered.forEach(function(trace) {
    const color = REP_COLORS[trace.repIndex % REP_COLORS.length]
    drawLiveTrace(ctx, trace.points || [], color, beatWidth, range, rowHeight)
  })

  const playX = PADDING_LEFT + beatToX(Math.max(0, Math.min(patternBeats, playheadBeat)), beatWidth)
  ctx.strokeStyle = '#adb5bd'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(playX, PADDING_Y)
  ctx.lineTo(playX, height - PADDING_Y)
  ctx.stroke()
  ctx.setLineDash([])

  if (traces.length) {
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let legendX = PADDING_LEFT
    traces.forEach(function(trace) {
      const color = REP_COLORS[trace.repIndex % REP_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(legendX, 8)
      ctx.lineTo(legendX + 14, 8)
      ctx.stroke()
      ctx.fillStyle = '#495057'
      ctx.fillText('Rep ' + (trace.repIndex + 1), legendX + 18, 2)
      legendX += 72
    })
  }
}

export default function PracticeWarmupPitchRoll(props) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(function() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined

    let raf = null
    let disposed = false

    function paint() {
      if (disposed) return
      const latest = propsRef.current || {}
      const dpr = window.devicePixelRatio || 1
      const cssW = Math.max(280, wrap.clientWidth || 280)
      const range = pitchRangeFromNotes(latest.expectedNotes, latest.repTraces)
      const rows = Math.max(8, range.max - range.min)
      const cssH = Math.max(MIN_HEIGHT, rows * ROW_HEIGHT + PADDING_Y * 2)
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr)
        canvas.height = Math.floor(cssH * dpr)
        canvas.style.width = cssW + 'px'
        canvas.style.height = cssH + 'px'
      }
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawRoll(ctx, cssW, cssH, latest)
    }

    function loop() {
      paint()
      raf = requestAnimationFrame(loop)
    }
    loop()

    const onResize = function() { paint() }
    window.addEventListener('resize', onResize)
    return function() {
      disposed = true
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="practice-warmup-pitch-roll" ref={wrapRef}>
      <div className="practice-warmup-pitch-roll-title">Heard pitch on warmup notes</div>
      <canvas
        ref={canvasRef}
        className="practice-warmup-pitch-roll-canvas"
        aria-label="Warmup pitch piano roll with live pitch"
      />
    </div>
  )
}

export { REP_COLORS, pitchRangeFromNotes, displayMidi }
