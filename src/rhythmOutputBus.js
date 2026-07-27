/**
 * Master gain bus for tune-playback metronome and drum hits.
 * silence() mutes immediately so pre-scheduled Web Audio clicks do not tail after stop.
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

export function ensureRhythmOutputBus(bus, audioContext) {
  if (!bus || !audioContext) return null
  if (bus.audioContext === audioContext && bus.masterGain && bus.armed) {
    return bus.masterGain
  }
  if (bus.audioContext !== audioContext) {
    disconnectMasterGain(bus)
  }
  if (!bus.masterGain) {
    createMasterGain(bus, audioContext)
  }
  bus.armed = true
  return bus.masterGain
}

export function armRhythmOutputBus(bus, audioContext) {
  if (!bus || !audioContext) return null
  if (!bus.armed || bus.audioContext !== audioContext) {
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
  if (!bus.masterGain || !ctx) return
  const now = ctx.currentTime
  bus.masterGain.gain.cancelScheduledValues(now)
  bus.masterGain.gain.setValueAtTime(0, now)
}

export function getRhythmOutputDestination(bus, audioContext) {
  if (!bus) return null
  const gain = ensureRhythmOutputBus(bus, audioContext)
  return gain || null
}
