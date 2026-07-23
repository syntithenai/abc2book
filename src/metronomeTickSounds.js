/** Accent levels used by the metronome rhythm engine. */
export const METRONOME_ACCENT = 'accent'
export const METRONOME_TICK = 'tick'
export const METRONOME_MUTE = 'mute'
export const METRONOME_SUB = 'sub'

const VOLUME_STORAGE_KEY = 'bookstorage_metronome_volumes'
export const DEFAULT_METRONOME_VOLUME = 0.7
export const DEFAULT_METRONOME_ACCENT_VOLUME = 1
export const DEFAULT_DRUM_VOLUME = 0.85

const TICK_PROFILES = {
  // A bit louder/brighter than before so 100% accent cuts through clearly.
  [METRONOME_ACCENT]: { filterHz: 2400, gain: 1.15, decay: 0.022 },
  [METRONOME_TICK]: { filterHz: 1600, gain: 0.55, decay: 0.014 },
  [METRONOME_SUB]: { filterHz: 1200, gain: 0.28, decay: 0.01 },
}

let volumeState = loadVolumeSettings()

function clampVolume(value, fallback) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function loadVolumeSettings() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VOLUME_STORAGE_KEY) : null
    if (!raw) {
      return {
        volume: DEFAULT_METRONOME_VOLUME,
        accentVolume: DEFAULT_METRONOME_ACCENT_VOLUME,
        drumVolume: DEFAULT_DRUM_VOLUME,
      }
    }
    const parsed = JSON.parse(raw)
    return {
      volume: clampVolume(parsed && parsed.volume, DEFAULT_METRONOME_VOLUME),
      accentVolume: clampVolume(
        parsed && (parsed.accentVolume != null ? parsed.accentVolume : parsed.accent),
        DEFAULT_METRONOME_ACCENT_VOLUME
      ),
      drumVolume: clampVolume(parsed && parsed.drumVolume, DEFAULT_DRUM_VOLUME),
    }
  } catch (e) {
    return {
      volume: DEFAULT_METRONOME_VOLUME,
      accentVolume: DEFAULT_METRONOME_ACCENT_VOLUME,
      drumVolume: DEFAULT_DRUM_VOLUME,
    }
  }
}

function persistVolumeSettings(next) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({
      volume: next.volume,
      accentVolume: next.accentVolume,
      drumVolume: next.drumVolume,
    }))
  } catch (e) { /* ignore quota / private mode */ }
}

export function getMetronomeVolumes() {
  return {
    volume: volumeState.volume,
    accentVolume: volumeState.accentVolume,
    drumVolume: volumeState.drumVolume,
  }
}

export function getDrumVolume() {
  return volumeState.drumVolume
}

export function getMetronomeVolume() {
  return volumeState.volume
}

export function getMetronomeAccentVolume() {
  return volumeState.accentVolume
}

/**
 * Update shared metronome click volumes (0–1). Applies to every Metronome instance.
 */
export function setMetronomeVolumes(next) {
  const patch = next || {}
  volumeState = {
    volume: patch.volume != null
      ? clampVolume(patch.volume, volumeState.volume)
      : volumeState.volume,
    accentVolume: patch.accentVolume != null
      ? clampVolume(patch.accentVolume, volumeState.accentVolume)
      : volumeState.accentVolume,
    drumVolume: patch.drumVolume != null
      ? clampVolume(patch.drumVolume, volumeState.drumVolume)
      : volumeState.drumVolume,
  }
  persistVolumeSettings(volumeState)
  return getMetronomeVolumes()
}

export function setMetronomeVolume(volume) {
  return setMetronomeVolumes({ volume: volume })
}

export function setMetronomeAccentVolume(accentVolume) {
  return setMetronomeVolumes({ accentVolume: accentVolume })
}

function gainForAccentLevel(accentLevel) {
  const profile = TICK_PROFILES[accentLevel] || TICK_PROFILES[METRONOME_TICK]
  const userScale = accentLevel === METRONOME_ACCENT
    ? volumeState.accentVolume
    : volumeState.volume
  return Math.max(0, profile.gain * userScale)
}

/**
 * Play a short filtered-noise click — closer to a mechanical metronome than a sine beep.
 * Respects shared volume / accent-volume settings used across the app.
 */
export function playMetronomeTick(audioContext, time, accentLevel) {
  if (!audioContext || accentLevel === METRONOME_MUTE) return

  const profile = TICK_PROFILES[accentLevel] || TICK_PROFILES[METRONOME_TICK]
  const peakGain = gainForAccentLevel(accentLevel)
  if (!(peakGain > 0.0001)) return

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
  gain.gain.linearRampToValueAtTime(peakGain, time + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.001, time + profile.decay)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(audioContext.destination)

  source.start(time)
  source.stop(time + profile.decay + 0.005)
}
