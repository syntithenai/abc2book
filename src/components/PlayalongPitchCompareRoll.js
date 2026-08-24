import { useEffect, useMemo, useRef } from 'react'
import { beatToX, midiToY } from '../notation/pianoRollGeometry'
import { alignedX } from '../playalongStaffLayout'
import { IN_TUNE_CENTS, midiToNoteName } from '../tunerTuningUtils'
import {
  buildLiveOverlayTracesForLine,
  livePitchTipInLineRange,
} from '../playalongLineNotes'
import { REP_COLORS } from './PracticeWarmupPitchRoll'

const ROW_HEIGHT = 8
const PADDING_LEFT = 48
const PADDING_RIGHT = 12
const PADDING_Y = 6
const MIN_BEAT_WIDTH = 42
const TRACE_GAP_MS = 650
const TRACE_JUMP_SEMITONES = 4
/** Room around the line's notes for the in-tune corridor, not extra empty octaves. */
const PITCH_PAD = 0.85
/** How far heard pitches may expand the roll beyond the written notes. */
const HEARD_PAD = 1.25
const HEARD_EXPAND_SEMITONES = 8
const MIN_ROLL_HEIGHT = 24
const LIVE_TRACE_COLOR = '#5dade2'

/** Prefer harmonic/octave-folded MIDI when it lands near the written note so
 * whistle overtones don't draw an octave above an otherwise accurate take.
 * Truly wrong notes still use the raw heard pitch.
 */
export function displayMidi(pt) {
  if (!pt) return null
  if (
    pt.foldedMidi != null && Number.isFinite(pt.foldedMidi)
    && pt.expectedMidi != null && Number.isFinite(pt.expectedMidi)
    && Math.abs(pt.foldedMidi - pt.expectedMidi) <= 0.65
  ) {
    return pt.foldedMidi
  }
  if (pt.sourceMidi != null && Number.isFinite(pt.sourceMidi)) return pt.sourceMidi
  if (pt.rawMidi != null && Number.isFinite(pt.rawMidi)) return pt.rawMidi
  if (pt.midi != null && Number.isFinite(pt.midi)) return pt.midi
  return null
}

export function tightPitchRangeFromNotes(notes, repTraces) {
  let min = null
  let max = null
  ;(notes || []).forEach(function(n) {
    if (n == null || n.midi == null || !Number.isFinite(n.midi)) return
    if (min == null || n.midi < min) min = n.midi
    if (max == null || n.midi > max) max = n.midi
  })
  if (min == null || max == null) {
    return { min: 60, max: 61.7 }
  }
  const writtenMin = min
  const writtenMax = max
  const heardFloor = writtenMin - HEARD_EXPAND_SEMITONES
  const heardCeil = writtenMax + HEARD_EXPAND_SEMITONES
  ;(repTraces || []).forEach(function(trace) {
    ;(trace && trace.points || []).forEach(function(pt) {
      const midi = displayMidi(pt)
      if (midi == null || !Number.isFinite(midi)) return
      const clamped = Math.max(heardFloor, Math.min(heardCeil, midi))
      if (clamped < min) min = clamped
      if (clamped > max) max = clamped
    })
  })
  return {
    min: Math.max(0, min - (min < writtenMin ? HEARD_PAD : PITCH_PAD)),
    max: Math.min(127, max + (max > writtenMax ? HEARD_PAD : PITCH_PAD)),
  }
}

export function playalongRollHeight(notes, repTraces) {
  const range = tightPitchRangeFromNotes(notes, repTraces)
  const span = Math.max(1.2, range.max - range.min)
  return Math.max(MIN_ROLL_HEIGHT, Math.round(PADDING_Y * 2 + span * ROW_HEIGHT))
}

function barBeatsForRoll(props) {
  if (Array.isArray(props.barBeats) && props.barBeats.length) return props.barBeats
  const beatsPerBar = Number(props.beatsPerBar)
  const patternBeats = Math.max(1, props.patternDurationBeats || 1)
  if (!(beatsPerBar > 0)) return []
  const beats = []
  for (let beat = 0; beat <= patternBeats + 0.0001; beat += beatsPerBar) {
    beats.push(beat)
  }
  return beats
}

function pitchToY(midi, range, rowHeight) {
  return PADDING_Y + midiToY(midi, range, rowHeight) + rowHeight / 2
}

function timeX(beat, props, beatWidth) {
  const fallback = PADDING_LEFT + beatToX(beat, beatWidth)
  if (props.beatAnchors && props.beatAnchors.length) {
    return alignedX(beat, props.beatAnchors, fallback)
  }
  return fallback
}

function pointXY(pt, props, beatWidth, range, rowHeight) {
  return {
    x: timeX(pt.beat, props, beatWidth),
    y: pitchToY(displayMidi(pt), range, rowHeight),
  }
}

