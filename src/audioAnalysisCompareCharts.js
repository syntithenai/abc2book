/** Canvas charts shared by Compare UI and PDF export. */
import { averageSpectrum } from './soundpostAnalysis'

/**
 * Build spectrum series for L (radiated) and optional R (piezo) overlays.
 * Pure helper for Compare UI / PDF / tests.
 */
export function buildStereoSpectrumSeries(baseline, candidate) {
  const series = [
    { spec: averageSpectrum(baseline && baseline.notes), color: '#5dade2', dashed: false, label: 'A L' },
    { spec: averageSpectrum(candidate && candidate.notes), color: '#e74c3c', dashed: false, label: 'B L' }
  ]
  const baseR = averageSpectrum(baseline && baseline.notes, 'featuresR')
  const candR = averageSpectrum(candidate && candidate.notes, 'featuresR')
  if (baseR) series.push({ spec: baseR, color: '#1a5276', dashed: true, label: 'A R' })
  if (candR) series.push({ spec: candR, color: '#922b21', dashed: true, label: 'B R' })
  return series
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object|null} baseline — spectrum or set (if options.fromSets)
 * @param {object|null} candidate
 * @param {object} [options] — { fromSets?: boolean } when baseline/candidate are full sets
 */
export function drawSpectrum(canvas, baseline, candidate, options) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, w, h)

  const opts = options || {}
  const series = opts.fromSets
    ? buildStereoSpectrumSeries(baseline, candidate)
    : [
      { spec: baseline, color: '#5dade2', dashed: false, label: 'Baseline (A)' },
      { spec: candidate, color: '#e74c3c', dashed: false, label: 'Candidate (B)' }
    ]

  function plot(spec, color, dashed) {
    if (!spec || !spec.spectrumDb || !spec.spectrumDb.length) return
    const db = spec.spectrumDb
    const freqs = spec.spectrumFreqs || []
    const maxF = 4000
    ctx.strokeStyle = color
    ctx.lineWidth = dashed ? 1.25 : 1.5
    if (dashed) ctx.setLineDash([5, 4])
    else ctx.setLineDash([])
    ctx.beginPath()
    let started = false
    for (let i = 0; i < db.length; i++) {
      const f = freqs[i] != null ? freqs[i] : (i * maxF) / db.length
      if (f > maxF) break
      const x = (f / maxF) * w
      const y = h - ((db[i] + 100) / 100) * h
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  series.forEach(function(s) {
    plot(s.spec, s.color, s.dashed)
  })

  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#6c757d'
  ctx.fillText('0 Hz', 4, h - 4)
  ctx.fillText('4 kHz', w - 36, h - 4)
  let legendX = 8
  series.forEach(function(s) {
    if (!s.spec) return
    ctx.fillStyle = s.color
    ctx.fillText(s.label + (s.dashed ? ' (piezo)' : ''), legendX, 14)
    legendX += opts.fromSets ? 72 : 100
  })
}

export function drawSaunders(canvas, baselineNotes, candidateNotes) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, w, h)

  function levels(notes) {
    return (notes || []).map(function(n) {
      return n.features && n.features.rmsDb != null ? n.features.rmsDb : null
    })
  }

  const a = levels(baselineNotes)
  const b = levels(candidateNotes)
  const n = Math.max(a.length, b.length, 1)
  const all = a.concat(b).filter(function(v) { return v != null })
  const minDb = all.length ? Math.min.apply(null, all) - 3 : -60
  const maxDb = all.length ? Math.max.apply(null, all) + 3 : -10

  function yFor(db) {
    return h - 20 - ((db - minDb) / (maxDb - minDb || 1)) * (h - 40)
  }

  function plot(vals, color) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let started = false
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) continue
      const x = 30 + (i / Math.max(n - 1, 1)) * (w - 40)
      const y = yFor(vals[i])
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  plot(a, '#5dade2')
  plot(b, '#e74c3c')
  ctx.fillStyle = '#6c757d'
  ctx.font = '11px sans-serif'
  ctx.fillText('Level vs note index (A blue, B red)', 8, 14)
}

