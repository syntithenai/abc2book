import {
  playalongLinesFromTune,
  transposePlayalongLines,
} from './playalongLineNotes'
import {
  beatToAudioSeconds,
  effectivePlayalongMusicOffsetSeconds,
  refinePlayalongMusicStartOffsetSeconds,
} from './playalongTakes'
import { normalizePlayalongInstrument } from './playalongSettings'
import { summarizeRepPitch } from './practiceAccuracyScorer'

/** Whistle/flute detectors often lock onto overtones; voice/strings should not. */
export function playalongShouldFoldHarmonics(instrumentId) {
  const id = normalizePlayalongInstrument(instrumentId)
  return id === 'whistle' || id === 'whistle-high-d' || id === 'flute'
}

/** Voice: treat octave errors as misses. Instruments often need octave folding. */
export function playalongShouldFoldOctaves(instrumentId) {
  const id = normalizePlayalongInstrument(instrumentId)
  return id !== 'voice'
}

export const PLAYALONG_MIN_SCORE_SAMPLES = 3
/** Allow detector/onset lag so short notes still collect enough samples. */
export const PLAYALONG_SCORE_WINDOW_PAD_MS = 90
export const PLAYALONG_SCORE_MIN_SAMPLES_PER_NOTE = 2

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
  const offset = effectivePlayalongMusicOffsetSeconds(
    refined,
    opts.pitchLatencySeconds
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
    toleranceSemitones: opts.toleranceSemitones != null ? opts.toleranceSemitones : 0.7,
  })
}
