import { useEffect, useRef } from 'react'
import { beatToX, midiToY } from '../notation/pianoRollGeometry'
import { IN_TUNE_CENTS, midiToNoteName } from '../tunerTuningUtils'
import './PracticeWarmupPitchRoll.css'

// First color matches TunerPitchGraph live stroke.
const REP_COLORS = ['#5dade2', '#e67e22', '#1abc9c', '#9b59b6', '#e74c3c', '#f1c40f']
const TRACE_GAP_MS = 200
const ROW_HEIGHT = 18
const MIN_HEIGHT = 160
const PADDING_LEFT = 48
const PADDING_RIGHT = 12
const PADDING_Y = 16
/** Floor so a single pitch still has usable room for ±cents. */
const MIN_NOTE_SPAN = 4

/**
 * Canvas pitch window: expected note range, plus half that span above and below.
 * Live traces do not expand the window (avoids a tall blank area above low notes).
 */
function pitchRangeFromNotes(notes) {
  let min = null
  let max = null
  ;(notes || []).forEach(function(n) {
    if (n == null || n.midi == null || !Number.isFinite(n.midi)) return
    if (min == null || n.midi < min) min = n.midi
    if (max == null || n.midi > max) max = n.midi
  })
  if (min == null || max == null) {
    return { min: 55, max: 72 }
  }
  const span = Math.max(MIN_NOTE_SPAN, max - min)
  const pad = span / 2
  return {
    min: Math.max(0, min - pad),
    max: Math.min(127, max + pad),
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
  // Rep restart / seek backwards
  if (next.beat < prev.beat - 0.05) return true
  // Silence / dropout (same as TunerPitchGraph)
  if (next.timeMs != null && prev.timeMs != null && next.timeMs - prev.timeMs > TRACE_GAP_MS) {
    return true
  }
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
  const range = pitchRangeFromNotes(notes)
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
      ctx.fillText(midiToNoteName(midi) || String(midi), PADDING_LEFT - 6, pitchToY(midi, range, rowHeight))
    }
  }

  const noteLabels = {}
  notes.forEach(function(note) {
    if (note && Number.isFinite(note.midi)) noteLabels[Math.round(note.midi)] = true
  })
  Object.keys(noteLabels).map(Number).forEach(function(midi) {
    if (midi % 12 === 0) return
    const label = midiToNoteName(midi)
    if (!label) return
    ctx.fillStyle = '#6c757d'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, PADDING_LEFT - 6, pitchToY(midi, range, rowHeight))
  })

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
      const host = wrap.parentElement || wrap
      const cssW = Math.max(280, wrap.clientWidth || host.clientWidth || 280)
      const cssH = Math.max(MIN_HEIGHT, wrap.clientHeight || 160)
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
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(onResize)
      observer.observe(wrap)
    }
    return function() {
      disposed = true
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (observer) observer.disconnect()
    }
  }, [])

  return (
    <div className="practice-warmup-pitch-roll">
      <div className="practice-warmup-pitch-roll-title">Heard pitch on warmup notes</div>
      <div className="practice-warmup-pitch-roll-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="practice-warmup-pitch-roll-canvas"
          aria-label="Warmup pitch piano roll with live pitch"
        />
      </div>
    </div>
  )
}

export { REP_COLORS, pitchRangeFromNotes, displayMidi }