export function drawPerNoteHighlights(canvas, baselineNotes, candidateNotes) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#f8f9fa'
  ctx.fillRect(0, 0, w, h)

  const byTarget = {}
  ;(candidateNotes || []).forEach(function(note) {
    if (note && note.targetNote) byTarget[note.targetNote] = note
  })
  const rows = (baselineNotes || []).map(function(a) {
    const b = byTarget[a.targetNote] || null
    const fa = (a && a.features) || {}
    const fb = (b && b.features) || {}
    return {
      note: a.targetNote,
      deltaLevel: fa.rmsDb != null && fb.rmsDb != null ? fb.rmsDb - fa.rmsDb : null,
      deltaRichness: fa.richness != null && fb.richness != null ? fb.richness - fa.richness : null
    }
  }).filter(function(row) {
    return row.deltaLevel != null || row.deltaRichness != null
  })

  if (!rows.length) {
    ctx.fillStyle = '#6c757d'
    ctx.font = '13px sans-serif'
    ctx.fillText('No overlapping per-note data to chart.', 12, 22)
    return
  }

  const maxLevel = rows.reduce(function(max, row) {
    return Math.max(max, Math.abs(row.deltaLevel || 0))
  }, 0)
  const maxRich = rows.reduce(function(max, row) {
    return Math.max(max, Math.abs((row.deltaRichness || 0) * 8))
  }, 0)
  const maxAbs = Math.max(1, maxLevel, maxRich)
  const axisY = Math.round(h / 2)
  const left = 40
  const right = w - 12
  const bottom = h - 18
  const usableW = Math.max(10, right - left)

  ctx.strokeStyle = '#adb5bd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, axisY)
  ctx.lineTo(right, axisY)
  ctx.stroke()

  ctx.fillStyle = '#6c757d'
  ctx.font = '11px sans-serif'
  ctx.fillText('Per-note highlights: bars = level delta, dots = richness delta x8', 8, 14)
  ctx.fillText('B louder / richer', 8, 28)
  ctx.fillText('A louder / richer', 8, bottom)

  rows.forEach(function(row, i) {
    const x = left + (i / Math.max(rows.length - 1, 1)) * usableW
    const barHalf = row.deltaLevel != null ? ((row.deltaLevel / maxAbs) * (h * 0.34)) : 0
    const dotHalf = row.deltaRichness != null ? (((row.deltaRichness * 8) / maxAbs) * (h * 0.34)) : null

    if (row.deltaLevel != null) {
      ctx.strokeStyle = row.deltaLevel >= 0 ? '#e74c3c' : '#5dade2'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, axisY)
      ctx.lineTo(x, axisY - barHalf)
      ctx.stroke()
    }
    if (dotHalf != null) {
      ctx.fillStyle = '#212529'
      ctx.beginPath()
      ctx.arc(x, axisY - dotHalf, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    if (rows.length <= 16) {
      ctx.save()
      ctx.translate(x - 2, h - 4)
      ctx.rotate(-Math.PI / 4)
      ctx.fillStyle = '#6c757d'
      ctx.font = '10px sans-serif'
      ctx.fillText(row.note, 0, 0)
      ctx.restore()
    }
  })
}

export function renderCompareChartCanvases(baseline, candidate, size) {
  const dims = size || { width: 520, height: 200 }
  const spectrumCanvas = document.createElement('canvas')
  spectrumCanvas.width = dims.width
  spectrumCanvas.height = dims.height
  const saundersCanvas = document.createElement('canvas')
  saundersCanvas.width = dims.width
  saundersCanvas.height = dims.height
  const perNoteCanvas = document.createElement('canvas')
  perNoteCanvas.width = dims.width
  perNoteCanvas.height = dims.height

  drawSpectrum(spectrumCanvas, baseline, candidate, { fromSets: true })
  drawSaunders(saundersCanvas, baseline.notes, candidate.notes)
  drawPerNoteHighlights(perNoteCanvas, baseline.notes, candidate.notes)
  return {
    spectrumCanvas: spectrumCanvas,
    saundersCanvas: saundersCanvas,
    perNoteCanvas: perNoteCanvas
  }
}
