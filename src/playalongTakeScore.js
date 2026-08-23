import {
  playalongLinesFromTune,
  transposePlayalongLines,
} from './playalongLineNotes'
import {
  beatToAudioSeconds,
  effectivePlayalongMusicOffsetSeconds,
  playalongDetectorPitchLatencySeconds,
  refinePlayalongMusicStartOffsetSeconds,
} from './playalongTakes'
import { normalizePlayalongInstrument } from './playalongSettings'
import {
  pitchClose,
  summarizeRepPitch,
  summarizeRepTiming,
} from './practiceAccuracyScorer'

/** Whistle/flute detectors often lock onto overtones; voice/strings should not. */
export function playalongShouldFoldHarmonics(instrumentId) {
  const id = normalizePlayalongInstrument(instrumentId)
  return id === 'whistle' || id === 'whistle-high-d' || id === 'flute'
}

/** Octave errors are common for voice (sung an octave from written) and for
 * instruments; fold to the expected octave. Harmonic (12th) folding stays
 * whistle/flute-only via playalongShouldFoldHarmonics. */
export function playalongShouldFoldOctaves(_instrumentId) {
  return true
}

export function playalongPitchToleranceSemitones(instrumentId) {
  const id = normalizePlayalongInstrument(instrumentId)
  // Vibrato / unsteady sung pitch needs a slightly wider hit window.
  if (id === 'voice') return 1.15
  return 0.7
}

export const PLAYALONG_MIN_SCORE_SAMPLES = 3
/** Allow detector/onset lag so short notes still collect enough samples. */
export const PLAYALONG_SCORE_WINDOW_PAD_MS = 90
export const PLAYALONG_SCORE_MIN_SAMPLES_PER_NOTE = 2

/** Minimum matched notes before trusting median onset alignment. */
export const PLAYALONG_ONSET_ALIGN_MIN_MATCHES = 3
/** Clamp onset-align shift (seconds). Allow negative pull-back when
 * clap/loopback calibration over-stated output latency. */
export const PLAYALONG_ONSET_ALIGN_MIN_SECONDS = -0.28
export const PLAYALONG_ONSET_ALIGN_MAX_SECONDS = 0.35
/** Pitch jump / gap that starts a new onset candidate. */
const ONSET_GAP_MS = 180
const ONSET_JUMP_SEMITONES = 1.25

export function contrastTextForHex(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return '#fff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(function(n) { return !Number.isFinite(n) })) return '#fff'
  const luma = (r * 299 + g * 587 + b * 114) / 1000
  return luma > 160 ? '#212529' : '#fff'
}

export function expectedNotesFromPlayalongTune(tune, visualTranspose) {
  const lines = transposePlayalongLines(playalongLinesFromTune(tune), Number(visualTranspose) || 0)
  const notes = []
  lines.forEach(function(line) {
    (line.notes || []).forEach(function(note) {
      if (note && Number.isFinite(note.midi)) notes.push(note)
    })
  })
  return notes
}

function pointMidi(point) {
  if (!point) return null
  if (Number.isFinite(point.rawMidi)) return point.rawMidi
  if (Number.isFinite(point.midi)) return point.midi
  return null
}

/** First sample of each contiguous pitch run — onset candidates for timing align. */
export function pitchOnsetSamplesFromPoints(pitchPoints) {
  const list = Array.isArray(pitchPoints) ? pitchPoints : []
  const out = []
  let prev = null
  list.forEach(function(point) {
    const midi = pointMidi(point)
    const timeMs = point && Number.isFinite(point.timeMs) ? point.timeMs : null
    if (midi == null || timeMs == null) return
    const isOnset = !prev
      || (timeMs - prev.timeMs > ONSET_GAP_MS)
      || Math.abs(midi - prev.midi) > ONSET_JUMP_SEMITONES
    if (isOnset) {
      out.push({ timeMs: timeMs, midi: midi })
    }
    prev = { timeMs: timeMs, midi: midi }
  })
  return out
}

function medianOf(values) {
  const list = (values || []).slice().sort(function(a, b) { return a - b })
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  if (list.length % 2) return list[mid]
  return (list[mid - 1] + list[mid]) / 2
}

