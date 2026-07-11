import { frequencyToMidi, floatCentsBetween, IN_TUNE_CENTS, INTONATION_AMBER_CENTS } from './tunerTuningUtils'
import { midiToFrequency } from './tunerTuningUtils'

export const SCORING_PITCH_TOLERANCE_SEMITONES = 0.55
export const SCORING_MIN_SAMPLES_PER_NOTE = 3
export const TIMING_TOLERANCE_MS_DEFAULT = 100

export function pitchClose(leftMidi, rightMidi, toleranceSemitones) {
  if (leftMidi == null || rightMidi == null) return false
  const tol = toleranceSemitones != null ? toleranceSemitones : SCORING_PITCH_TOLERANCE_SEMITONES
  return Math.abs(Number(leftMidi) - Number(rightMidi)) <= tol
}

export function medianMidiFromSamples(samples) {
  if (!samples || !samples.length) return null
  const midis = samples
    .map(function(s) {
      if (s.midi != null) return s.midi
      if (s.frequency > 0) return frequencyToMidi(s.frequency)
      return null
    })
    .filter(function(m) { return m != null })
  if (!midis.length) return null
  const sorted = midis.slice().sort(function(a, b) { return a - b })
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function scorePitchInWindow(samples, expectedMidi, toleranceSemitones) {
  const median = medianMidiFromSamples(samples)
  if (median == null) return { hit: false, missed: true, medianMidi: null }
  const hit = pitchClose(median, expectedMidi, toleranceSemitones)
  return { hit: hit, missed: false, medianMidi: median }
}

export function liveIntonationBand(cents) {
  if (cents == null || !Number.isFinite(cents)) return 'none'
  const abs = Math.abs(cents)
  if (abs <= IN_TUNE_CENTS) return 'green'
  if (abs <= INTONATION_AMBER_CENTS) return 'amber'
  return 'red'
}

export function centsFromFrequencyToMidi(freq, expectedMidi) {
  if (!freq || freq <= 0 || expectedMidi == null) return null
  const target = midiToFrequency(expectedMidi)
  return floatCentsBetween(freq, target)
}

export function summarizeRepPitch(windows, detectedSamples, options) {
  const opts = options || {}
  const tolerance = opts.toleranceSemitones != null
    ? opts.toleranceSemitones
    : SCORING_PITCH_TOLERANCE_SEMITONES
  const minSamples = opts.minSamples != null ? opts.minSamples : SCORING_MIN_SAMPLES_PER_NOTE
  const perNote = []
  let hits = 0
  windows.forEach(function(win) {
    const inWindow = (detectedSamples || []).filter(function(s) {
      return s.timeMs >= win.startMs && s.timeMs < win.endMs && s.gated !== false
    })
    if (inWindow.length < minSamples) {
      perNote.push({
        midi: win.midi,
        startBeat: win.startBeat,
        hit: false,
        missed: true,
        sampleCount: inWindow.length,
      })
      return
    }
    const result = scorePitchInWindow(inWindow, win.midi, tolerance)
    if (result.hit) hits += 1
    perNote.push({
      midi: win.midi,
      startBeat: win.startBeat,
      hit: result.hit,
      missed: false,
      medianMidi: result.medianMidi,
      sampleCount: inWindow.length,
    })
  })
  const total = windows.length
  const pitchPct = total > 0 ? Math.round((hits / total) * 100) : 0
  return {
    pitchPct: pitchPct,
    hits: hits,
    totalNotes: total,
    missed: perNote.filter(function(n) { return n.missed }).length,
    perNote: perNote,
  }
}

export function scoreTimingDeltaMs(detectedMs, expectedMs, toleranceMs) {
  const tol = toleranceMs != null ? toleranceMs : TIMING_TOLERANCE_MS_DEFAULT
  const delta = detectedMs - expectedMs
  return {
    deltaMs: delta,
    onBeat: Math.abs(delta) <= tol,
    early: delta < -tol,
    late: delta > tol,
  }
}

export function summarizeRepTiming(windows, onsetSamples, options) {
  const opts = options || {}
  const toleranceMs = opts.toleranceMs != null ? opts.toleranceMs : TIMING_TOLERANCE_MS_DEFAULT
  const perNote = []
  let hits = 0
  windows.forEach(function(win) {
    const candidates = (onsetSamples || []).filter(function(s) {
      return s.timeMs >= win.startMs - toleranceMs && s.timeMs < win.endMs
    })
    if (!candidates.length) {
      perNote.push({ startBeat: win.startBeat, onBeat: false, missed: true })
      return
    }
    const nearest = candidates.reduce(function(best, s) {
      const d = Math.abs(s.timeMs - win.startMs)
      return !best || d < best.delta ? { sample: s, delta: d } : best
    }, null)
    const timing = scoreTimingDeltaMs(nearest.sample.timeMs, win.startMs, toleranceMs)
    if (timing.onBeat) hits += 1
    perNote.push(Object.assign({ startBeat: win.startBeat, missed: false }, timing))
  })
  const total = windows.length
  return {
    timingPct: total > 0 ? Math.round((hits / total) * 100) : 0,
    hits: hits,
    totalNotes: total,
    perNote: perNote,
  }
}

export function aggregateRepSummaries(summaries) {
  const list = summaries || []
  if (!list.length) {
    return { best: null, last: null, average: null, reps: [] }
  }
  const pitchPcts = list.map(function(s) { return s.pitchPct }).filter(function(v) { return v != null })
  const timingPcts = list.map(function(s) { return s.timingPct }).filter(function(v) { return v != null })
  const avg = function(vals) {
    if (!vals.length) return null
    return Math.round(vals.reduce(function(a, b) { return a + b }, 0) / vals.length)
  }
  const bestPitch = pitchPcts.length ? Math.max.apply(null, pitchPcts) : null
  const last = list[list.length - 1]
  return {
    reps: list,
    best: bestPitch != null ? list.find(function(s) { return s.pitchPct === bestPitch }) : last,
    last: last,
    average: {
      pitchPct: avg(pitchPcts),
      timingPct: avg(timingPcts),
    },
  }
}

export function mergeResolverScore(browserSummary, resolverSummary) {
  if (!resolverSummary) return browserSummary
  return Object.assign({}, browserSummary, resolverSummary, {
    source: 'resolver',
    provisional: false,
  })
}