function resolveTraceStyle(props) {
  const style = props && props.traceStyle
  const gapMs = style && Number.isFinite(style.gapMs) && style.gapMs > 0
    ? style.gapMs
    : TRACE_GAP_MS
  const maxJumpSemitones = style && Number.isFinite(style.maxJumpSemitones) && style.maxJumpSemitones > 0
    ? style.maxJumpSemitones
    : TRACE_JUMP_SEMITONES
  return { gapMs: gapMs, maxJumpSemitones: maxJumpSemitones }
}

export function isTraceGap(prev, next, style) {
  if (!prev) return true
  if (next.beat < prev.beat - 0.05) return true
  const gapMs = style && Number.isFinite(style.gapMs) && style.gapMs > 0
    ? style.gapMs
    : TRACE_GAP_MS
  const maxJump = style && Number.isFinite(style.maxJumpSemitones) && style.maxJumpSemitones > 0
    ? style.maxJumpSemitones
    : TRACE_JUMP_SEMITONES
  if (next.timeMs != null && prev.timeMs != null && next.timeMs - prev.timeMs > gapMs) return true
  const prevMidi = displayMidi(prev)
  const nextMidi = displayMidi(next)
  if (prevMidi != null && nextMidi != null && Math.abs(nextMidi - prevMidi) > maxJump) return true
  return false
}

function drawLiveTrace(ctx, points, color, props, beatWidth, range, rowHeight) {
  const usable = (points || []).filter(function(pt) {
    return displayMidi(pt) != null
  })
  if (!usable.length) return
  const style = resolveTraceStyle(props)
  if (usable.length > 1) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    let prev = null
    usable.forEach(function(pt, index) {
      const xy = pointXY(pt, props, beatWidth, range, rowHeight)
      if (index === 0 || isTraceGap(prev, pt, style)) ctx.moveTo(xy.x, xy.y)
      else ctx.lineTo(xy.x, xy.y)
      prev = pt
    })
    ctx.stroke()
  }
  const last = usable[usable.length - 1]
  const tip = pointXY(last, props, beatWidth, range, rowHeight)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2)
  ctx.stroke()
}

function axisLabelMidis(range, notes) {
  const seen = {}
  const start = Math.ceil(range.min)
  const end = Math.floor(range.max)
  for (let midi = start; midi <= end; midi += 1) {
    if (midi % 12 === 0) seen[midi] = true
  }
  ;(notes || []).forEach(function(note) {
    if (!note || !Number.isFinite(note.midi)) return
    seen[Math.round(note.midi)] = true
  })
  return Object.keys(seen).map(Number).sort(function(a, b) { return b - a })
}

function drawRoll(ctx, width, height, props, liveTraces) {
  const notes = props.expectedNotes || []
  const traces = (props.repTraces || []).concat(Array.isArray(liveTraces) ? liveTraces : [])
  const patternBeats = Math.max(1, props.patternDurationBeats || 1)
  const range = tightPitchRangeFromNotes(notes, traces)
  const innerW = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT)
  const innerH = Math.max(1, height - PADDING_Y * 2)
  const beatWidth = innerW / patternBeats
  const rowHeight = innerH / Math.max(0.001, range.max - range.min)
  const staffTop = PADDING_Y
  const staffBottom = height - PADDING_Y
  const xLeft = Number.isFinite(props.staffLeft) ? props.staffLeft : PADDING_LEFT
  const xRight = Number.isFinite(props.staffRight) ? props.staffRight : width - PADDING_RIGHT
  const barXs = Array.isArray(props.barXs) && props.barXs.length
    ? props.barXs
    : barBeatsForRoll(props).map(function(beat) {
      return timeX(beat, props, beatWidth)
    })

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
    ctx.moveTo(xLeft, y)
    ctx.lineTo(xRight, y)
    ctx.stroke()
    if (midi % 12 === 0) {
      ctx.fillStyle = '#6c757d'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(midiToNoteName(midi) || String(midi), PADDING_LEFT - 6, pitchToY(midi, range, rowHeight))
    }
  }

  axisLabelMidis(range, notes).forEach(function(midi) {
    if (midi % 12 === 0) return
    const label = midiToNoteName(midi)
    if (!label) return
    ctx.fillStyle = '#6c757d'
    ctx.font = '8px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, PADDING_LEFT - 6, pitchToY(midi, range, rowHeight))
  })

  barXs.forEach(function(x) {
    if (!Number.isFinite(x)) return
    ctx.strokeStyle = '#868e96'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, staffTop)
    ctx.lineTo(x, staffBottom)
    ctx.stroke()
  })

  notes.forEach(function(note) {
    const x = timeX(note.startBeat, props, beatWidth)
    const x2 = timeX(note.endBeat, props, beatWidth)
    const w = Math.max(3, x2 - x)
    const centerY = pitchToY(note.midi, range, rowHeight)
    const noteH = Math.max(4, rowHeight * 0.7)
    const y = centerY - noteH / 2
    const inTuneHalf = (IN_TUNE_CENTS / 100) * rowHeight
    ctx.fillStyle = 'rgba(39, 174, 96, 0.14)'
    ctx.fillRect(x, centerY - inTuneHalf, w, inTuneHalf * 2)
    ctx.fillStyle = 'rgba(100, 116, 139, 0.28)'
    ctx.fillRect(x, y, w, noteH)
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, noteH)
    ctx.strokeStyle = '#27ae60'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(x, centerY)
    ctx.lineTo(x + w, centerY)
    ctx.stroke()
    ctx.setLineDash([])
  })

  traces.forEach(function(trace) {
    const color = trace && trace.live
      ? LIVE_TRACE_COLOR
      : REP_COLORS[(trace.repIndex || 0) % REP_COLORS.length]
    drawLiveTrace(ctx, trace.points || [], color, props, beatWidth, range, rowHeight)
  })
}

