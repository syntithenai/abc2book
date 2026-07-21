import { jsPDF } from 'jspdf'
import {
  summarizeSetFeatures,
  deltaSummary,
  recommendSoundpostMoves,
  timbreChipsFromDelta,
  playingQcWarnings,
  averageMelBands,
  mfccDistance
} from './soundpostAnalysis'
import { TUNER_INSTRUMENT_LABELS } from './instrumentTuningPresets'
import { labelLikelyModes, tapPeakShifts } from './audioAnalysisTapCapture'
import { renderCompareChartCanvases } from './audioAnalysisCompareCharts'

function fmt(n, digits) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits != null ? digits : 1)
}

function fmtDelta(n, digits, unit) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(digits != null ? digits : 1) + (unit || '')
}

function sanitizeFilename(name) {
  const base = String(name || 'comparison').trim() || 'comparison'
  return base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}

function buildComparePdfDocument(options) {
  const opts = options || {}
  const baseline = opts.baseline
  const candidate = opts.candidate

  const baseSummary = summarizeSetFeatures(baseline.notes)
  const candSummary = summarizeSetFeatures(candidate.notes)
  const delta = deltaSummary(baseSummary, candSummary)
  const bothTap = baseline.measurementMode === 'tap' && candidate.measurementMode === 'tap'
  const bothBowed = (baseline.measurementMode || 'bowed') === 'bowed' &&
    (candidate.measurementMode || 'bowed') === 'bowed'
  const rec = bothBowed ? recommendSoundpostMoves(delta, {
    instrumentA: baseline.instrument,
    instrumentB: candidate.instrument
  }) : null
  const chips = timbreChipsFromDelta(delta)
  const qc = playingQcWarnings(baseSummary, candSummary)
  const timbreDist = mfccDistance(averageMelBands(baseline.notes), averageMelBands(candidate.notes))
  const tapShifts = bothTap
    ? tapPeakShifts(labelLikelyModes(baseline.tapPeaks || []), labelLikelyModes(candidate.tapPeaks || []))
    : []
  const tapShiftsR = bothTap
    ? tapPeakShifts(labelLikelyModes(baseline.tapPeaksR || []), labelLikelyModes(candidate.tapPeaksR || []))
    : []
  const charts = renderCompareChartCanvases(baseline, candidate)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin
  const pageWidth = doc.internal.pageSize.getWidth()
  const maxWidth = pageWidth - margin * 2

  function ensureSpace(needed) {
    const pageHeight = doc.internal.pageSize.getHeight()
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  function line(text, size, style) {
    doc.setFont('helvetica', style || 'normal')
    doc.setFontSize(size || 11)
    const lines = doc.splitTextToSize(String(text || ''), maxWidth)
    ensureSpace(lines.length * (size || 11) * 1.25 + 4)
    doc.text(lines, margin, y)
    y += lines.length * (size || 11) * 1.25 + 6
  }

  line('Audio Analysis comparison', 16, 'bold')
  line(new Date().toLocaleString(), 10)
  line(
    'Baseline (A): ' + baseline.label +
      ' — ' + (TUNER_INSTRUMENT_LABELS[baseline.instrument] || baseline.instrument) +
      (baseline.tuningPresetId ? ' / ' + baseline.tuningPresetId : ''),
    11
  )
  line(
    'Candidate (B): ' + candidate.label +
      ' — ' + (TUNER_INSTRUMENT_LABELS[candidate.instrument] || candidate.instrument) +
      (candidate.tuningPresetId ? ' / ' + candidate.tuningPresetId : ''),
    11
  )
  line('All deltas are B - A (candidate minus baseline).', 9)
  line('Positive values mean B is higher or has more of that quality.', 9)

  if (chips.length) {
    line('Summary differences', 13, 'bold')
    chips.forEach(function(c) { line('• ' + c, 10) })
    if (timbreDist != null) {
      line(
        'Timbre distance: ' + timbreDist.toFixed(1) +
          (timbreDist < 3 ? ' (low)' : timbreDist < 8 ? ' (medium)' : ' (high)'),
        10
      )
    }
  }

  line('Overview — band & level deltas', 13, 'bold')
  line('Bass: ' + fmtDelta(delta.bandDb.bass, 1, ' dB') +
    '   Body: ' + fmtDelta(delta.bandDb.body, 1, ' dB') +
    '   Mid: ' + fmtDelta(delta.bandDb.mid, 1, ' dB') +
    '   Presence: ' + fmtDelta(delta.bandDb.presence, 1, ' dB'), 10)
  line('Level: ' + fmtDelta(delta.rmsDb, 1, ' dB') +
    '   Centroid: ' + fmtDelta(delta.centroidHz, 0, ' Hz') +
    '   Richness: ' + fmtDelta(delta.richness, 2) +
    '   Stability ¢: ' + fmtDelta(delta.f0StdCents, 2) +
    '   Problem-note: ' + fmtDelta(delta.wolfMean, 2), 10)

  if (rec) {
    line('Soundpost recommendations', 13, 'bold')
    rec.bullets.forEach(function(b) { line('• ' + b, 10) })
    line(rec.disclaimer, 8)
  }

  function addCanvas(canvas, title) {
    if (!canvas) return
    line(title, 12, 'bold')
    const img = canvas.toDataURL('image/png')
    const imgW = maxWidth
    const imgH = (canvas.height / canvas.width) * imgW
    ensureSpace(imgH + 10)
    doc.addImage(img, 'PNG', margin, y, imgW, imgH)
    y += imgH + 12
  }

  addCanvas(charts.spectrumCanvas, 'Average spectrum (to 4 kHz)')
  addCanvas(charts.saundersCanvas, 'Saunders-style level curve')
  addCanvas(charts.perNoteCanvas, 'Per-note highlight graph')

  line('How to read this report', 13, 'bold')
  line('Overview compares broad tonal balance and playing response. Bass/body/mid/presence are wide frequency bands; they tell you where energy moved after the adjustment.', 10)
  line('Average spectrum shows the whole frequency shape up to 4 kHz. If the red B curve sits above the blue A curve in a region, B radiated more energy there. Dashed darker lines (when present) are the piezo/contact channel R.', 10)
  line('Saunders-style level curve shows loudness note by note across the recording sequence. A smoother curve usually means a more even instrument response.', 10)
  line('Per-note highlight graph is a quick scan for local changes. Bars show level delta for each note, while dots show richness delta. Use it to find specific notes that improved or got worse, even if the overall average looked small.', 10)
  line('Timbre metrics describe tone colour. Centroid and rolloff track brightness, flatness and flux track noise/variability, sharpness tracks harsh top-end edge, and richness tracks overtone strength.', 10)
  line('Playability metrics describe how willingly the note speaks. Stability is pitch wobble, in-tune ratio is how much of the capture stayed near target pitch, and problem-note score estimates wolfy or unwilling response.', 10)
  line('QC warnings flag cases where playing or mic setup may explain part of the difference. Large level or flux differences can come from bow pressure, phone distance, room noise, or inconsistent attack.', 10)

  line('Timbre — tone colour (B − A)', 13, 'bold')
  line('These values average the full set, so think of them as overall colour rather than one note.', 10)
  line('Centroid Δ: ' + fmtDelta(delta.centroidHz, 0, ' Hz') + ' — positive = B brighter', 10)
  line('Rolloff Δ: ' + fmtDelta(delta.spectralRolloffHz, 0, ' Hz') + ' — positive = B more open/extended highs', 10)
  line('Flatness Δ: ' + fmtDelta(delta.spectralFlatness, 3) + ' — positive = B noisier / less pure tone', 10)
  line('Sharpness Δ: ' + fmtDelta(delta.perceptualSharpness, 3) + ' — positive = B harsher edge', 10)
  line('Spread Δ: ' + fmtDelta(delta.spectralSpreadHz, 0, ' Hz') + ' — positive = B broader spectral spread', 10)
  line('Richness Δ: ' + fmtDelta(delta.richness, 2) + ' — positive = B more overtones', 10)

  line('Playability — how easy notes speak (B − A)', 13, 'bold')
  line('These values help separate "sounds different" from "plays better or worse". Lower stability/problem-note numbers are generally better; higher in-tune ratio is better.', 10)
  line('Stability Δ: ' + fmtDelta(delta.f0StdCents, 2, ' ¢') + ' — positive = B pitch wobbles more', 10)
  line('In-tune ratio Δ: ' + fmtDelta(delta.inTuneRatio, 2) + ' — positive = B locked in tune more of the time', 10)
  line('Problem-note Δ: ' + fmtDelta(delta.wolfMean, 2) + ' — positive = B has more unwilling / wolfy notes', 10)
  line('Flux Δ: ' + fmtDelta(delta.spectralFlux, 3) + ' — positive = B spectrum changes more during the note', 10)

  line('QC — consistency warnings', 13, 'bold')
  line('QC is not judging tone. It is checking whether the two takes were comparable enough to trust the deltas.', 10)
  if (qc.length) {
    qc.forEach(function(w) { line('• ' + w, 10) })
  } else {
    line('No major playing-consistency warnings between these sets.', 10)
  }

  if (bothTap && (tapShifts.length || tapShiftsR.length)) {
    line('Body modes — tap peak shifts', 13, 'bold')
    line('Tap-mode peaks are body resonances inferred from repeated bridge taps. Labels such as A0, B1-, and B1+ are educated guesses, not lab calibration.', 10)
    if (tapShifts.length) {
      line('Radiated mic (L)', 11, 'bold')
      tapShifts.forEach(function(s) {
        line(
          (s.label || 'peak') + ': A ' + s.fromHz.toFixed(1) + ' Hz → B ' + s.toHz.toFixed(1) +
            ' Hz (' + fmtDelta(s.deltaHz, 1) + ' Hz)',
          10
        )
      })
    }
    if (tapShiftsR.length) {
      line('Piezo / contact (R)', 11, 'bold')
      tapShiftsR.forEach(function(s) {
        line(
          (s.label || 'peak') + ': A ' + s.fromHz.toFixed(1) + ' Hz → B ' + s.toHz.toFixed(1) +
            ' Hz (' + fmtDelta(s.deltaHz, 1) + ' Hz)',
          10
        )
      })
    }
  }

  line('Per-note highlights', 13, 'bold')
  line('This list is useful when averages hide an uneven change. It helps answer questions like "did the A string improve but the E string get harsher?"', 10)

  const mapB = {}
  ;(candidate.notes || []).forEach(function(n) {
    mapB[n.targetNote] = n
  })
  const rows = (baseline.notes || []).slice(0, 40)
  rows.forEach(function(a) {
    const b = mapB[a.targetNote]
    const fa = a.features || {}
    const fb = (b && b.features) || {}
    const dRms = fa.rmsDb != null && fb.rmsDb != null ? fb.rmsDb - fa.rmsDb : null
    const rowText =
      a.targetNote +
      '  ΔdB ' + fmtDelta(dRms, 1) +
      '  rich A/B ' + fmt(fa.richness, 2) + '/' + fmt(fb.richness, 2) +
      '  stab A/B ' + fmt(fa.f0StdCents, 1) + '/' + fmt(fb.f0StdCents, 1) +
      '  wolf B ' + fmt(fb.wolfScore, 2)

    line(rowText, 8)
  })
  if ((baseline.notes || []).length > 40) {
    line('… ' + ((baseline.notes || []).length - 40) + ' more notes omitted', 9)
  }

  const filename = sanitizeFilename(baseline.label + '_vs_' + candidate.label) + '.pdf'
  return { doc: doc, filename: filename }
}

export async function buildAudioAnalysisComparePdfBlob(options) {
  const built = buildComparePdfDocument(options)
  const blob = built.doc.output('blob')
  return { blob: blob, filename: built.filename, doc: built.doc }
}

export async function downloadAudioAnalysisComparePdf(options) {
  const opts = options || {}
  const built = buildComparePdfDocument(opts)
  built.doc.save(built.filename)
  return built.filename
}
