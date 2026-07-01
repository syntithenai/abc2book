/** Accent levels used by the metronome rhythm engine. */
export const METRONOME_ACCENT = 'accent'
export const METRONOME_TICK = 'tick'
export const METRONOME_MUTE = 'mute'
export const METRONOME_SUB = 'sub'

const TICK_PROFILES = {
  [METRONOME_ACCENT]: { filterHz: 2200, gain: 0.85, decay: 0.018 },
  [METRONOME_TICK]: { filterHz: 1600, gain: 0.55, decay: 0.014 },
  [METRONOME_SUB]: { filterHz: 1200, gain: 0.28, decay: 0.01 },
}

/**
 * Play a short filtered-noise click — closer to a mechanical metronome than a sine beep.
 */
export function playMetronomeTick(audioContext, time, accentLevel) {
  if (!audioContext || accentLevel === METRONOME_MUTE) return

  const profile = TICK_PROFILES[accentLevel] || TICK_PROFILES[METRONOME_TICK]
  const sampleRate = audioContext.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * profile.decay))
  const buffer = audioContext.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < length; i++) {
    const envelope = Math.exp(-i / (length * 0.22))
    data[i] = (Math.random() * 2 - 1) * envelope
  }

  const source = audioContext.createBufferSource()
  source.buffer = buffer

  const filter = audioContext.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = profile.filterHz
  filter.Q.value = 1.2

  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(profile.gain, time + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.001, time + profile.decay)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(audioContext.destination)

  source.start(time)
  source.stop(time + profile.decay + 0.005)
}