export function paintLiveOverlayFromSnapshot(props, snapshot) {
  if (!props || !props.line || typeof props.getLivePitchSnapshot !== 'function' && !snapshot) {
    return []
  }
  const snap = snapshot || (typeof props.getLivePitchSnapshot === 'function'
    ? props.getLivePitchSnapshot()
    : null)
  if (!snap || !Array.isArray(snap.points) || !snap.points.length) return []
  const mapOpts = {
    musicStartOffsetSeconds: snap.musicStartOffsetSeconds,
    tempoBpm: snap.tempoBpm,
    playbackSpeed: props.playbackSpeed,
  }
  if (!livePitchTipInLineRange(snap.points, props.line, mapOpts)) return []
  return buildLiveOverlayTracesForLine(props.line, snap.points, Object.assign({}, mapOpts, {
    soundingMap: props.soundingMap,
  }))
}

export default function PlayalongPitchCompareRoll(props) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const contentWidth = useMemo(function() {
    const beats = Math.max(1, props.patternDurationBeats || 1)
    if (props.fitWidth) return 0
    return Math.max(320, Math.ceil(PADDING_LEFT + PADDING_RIGHT + beats * MIN_BEAT_WIDTH))
  }, [props.patternDurationBeats, props.fitWidth])
  const autoHeight = playalongRollHeight(props.expectedNotes, props.repTraces)
  const liveOverlay = !!(props.liveOverlay && typeof props.getLivePitchSnapshot === 'function')

  useEffect(function() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined

    let raf = null
    let lastVersion = -1
    let lastHadLive = false
    let stopped = false

    function paint(liveTraces) {
      const p = propsRef.current
      const dpr = window.devicePixelRatio || 1
      const cssW = p.fitWidth
        ? Math.max(160, wrap.clientWidth || 160)
        : Math.max(contentWidth, wrap.clientWidth || contentWidth)
      const cssH = p.height > 0 ? p.height : autoHeight
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      canvas.style.width = cssW + 'px'
      canvas.style.height = cssH + 'px'
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawRoll(ctx, cssW, cssH, p, liveTraces)
    }

    function paintStatic() {
      paint(null)
    }

    function tick() {
      if (stopped) return
      const p = propsRef.current
      if (!(p.liveOverlay && typeof p.getLivePitchSnapshot === 'function')) {
        paintStatic()
        return
      }
      const snap = p.getLivePitchSnapshot()
      const version = snap && Number.isFinite(snap.version) ? snap.version : 0
      const liveTraces = paintLiveOverlayFromSnapshot(p, snap)
      const hasLive = !!(liveTraces && liveTraces.length)
      if (version === lastVersion && !hasLive && !lastHadLive) {
        raf = requestAnimationFrame(tick)
        return
      }
      lastVersion = version
      lastHadLive = hasLive
      paint(liveTraces)
      raf = requestAnimationFrame(tick)
    }

    paintStatic()
    if (liveOverlay) {
      raf = requestAnimationFrame(tick)
    }

    const onResize = function() {
      if (liveOverlay) return
      paintStatic()
    }
    window.addEventListener('resize', onResize)
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(function() {
        if (liveOverlay) return
        paintStatic()
      })
      observer.observe(wrap)
    }
    return function() {
      stopped = true
      window.removeEventListener('resize', onResize)
      if (observer) observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [
    contentWidth,
    autoHeight,
    liveOverlay,
    props.fitWidth,
    props.expectedNotes,
    props.repTraces,
    props.patternDurationBeats,
    props.height,
    props.barBeats,
    props.beatsPerBar,
    props.barXs,
    props.beatAnchors,
    props.staffLeft,
    props.staffRight,
    props.line,
    props.playbackSpeed,
    props.soundingMap,
    props.traceStyle,
  ])

  return (
    <div className="playalong-pitch-roll">
      <div className="playalong-pitch-roll-scroll" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="playalong-pitch-roll-canvas"
          aria-label={props.label || 'Play-along pitch compare'}
        />
      </div>
    </div>
  )
}
