import { createRhythm, rhythmsEqual as baseRhythmsEqual, slotsPerBar } from './metronomeRhythmPresets'

export const ENGINE_MODE_CLICK = 'click'
export const ENGINE_MODE_DRUMS = 'drums'

export const DRUM_TRACK_IDS = ['kick', 'snare', 'hat', 'rim', 'tom']
export const DRUM_SAMPLE_IDS = ['kick', 'snare', 'hat-closed', 'hat-open', 'rim', 'tom']

export const DEFAULT_DRUM_VOLUME = 0.85

export const DRUM_TRACK_DEFAULTS = [
  { id: 'kick', label: 'Kick', sample: 'kick', velocity: 1 },
  { id: 'snare', label: 'Snare', sample: 'snare', velocity: 0.9 },
  { id: 'hat', label: 'Hi-hat', sample: 'hat-closed', velocity: 0.6 },
  { id: 'rim', label: 'Rim', sample: 'rim', velocity: 0.7 },
  { id: 'tom', label: 'Tom', sample: 'tom', velocity: 0.75 },
]

function clampSwing(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(0.5, n))
}

function normalizeSteps(steps, slotCount) {
  const count = Math.max(1, slotCount || 1)
  const pattern = Array.isArray(steps) ? steps.slice(0, count) : []
  while (pattern.length < count) pattern.push(0)
  return pattern.map(function(step) { return step ? 1 : 0 })
}

export function createEmptyDrumPattern(slotCount, swing) {
  const count = Math.max(1, slotCount || 16)
  return {
    resolution: count,
    swing: clampSwing(swing),
    tracks: DRUM_TRACK_DEFAULTS.map(function(track) {
      return {
        id: track.id,
        label: track.label,
        sample: track.sample,
        velocity: track.velocity,
        steps: Array.from({ length: count }, function() { return 0 }),
      }
    }),
  }
}

export function normalizeDrumPattern(pattern, slotCount) {
  const count = Math.max(1, slotCount || (pattern && pattern.resolution) || 16)
  if (!pattern || typeof pattern !== 'object') {
    return createEmptyDrumPattern(count)
  }
  const tracks = Array.isArray(pattern.tracks) ? pattern.tracks : []
  const normalizedTracks = DRUM_TRACK_DEFAULTS.map(function(defaultTrack) {
    const existing = tracks.find(function(track) { return track && track.id === defaultTrack.id })
    const sample = existing && DRUM_SAMPLE_IDS.includes(existing.sample)
      ? existing.sample
      : defaultTrack.sample
    const velocity = existing && Number.isFinite(parseFloat(existing.velocity))
      ? Math.max(0, Math.min(1, parseFloat(existing.velocity)))
      : defaultTrack.velocity
    return {
      id: defaultTrack.id,
      label: existing && existing.label ? existing.label : defaultTrack.label,
      sample: sample,
      velocity: velocity,
      steps: normalizeSteps(existing && existing.steps, count),
    }
  })
  return {
    resolution: count,
    swing: clampSwing(pattern.swing),
    tracks: normalizedTracks,
  }
}

export function normalizeEngineMode(mode) {
  return mode === ENGINE_MODE_DRUMS ? ENGINE_MODE_DRUMS : ENGINE_MODE_CLICK
}

/**
 * Create a full rhythm config with optional drum layer.
 * Backward compatible: missing engineMode defaults to click.
 */
export function createRhythmConfig(beatsPerBar, accents, pulsesPerBeat, options) {
  const base = createRhythm(beatsPerBar, accents, pulsesPerBeat)
  const opts = options || {}
  const engineMode = normalizeEngineMode(opts.engineMode)
  const slotCount = slotsPerBar(base)
  const drumPattern = engineMode === ENGINE_MODE_DRUMS
    ? normalizeDrumPattern(opts.drumPattern, slotCount)
    : null
  return {
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    pulsesPerBeat: base.pulsesPerBeat,
    engineMode: engineMode,
    drumPattern: drumPattern,
    presetId: typeof opts.presetId === 'string' ? opts.presetId : '',
  }
}

export function normalizeRhythmConfig(rhythm) {
  if (!rhythm || typeof rhythm !== 'object') {
    return createRhythmConfig(4)
  }
  const base = createRhythm(rhythm.beatsPerBar, rhythm.accents, rhythm.pulsesPerBeat)
  const engineMode = normalizeEngineMode(rhythm.engineMode)
  const slotCount = slotsPerBar(base)
  return {
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    pulsesPerBeat: base.pulsesPerBeat,
    engineMode: engineMode,
    drumPattern: engineMode === ENGINE_MODE_DRUMS
      ? normalizeDrumPattern(rhythm.drumPattern, slotCount)
      : null,
    presetId: typeof rhythm.presetId === 'string' ? rhythm.presetId : '',
  }
}

export function drumPatternsEqual(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false
  if (left.resolution !== right.resolution) return false
  if (left.swing !== right.swing) return false
  const leftTracks = left.tracks || []
  const rightTracks = right.tracks || []
  if (leftTracks.length !== rightTracks.length) return false
  return leftTracks.every(function(track, index) {
    const other = rightTracks[index]
    if (!other) return false
    if (track.id !== other.id) return false
    if (track.sample !== other.sample) return false
    if (track.velocity !== other.velocity) return false
    const steps = track.steps || []
    const otherSteps = other.steps || []
    if (steps.length !== otherSteps.length) return false
    return steps.every(function(step, stepIndex) { return step === otherSteps[stepIndex] })
  })
}

export function rhythmsEqual(left, right) {
  if (!baseRhythmsEqual(left, right)) return false
  const leftMode = normalizeEngineMode(left && left.engineMode)
  const rightMode = normalizeEngineMode(right && right.engineMode)
  if (leftMode !== rightMode) return false
  if ((left && left.presetId) !== (right && right.presetId)) return false
  if (leftMode === ENGINE_MODE_DRUMS) {
    return drumPatternsEqual(left && left.drumPattern, right && right.drumPattern)
  }
  return true
}

export function rhythmConfigKey(rhythm) {
  const normalized = normalizeRhythmConfig(rhythm)
  const baseKey = normalized.beatsPerBar + '|'
    + normalized.accents.join(',') + '|'
    + normalized.pulsesPerBeat.join(',') + '|'
    + normalized.engineMode + '|'
    + (normalized.presetId || '')
  if (normalized.engineMode !== ENGINE_MODE_DRUMS || !normalized.drumPattern) {
    return baseKey
  }
  const tracks = normalized.drumPattern.tracks || []
  const stepsKey = tracks.map(function(track) {
    return track.id + ':' + (track.steps || []).join('')
  }).join(';')
  return baseKey + '|' + normalized.drumPattern.swing + '|' + stepsKey
}

export function toggleDrumStep(pattern, trackId, stepIndex) {
  const normalized = normalizeDrumPattern(pattern)
  const tracks = normalized.tracks.map(function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.slice()
    const index = ((stepIndex % steps.length) + steps.length) % steps.length
    steps[index] = steps[index] ? 0 : 1
    return Object.assign({}, track, { steps: steps })
  })
  return Object.assign({}, normalized, { tracks: tracks })
}

export function setDrumSwing(pattern, swing) {
  const normalized = normalizeDrumPattern(pattern)
  return Object.assign({}, normalized, { swing: clampSwing(swing) })
}

export function resizeDrumPattern(pattern, slotCount) {
  return normalizeDrumPattern(pattern, slotCount)
}
