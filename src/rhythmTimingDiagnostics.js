import { slotDurationSec } from './rhythmGrid'

const RING_SIZE = 16

export function createRhythmTimingDiagnostics() {
  return {
    ring: [],
    countInSlotsEmitted: 0,
    lastExpectedAudioTime: null,
  }
}

export function recordRhythmSlotEvent(diagnostics, event) {
  if (!diagnostics) return
  const expectedAudioTime = typeof event.expectedAudioTime === 'number'
    ? event.expectedAudioTime
    : null
  const audioTime = typeof event.audioTime === 'number' ? event.audioTime : null
  let spacingErrorMs = null
  if (expectedAudioTime != null && audioTime != null) {
    spacingErrorMs = (audioTime - expectedAudioTime) * 1000
  } else if (diagnostics.lastExpectedAudioTime != null && audioTime != null) {
    spacingErrorMs = (audioTime - diagnostics.lastExpectedAudioTime) * 1000
  }
  const entry = {
    slotInBar: event.slotInBar,
    globalSlot: event.globalSlot,
    audioTime: audioTime,
    expectedAudioTime: expectedAudioTime,
    spacingErrorMs: spacingErrorMs,
    musicSeconds: event.musicSeconds,
    phase: event.phase,
    at: typeof event.at === 'number' ? event.at : Date.now(),
  }
  diagnostics.ring.push(entry)
  if (diagnostics.ring.length > RING_SIZE) {
    diagnostics.ring.shift()
  }
  if (event.phase === 'countIn' || event.phase === 'entryGap') {
    diagnostics.countInSlotsEmitted += 1
  }
  if (expectedAudioTime != null) {
    diagnostics.lastExpectedAudioTime = expectedAudioTime
  } else if (audioTime != null) {
    diagnostics.lastExpectedAudioTime = audioTime
  }
}

export function resetRhythmTimingDiagnostics(diagnostics) {
  if (!diagnostics) return
  diagnostics.ring = []
  diagnostics.countInSlotsEmitted = 0
  diagnostics.lastExpectedAudioTime = null
}

function maxSpacingErrorMs(ring) {
  let max = 0
  for (let i = 0; i < ring.length; i++) {
    const err = ring[i].spacingErrorMs
    if (typeof err === 'number' && Math.abs(err) > Math.abs(max)) {
      max = err
    }
  }
  return max
}

export function buildRhythmDiagnosticsSnapshot(options) {
  const opts = options || {}
  const ring = opts.ring || []
  const last = ring.length > 0 ? ring[ring.length - 1] : null
  const gridTempo = parseFloat(opts.rhythmGridQpm) > 0
    ? parseFloat(opts.rhythmGridQpm)
    : parseFloat(opts.tempo)
  const secPerSlot = typeof opts.secPerSlot === 'number'
    ? opts.secPerSlot
    : (opts.rhythm && gridTempo > 0
      ? slotDurationSec(opts.rhythm, 0, 60 / gridTempo, opts.swing || 0)
      : null)
  return {
    phase: opts.phase || 'idle',
    tempo: opts.tempo,
    tempoFactor: opts.tempoFactor,
    rhythmBeatsPerBar: opts.rhythmBeatsPerBar,
    musicSeconds: opts.musicSeconds,
    rhythmGridQpm: opts.rhythmGridQpm,
    playbackQpm: opts.playbackQpm,
    duringPlayback: opts.duringPlayback === true,
    isMidiPlaying: opts.isMidiPlaying === true,
    timingCallbacksRunning: opts.timingCallbacksRunning === true,
    midiEngineMode: opts.midiEngineMode || 'none',
    rhythmSlotsPerBar: opts.rhythmSlotsPerBar,
    rhythmPulsesPerBeat: opts.rhythmPulsesPerBeat,
    downbeatAudioTime: opts.downbeatAudioTime,
    musicStartAudioTime: opts.musicStartAudioTime,
    secPerSlot: secPerSlot,
    countInSlotsEmitted: opts.countInSlotsEmitted || 0,
    maxSpacingErrorMs: maxSpacingErrorMs(ring),
    lastScheduledSlots: ring.slice(-8),
    lastSlot: last,
  }
}