export function playalongOnsetAlignToleranceMs(tempoBpm, playbackSpeed) {
  const bpm = parseFloat(tempoBpm) > 0 ? parseFloat(tempoBpm) : 100
  const speed = parseFloat(playbackSpeed) > 0 ? parseFloat(playbackSpeed) : 1
  const quaverMs = (60 / bpm / speed) * 1000 / 2
  return Math.max(120, Math.min(280, quaverMs))
}

/**
 * Estimate a single global time shift from median per-note onset lag.
 * Measured against musicStartOffset without the detector pad so residual
 * speaker/BT/detector lag is what we recover.
 *
 * @returns {{ seconds: number, matchCount: number, medianDeltaMs: number }|null}
 */
export function estimatePlayalongOnsetAlignSeconds(notes, pitchPoints, options) {
  const opts = options || {}
  const noteList = Array.isArray(notes) ? notes : []
  const offset = Number.isFinite(parseFloat(opts.musicStartOffsetSeconds))
    ? parseFloat(opts.musicStartOffsetSeconds)
    : 0
  const tempoBpm = opts.tempoBpm
  const playbackSpeed = opts.playbackSpeed
  const toleranceMs = opts.toleranceMs > 0
    ? opts.toleranceMs
    : playalongOnsetAlignToleranceMs(tempoBpm, playbackSpeed)
  const pitchTol = opts.toleranceSemitones != null ? opts.toleranceSemitones : 1.5
  const minMatches = opts.minMatches > 0 ? opts.minMatches : PLAYALONG_ONSET_ALIGN_MIN_MATCHES

  const windows = noteList.filter(function(note) {
    return note && Number.isFinite(note.midi) && Number.isFinite(note.startBeat)
  }).map(function(note) {
    const endBeat = Number.isFinite(note.endBeat)
      ? note.endBeat
      : note.startBeat + (Number(note.durationBeats) > 0 ? note.durationBeats : 0.5)
    const startMs = beatToAudioSeconds(note.startBeat, offset, tempoBpm, playbackSpeed) * 1000
    const endMs = beatToAudioSeconds(endBeat, offset, tempoBpm, playbackSpeed) * 1000
    return {
      midi: note.midi,
      startBeat: note.startBeat,
      startMs: startMs,
      endMs: Math.max(startMs + 40, endMs),
    }
  })
  if (windows.length < minMatches) return null

  const onsets = pitchOnsetSamplesFromPoints(pitchPoints).filter(function(onset) {
    return windows.some(function(win) {
      return pitchClose(onset.midi, win.midi, pitchTol)
        || pitchClose(onset.midi, win.midi + 12, pitchTol)
        || pitchClose(onset.midi, win.midi - 12, pitchTol)
    })
  })
  if (!onsets.length) return null

  const timing = summarizeRepTiming(windows, onsets, { toleranceMs: toleranceMs })
  const deltas = (timing.perNote || []).filter(function(row) {
    return row && !row.missed && Number.isFinite(row.deltaMs)
  }).map(function(row) { return row.deltaMs })
  if (deltas.length < minMatches) return null

  const medianDeltaMs = medianOf(deltas)
  if (medianDeltaMs == null || !Number.isFinite(medianDeltaMs)) return null
  const seconds = Math.max(
    PLAYALONG_ONSET_ALIGN_MIN_SECONDS,
    Math.min(PLAYALONG_ONSET_ALIGN_MAX_SECONDS, medianDeltaMs / 1000)
  )
  return {
    seconds: seconds,
    matchCount: deltas.length,
    medianDeltaMs: medianDeltaMs,
  }
}

/**
 * Seed offset + onset align when enough matches; else first-note refine fallback.
 */
