/**
 * Master gain bus for tune-playback metronome and drum hits.
 * silence() disconnects the gain so pre-scheduled Web Audio clicks cannot
 * become audible again if something re-arms before a fresh node is created.
 */

export function createRhythmOutputBus() {
  return {
    audioContext: null,
    masterGain: null,
    armed: false,
  }
}

function disconnectMasterGain(bus) {
  if (!bus || !bus.masterGain) return
  try {
    bus.masterGain.disconnect()
  } catch (e) { /* ignore */ }
  bus.masterGain = null
}

function createMasterGain(bus, audioContext) {
  const gain = audioContext.createGain()
  gain.gain.value = 1
  gain.connect(audioContext.destination)
  bus.audioContext = audioContext
  bus.masterGain = gain
  return gain
}

/**
 * Ensure a live destination exists. Never revives a silenced gain node —
 * that would unmute leftover scheduled sources from a previous play.
 */
export function ensureRhythmOutputBus(bus, audioContext) {
  if (!bus || !audioContext) return null
  if (bus.audioContext === audioContext && bus.masterGain && bus.armed) {
    return bus.masterGain
  }
  disconnectMasterGain(bus)
  createMasterGain(bus, audioContext)
  bus.armed = true
  return bus.masterGain
}

export function armRhythmOutputBus(bus, audioContext) {
  if (!bus || !audioContext) return null
  if (!bus.armed || bus.audioContext !== audioContext || !bus.masterGain) {
    disconnectMasterGain(bus)
    createMasterGain(bus, audioContext)
  }
  const gain = bus.masterGain
  if (!gain) return null
  const now = audioContext.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(1, now)
  bus.armed = true
  return gain
}

export function silenceRhythmOutputBus(bus, audioContext) {
  if (!bus) return
  bus.armed = false
  const ctx = audioContext || bus.audioContext
  if (bus.masterGain && ctx) {
    const now = ctx.currentTime
    try {
      bus.masterGain.gain.cancelScheduledValues(now)
      bus.masterGain.gain.setValueAtTime(0, now)
    } catch (e) { /* ignore */ }
  }
  // Drop the node so orphaned BufferSources/oscillators have no path to speakers
  // even if a concurrent tick calls ensure/arm before the next count-in.
  disconnectMasterGain(bus)
}

export function getRhythmOutputDestination(bus, audioContext) {
  if (!bus) return null
  const gain = ensureRhythmOutputBus(bus, audioContext)
  return gain || null
}
