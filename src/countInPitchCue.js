/**
 * Soft piano cue for practice count-in: first warmup pitch for one bar.
 */
let instrumentPromise = null
let instrumentCtx = null

export function preloadCountInCueInstrument(audioContext) {
  if (!audioContext) return Promise.resolve(null)
  if (instrumentPromise && instrumentCtx === audioContext) return instrumentPromise
  instrumentCtx = audioContext
  instrumentPromise = import('soundfont-player').then(function(mod) {
    const Soundfont = mod.default || mod
    return Soundfont.instrument(audioContext, 'acoustic_grand_piano').then(function(instrument) {
      return instrument
    })
  }).catch(function() {
    instrumentPromise = null
    instrumentCtx = null
    return null
  })
  return instrumentPromise
}

export function scheduleCountInCueNote(audioContext, midi, when, durationSec, gain) {
  if (!audioContext || midi == null || !Number.isFinite(midi)) return Promise.resolve()
  const startAt = when > 0 ? when : audioContext.currentTime
  const dur = durationSec > 0 ? durationSec : 1
  const level = gain != null ? gain : 0.45
  return preloadCountInCueInstrument(audioContext).then(function(instrument) {
    if (!instrument) return
    try {
      instrument.play(midi, startAt, { duration: dur, gain: level })
    } catch (err) { /* ignore */ }
  })
}

export function __resetCountInCueInstrumentForTests() {
  instrumentPromise = null
  instrumentCtx = null
}
