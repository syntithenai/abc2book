/**
 * Practice count-in cue: play the actual start of the primed warmup audio
 * so the pitch cannot diverge from the first written/played note.
 *
 * Falls back to a pure MIDI-frequency tone when the audio buffer is not ready.
 */
import { noteEventsFromWarmupAbc } from './practiceExpectedTimeline'

export function firstWarmupCueMidi(abc, preferredMidi) {
  if (preferredMidi != null && Number.isFinite(Number(preferredMidi))) {
    return Math.round(Number(preferredMidi))
  }
  try {
    const timeline = noteEventsFromWarmupAbc(abc)
    const first = timeline && timeline.notes && timeline.notes[0]
    return first && Number.isFinite(first.midi) ? first.midi : null
  } catch (err) {
    return null
  }
}

function eventStart(ev) {
  if (!ev) return null
  if (typeof ev.start === 'number' && Number.isFinite(ev.start)) return ev.start
  if (typeof ev.startTime === 'number' && Number.isFinite(ev.startTime)) return ev.startTime
  return null
}

/**
 * First sounding pitch from an abcjs tune object (highest if a dyad at t≈0).
 */
export function firstPlaybackCueMidiFromVisual(visualObj) {
  if (!visualObj || typeof visualObj.setUpAudio !== 'function') return null
  try {
    const audio = visualObj.setUpAudio({ chordsOff: false })
    const notes = []
    ;(audio.tracks || []).forEach(function(track) {
      ;(track || []).forEach(function(ev) {
        if (ev && ev.cmd && ev.cmd !== 'note') return
        if (typeof ev.pitch !== 'number' || !Number.isFinite(ev.pitch)) return
        const t = eventStart(ev)
        if (t == null || t > 0.001) return
        notes.push(Math.round(ev.pitch))
      })
    })
    if (!notes.length) return null
    return Math.max.apply(null, notes)
  } catch (err) {
    return null
  }
}

/** No-op kept for callers that await before count-in. */
export function preloadCountInCueInstrument(audioContext) {
  return Promise.resolve(audioContext || null)
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (Math.round(midi) - 69) / 12)
}

function playOscillatorCue(audioContext, midi, when, durationSec, gain) {
  const startAt = Math.max(when > 0 ? when : audioContext.currentTime, audioContext.currentTime)
  const dur = Math.max(0.35, Math.min(durationSec > 0 ? durationSec : 0.8, 1.5))
  const level = gain != null ? Math.max(0.12, Math.min(0.55, gain)) : 0.35
  const freq = midiToHz(midi)
  const master = audioContext.createGain()
  master.gain.setValueAtTime(0.0001, startAt)
  master.gain.exponentialRampToValueAtTime(level, startAt + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
  master.connect(audioContext.destination)
  const osc = audioContext.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startAt)
  osc.connect(master)
  osc.start(startAt)
  osc.stop(startAt + dur + 0.02)
}

/**
 * Play the first moments of the already-rendered warmup buffer.
 * That buffer is exactly what playback will emit — same samples, same pitch.
 */
export function scheduleCountInCueFromAudioBuffer(audioContext, audioBuffer, when, durationSec, gain) {
  if (!audioContext || !audioBuffer || !(audioBuffer.duration > 0)) return false
  try {
    const startAt = Math.max(when > 0 ? when : audioContext.currentTime, audioContext.currentTime)
    const maxDur = Math.max(0.2, Math.min(audioBuffer.duration, durationSec > 0 ? durationSec : 0.7))
    const level = gain != null ? Math.max(0.2, Math.min(1, gain)) : 0.7
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    const amp = audioContext.createGain()
    amp.gain.setValueAtTime(0.0001, startAt)
    amp.gain.exponentialRampToValueAtTime(level, startAt + 0.015)
    // Keep the first-note pitch clear, then fade before subsequent notes blur it.
    const fadeStart = Math.max(0.12, maxDur * 0.45)
    amp.gain.setValueAtTime(level, startAt + fadeStart)
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + maxDur)
    source.connect(amp)
    amp.connect(audioContext.destination)
    source.start(startAt, 0, maxDur)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Schedule count-in cue. Prefer the primed warmup audio buffer; else MIDI tone.
 */
export function scheduleCountInCueNote(audioContext, midi, when, durationSec, gain, audioBuffer) {
  if (!audioContext) return Promise.resolve()
  if (audioBuffer && scheduleCountInCueFromAudioBuffer(audioContext, audioBuffer, when, durationSec, gain)) {
    return Promise.resolve()
  }
  if (midi == null || !Number.isFinite(midi)) return Promise.resolve()
  try {
    playOscillatorCue(audioContext, midi, when, durationSec, gain)
  } catch (err) {
    // ignore
  }
  return Promise.resolve()
}

export function __resetCountInCueInstrumentForTests() {
  // no instrument cache
}
