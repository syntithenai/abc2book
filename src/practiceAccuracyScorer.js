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

export function scorePitchInWindow(samples, expectedMidi, toleranceSemitones, options) {
  const median = medianMidiFromSamples(samples)
  if (median == null) return { hit: false, missed: true, medianMidi: null }
  const opts = options || {}
  const compare = opts.foldHarmonics
    ? foldMidiHarmonicNearExpected(median, expectedMidi)
    : (opts.foldOctaves ? foldMidiNearExpected(median, expectedMidi) : median)
  const hit = pitchClose(compare, expectedMidi, toleranceSemitones)
  return { hit: hit, missed: false, medianMidi: compare }
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

/** Wrap absolute cents into ±600 so octave errors read as near-unison. */
export function liveCentsToExpectedMidi(freq, expectedMidi) {
  const absolute = centsFromFrequencyToMidi(freq, expectedMidi)
  if (absolute == null || !Number.isFinite(absolute)) return null
  let folded = absolute % 1200
  if (folded > 600) folded -= 1200
  if (folded < -600) folded += 1200
  return folded
}

/** Fold absolute MIDI into the nearest octave of expectedMidi (±6 semitones). */
export function foldMidiNearExpected(midi, expectedMidi) {
  if (midi == null || !Number.isFinite(midi)) return null
  if (expectedMidi == null || !Number.isFinite(expectedMidi)) return midi
  let folded = midi
  while (folded - expectedMidi > 6) folded -= 12
  while (expectedMidi - folded > 6) folded += 12
  return folded
}

/** Map a detected MIDI onto expected, including common whistle harmonics (octave / twelfth). */
export function foldMidiHarmonicNearExpected(rawMidi, expectedMidi) {
  if (rawMidi == null || !Number.isFinite(rawMidi)) return null
  if (expectedMidi == null || !Number.isFinite(expectedMidi)) return rawMidi
  const octaveFolded = foldMidiNearExpected(rawMidi, expectedMidi)
  let best = octaveFolded != null ? octaveFolded : rawMidi
  let bestDist = Math.abs(best - expectedMidi)
  ;[2, 3, 4].forEach(function(divisor) {
    const candidate = rawMidi - (12 * Math.log(divisor) / Math.log(2))
    const dist = Math.abs(candidate - expectedMidi)
    if (dist < bestDist) {
      best = candidate
      bestDist = dist
    }
  })
  return best
}

export function lastDetectedSampleMs(detectedSamples) {
  let last = null
  ;(detectedSamples || []).forEach(function(s) {
    if (!s || !Number.isFinite(s.timeMs) || s.gated === false) return
    if (last == null || s.timeMs > last) last = s.timeMs
  })
  return last
}

export function summarizeRepPitch(windows, detectedSamples, options) {
  const opts = options || {}
  const tolerance = opts.toleranceSemitones != null
    ? opts.toleranceSemitones
    : SCORING_PITCH_TOLERANCE_SEMITONES
  const minSamples = opts.minSamples != null ? opts.minSamples : SCORING_MIN_SAMPLES_PER_NOTE
  const lastSampleMs = opts.ignoreNotesAfterLastSample
    ? lastDetectedSampleMs(detectedSamples)
    : null
  const perNote = []
  let hits = 0
  ;(windows || []).forEach(function(win) {
    if (lastSampleMs != null && Number.isFinite(win.startMs) && win.startMs > lastSampleMs) {
      return
    }
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
    const result = scorePitchInWindow(inWindow, win.midi, tolerance, {
      foldOctaves: !!opts.foldOctaves,
      foldHarmonics: !!opts.foldHarmonics,
    })
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
  const scored = opts.ignoreUnsampledNotes
    ? perNote.filter(function(n) { return !n.missed })
    : perNote
  const total = scored.length
  const usedHits = opts.ignoreUnsampledNotes
    ? scored.filter(function(n) { return n.hit }).length
    : hits
  const pitchPct = total > 0 ? Math.round((usedHits / total) * 100) : 0
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