export function resolvePlayalongOffsetWithOnsetAlign(seededOffsetSeconds, notes, pitchPoints, options) {
  const opts = options || {}
  const seeded = Number.isFinite(parseFloat(seededOffsetSeconds))
    ? parseFloat(seededOffsetSeconds)
    : 0
  const align = estimatePlayalongOnsetAlignSeconds(notes, pitchPoints, Object.assign({}, opts, {
    musicStartOffsetSeconds: seeded,
  }))
  if (align && align.matchCount >= PLAYALONG_ONSET_ALIGN_MIN_MATCHES) {
    return {
      musicStartOffsetSeconds: Math.max(0, seeded + align.seconds),
      onsetAlignSeconds: align.seconds,
      usedOnsetAlign: true,
      matchCount: align.matchCount,
    }
  }
  const firstExpectedMidi = (notes || []).reduce(function(found, note) {
    if (found != null) return found
    return note && Number.isFinite(note.midi) ? note.midi : null
  }, null)
  const refined = refinePlayalongMusicStartOffsetSeconds(seeded, pitchPoints, {
    firstExpectedMidi: firstExpectedMidi,
  })
  return {
    musicStartOffsetSeconds: refined,
    onsetAlignSeconds: 0,
    usedOnsetAlign: false,
    matchCount: align ? align.matchCount : 0,
  }
}

export function scorePlayalongTake(notes, pitchPoints, options) {
  const opts = options || {}
  const noteList = notes || []
  const firstExpectedMidi = noteList.reduce(function(found, note) {
    if (found != null) return found
    return note && Number.isFinite(note.midi) ? note.midi : null
  }, null)
  const refined = refinePlayalongMusicStartOffsetSeconds(
    opts.musicStartOffsetSeconds,
    pitchPoints,
    { firstExpectedMidi: firstExpectedMidi }
  )
  const detectorLatency = opts.pitchLatencySeconds !== undefined && opts.pitchLatencySeconds !== null
    ? opts.pitchLatencySeconds
    : playalongDetectorPitchLatencySeconds(opts)
  const offset = effectivePlayalongMusicOffsetSeconds(
    refined,
    detectorLatency
  )
  const windows = noteList.filter(function(note) {
    return note && Number.isFinite(note.midi) && Number.isFinite(note.startBeat)
  }).map(function(note) {
    const endBeat = Number.isFinite(note.endBeat)
      ? note.endBeat
      : note.startBeat + (Number(note.durationBeats) > 0 ? note.durationBeats : 0.5)
    const startMs = beatToAudioSeconds(
      note.startBeat,
      offset,
      opts.tempoBpm,
      opts.playbackSpeed
    ) * 1000
    const endMs = beatToAudioSeconds(
      endBeat,
      offset,
      opts.tempoBpm,
      opts.playbackSpeed
    ) * 1000
    return {
      midi: note.midi,
      startBeat: note.startBeat,
      startMs: Math.max(0, startMs - PLAYALONG_SCORE_WINDOW_PAD_MS),
      endMs: endMs + PLAYALONG_SCORE_WINDOW_PAD_MS * 0.5,
    }
  })
  const samples = (pitchPoints || []).map(function(point) {
    if (!point || !Number.isFinite(point.timeMs)) return null
    const midi = Number.isFinite(point.rawMidi)
      ? point.rawMidi
      : (Number.isFinite(point.midi) ? point.midi : null)
    if (midi == null) return null
    return { timeMs: point.timeMs, midi: midi, gated: true }
  }).filter(Boolean)
  if (samples.length < PLAYALONG_MIN_SCORE_SAMPLES) {
    return {
      pitchPct: null,
      hits: 0,
      totalNotes: 0,
      missed: 0,
      perNote: [],
      skippedSparse: true,
      sampleCount: samples.length,
    }
  }
  const foldHarmonics = opts.foldHarmonics != null
    ? !!opts.foldHarmonics
    : playalongShouldFoldHarmonics(opts.instrumentId)
  const foldOctaves = opts.foldOctaves != null
    ? !!opts.foldOctaves
    : playalongShouldFoldOctaves(opts.instrumentId)
  return summarizeRepPitch(windows, samples, {
    ignoreNotesAfterLastSample: true,
    ignoreUnsampledNotes: true,
    foldOctaves: foldOctaves,
    foldHarmonics: foldHarmonics,
    minSamples: opts.minSamples != null ? opts.minSamples : PLAYALONG_SCORE_MIN_SAMPLES_PER_NOTE,
    toleranceSemitones: opts.toleranceSemitones != null
      ? opts.toleranceSemitones
      : playalongPitchToleranceSemitones(opts.instrumentId),
  })
}
