import { createRhythm, rhythmsEqual as baseRhythmsEqual, slotsPerBar } from './metronomeRhythmPresets'

export const ENGINE_MODE_CLICK = 'click'
export const ENGINE_MODE_DRUMS = 'drums'

export const DRUM_TRACK_IDS = ['kick', 'snare', 'hat', 'rim', 'tom']
export const DRUM_SAMPLE_IDS = ['kick', 'snare', 'hat-closed', 'hat-open', 'rim', 'tom']

export const DEFAULT_DRUM_VOLUME = 0.85

export const HAT_CLOSED = 'hat-closed'
export const HAT_OPEN = 'hat-open'

export const DRUM_TRACK_DEFAULTS = [
  { id: 'kick', label: 'Kick', sample: 'kick', velocity: 1 },
  { id: 'snare', label: 'Snare', sample: 'snare', velocity: 0.9 },
  { id: 'hat', label: 'Hi-hat', sample: HAT_CLOSED, velocity: 0.6 },
  { id: 'rim', label: 'Rim', sample: 'rim', velocity: 0.7 },
  { id: 'tom', label: 'Tom', sample: 'tom', velocity: 0.75 },
]

function clampSwing(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(0.5, n))
}

function clampVelocity(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function normalizeSteps(steps, slotCount) {
  const count = Math.max(1, slotCount || 1)
  const pattern = Array.isArray(steps) ? steps.slice(0, count) : []
  while (pattern.length < count) pattern.push(0)
  return pattern.map(function(step) { return step ? 1 : 0 })
}

function normalizeStepSamples(stepSamples, steps, track, slotCount) {
  const count = Math.max(1, slotCount || 1)
  const normalized = Array.isArray(stepSamples) ? stepSamples.slice(0, count) : []
  while (normalized.length < count) normalized.push(null)
  return normalized.map(function(sample, index) {
    if (!steps[index]) return null
    if (sample && DRUM_SAMPLE_IDS.includes(sample)) return sample
    return null
  })
}

function normalizeVelocities(velocities, steps, track, slotCount) {
  const count = Math.max(1, slotCount || 1)
  const defaultVel = clampVelocity(track.velocity)
  const normalized = Array.isArray(velocities) ? velocities.slice(0, count) : []
  while (normalized.length < count) normalized.push(0)
  return normalized.map(function(velocity, index) {
    if (!steps[index]) return 0
    const v = parseFloat(velocity)
    if (Number.isFinite(v) && v > 0) return clampVelocity(v)
    return defaultVel
  })
}

function mapTracks(pattern, slotCount, mapper) {
  const normalized = normalizeDrumPattern(pattern, slotCount)
  return Object.assign({}, normalized, {
    tracks: normalized.tracks.map(mapper),
  })
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
        stepSamples: Array.from({ length: count }, function() { return null }),
        velocities: Array.from({ length: count }, function() { return 0 }),
      }
    }),
  }
}

export function normalizeDrumPattern(pattern, slotCount) {
  const count = Math.max(1, slotCount > 0 ? slotCount : ((pattern && pattern.resolution) || 16))
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
    const steps = normalizeSteps(existing && existing.steps, count)
    return {
      id: defaultTrack.id,
      label: existing && existing.label ? existing.label : defaultTrack.label,
      sample: sample,
      velocity: velocity,
      steps: steps,
      stepSamples: normalizeStepSamples(existing && existing.stepSamples, steps, {
        sample: sample,
        velocity: velocity,
      }, count),
      velocities: normalizeVelocities(existing && existing.velocities, steps, {
        velocity: velocity,
      }, count),
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
  const drumPattern = engineMode === ENGINE_MODE_DRUMS
    ? normalizeDrumPattern(rhythm.drumPattern, slotCount)
    : null
  return {
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    pulsesPerBeat: base.pulsesPerBeat,
    engineMode: engineMode,
    drumPattern: drumPattern,
    presetId: typeof rhythm.presetId === 'string' ? rhythm.presetId : '',
  }
}

function tracksArraysEqual(left, right, field) {
  const leftArr = left[field] || []
  const rightArr = right[field] || []
  if (leftArr.length !== rightArr.length) return false
  return leftArr.every(function(value, index) { return value === rightArr[index] })
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
    if (!tracksArraysEqual(track, other, 'steps')) return false
    if (!tracksArraysEqual(track, other, 'stepSamples')) return false
    if (!tracksArraysEqual(track, other, 'velocities')) return false
    return true
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
    const samples = (track.stepSamples || []).map(function(s) { return s || '_' }).join('')
    const velocities = (track.velocities || []).map(function(v) {
      return Math.round((parseFloat(v) || 0) * 100)
    }).join('')
    return track.id + ':' + (track.steps || []).join('') + ':' + samples + ':' + velocities
  }).join(';')
  return baseKey + '|' + normalized.drumPattern.swing + '|' + stepsKey
}

export function getDrumStepSample(track, stepIndex) {
  if (!track) return null
  const override = track.stepSamples && track.stepSamples[stepIndex]
  if (override && DRUM_SAMPLE_IDS.includes(override)) return override
  return track.sample
}

export function getDrumStepVelocity(track, stepIndex) {
  if (!track) return 0
  const steps = track.steps || []
  if (!steps[stepIndex]) return 0
  const velocities = track.velocities || []
  const v = parseFloat(velocities[stepIndex])
  if (Number.isFinite(v) && v > 0) return clampVelocity(v)
  return clampVelocity(track.velocity)
}

export function setDrumStep(pattern, trackId, stepIndex, value) {
  const on = !!value
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.slice()
    const stepSamples = (track.stepSamples || []).slice()
    const velocities = (track.velocities || []).slice()
    const index = ((stepIndex % steps.length) + steps.length) % steps.length
    steps[index] = on ? 1 : 0
    stepSamples[index] = on ? (stepSamples[index] || null) : null
    velocities[index] = on ? (velocities[index] > 0 ? velocities[index] : track.velocity) : 0
    return Object.assign({}, track, {
      steps: steps,
      stepSamples: stepSamples,
      velocities: velocities,
    })
  })
}

export function toggleDrumStep(pattern, trackId, stepIndex) {
  const normalized = normalizeDrumPattern(pattern)
  const track = normalized.tracks.find(function(t) { return t.id === trackId })
  if (!track) return normalized
  const steps = track.steps || []
  const index = ((stepIndex % steps.length) + steps.length) % steps.length
  return setDrumStep(normalized, trackId, index, !steps[index])
}

export function setDrumStepSample(pattern, trackId, stepIndex, sampleId) {
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.slice()
    const stepSamples = (track.stepSamples || []).slice()
    const index = ((stepIndex % steps.length) + steps.length) % steps.length
    if (!steps[index]) return track
    const sample = sampleId && DRUM_SAMPLE_IDS.includes(sampleId) ? sampleId : null
    stepSamples[index] = sample
    return Object.assign({}, track, { stepSamples: stepSamples })
  })
}

export function cycleDrumStepSample(pattern, trackId, stepIndex) {
  const normalized = normalizeDrumPattern(pattern)
  const track = normalized.tracks.find(function(t) { return t.id === trackId })
  if (!track) return normalized
  const steps = track.steps || []
  const index = ((stepIndex % steps.length) + steps.length) % steps.length
  if (!steps[index]) {
    return setDrumStep(normalized, trackId, index, true)
  }
  if (track.id !== 'hat') {
    return setDrumStep(normalized, trackId, index, false)
  }
  const current = getDrumStepSample(track, index)
  if (current === HAT_CLOSED) {
    return setDrumStepSample(normalized, trackId, index, HAT_OPEN)
  }
  if (current === HAT_OPEN) {
    return setDrumStep(normalized, trackId, index, false)
  }
  return setDrumStepSample(normalized, trackId, index, HAT_CLOSED)
}

export function setDrumStepVelocity(pattern, trackId, stepIndex, velocity) {
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.slice()
    const velocities = (track.velocities || []).slice()
    const index = ((stepIndex % steps.length) + steps.length) % steps.length
    if (!steps[index]) return track
    velocities[index] = clampVelocity(velocity)
    return Object.assign({}, track, { velocities: velocities })
  })
}

export function clearDrumTrack(pattern, trackId) {
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const count = track.steps.length
    return Object.assign({}, track, {
      steps: Array.from({ length: count }, function() { return 0 }),
      stepSamples: Array.from({ length: count }, function() { return null }),
      velocities: Array.from({ length: count }, function() { return 0 }),
    })
  })
}

export function fillDrumTrack(pattern, trackId, interval) {
  const step = Math.max(1, parseInt(interval, 10) || 1)
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.map(function(_, index) {
      return index % step === 0 ? 1 : 0
    })
    const stepSamples = steps.map(function(on, index) {
      return on ? (track.stepSamples && track.stepSamples[index]) || null : null
    })
    const velocities = steps.map(function(on, index) {
      return on ? getDrumStepVelocity(Object.assign({}, track, { steps: steps }), index) : 0
    })
    return Object.assign({}, track, {
      steps: steps,
      stepSamples: stepSamples,
      velocities: velocities,
    })
  })
}

export function invertDrumTrack(pattern, trackId) {
  return mapTracks(pattern, null, function(track) {
    if (track.id !== trackId) return track
    const steps = track.steps.map(function(value) { return value ? 0 : 1 })
    const stepSamples = steps.map(function(on, index) {
      return on ? (track.stepSamples && track.stepSamples[index]) || null : null
    })
    const velocities = steps.map(function(on, index) {
      return on ? getDrumStepVelocity(Object.assign({}, track, { steps: steps }), index) : 0
    })
    return Object.assign({}, track, {
      steps: steps,
      stepSamples: stepSamples,
      velocities: velocities,
    })
  })
}

export function shiftDrumPattern(pattern, direction) {
  const normalized = normalizeDrumPattern(pattern)
  const delta = direction < 0 ? -1 : 1
  const tracks = normalized.tracks.map(function(track) {
    const steps = track.steps.slice()
    const stepSamples = (track.stepSamples || []).slice()
    const velocities = (track.velocities || []).slice()
    const count = steps.length
    const nextSteps = Array.from({ length: count }, function() { return 0 })
    const nextSamples = Array.from({ length: count }, function() { return null })
    const nextVelocities = Array.from({ length: count }, function() { return 0 })
    for (let i = 0; i < count; i++) {
      const target = (i + delta + count) % count
      nextSteps[target] = steps[i]
      nextSamples[target] = stepSamples[i] || null
      nextVelocities[target] = velocities[i] || 0
    }
    return Object.assign({}, track, {
      steps: nextSteps,
      stepSamples: nextSamples,
      velocities: nextVelocities,
    })
  })
  return Object.assign({}, normalized, { tracks: tracks })
}

export function clearDrumPattern(pattern) {
  return createEmptyDrumPattern(pattern && pattern.resolution, pattern && pattern.swing)
}

export function copyDrumTrack(pattern, sourceTrackId, targetTrackId) {
  const normalized = normalizeDrumPattern(pattern)
  const source = normalized.tracks.find(function(track) { return track.id === sourceTrackId })
  if (!source) return normalized
  return mapTracks(normalized, normalized.resolution, function(track) {
    if (track.id !== targetTrackId) return track
    return Object.assign({}, track, {
      steps: source.steps.slice(),
      stepSamples: (source.stepSamples || []).slice(),
      velocities: (source.velocities || []).slice(),
    })
  })
}

export function applyAccentTemplate(pattern) {
  return mapTracks(pattern, null, function(track) {
    const steps = track.steps.slice()
    const velocities = steps.map(function(on, index) {
      if (!on) return 0
      if (track.id === 'snare') return 1
      if (track.id === 'kick') return 0.95
      if (track.id === 'hat') return 0.5
      if (track.id === 'rim') return 0.65
      if (track.id === 'tom') return 0.8
      return track.velocity
    })
    return Object.assign({}, track, { velocities: velocities })
  })
}

export function setDrumSwing(pattern, swing) {
  const normalized = normalizeDrumPattern(pattern)
  return Object.assign({}, normalized, { swing: clampSwing(swing) })
}

export function resizeDrumPattern(pattern, slotCount) {
  return normalizeDrumPattern(pattern, slotCount)
}

export function replaceDrumPatternTracks(pattern, tracks) {
  const normalized = normalizeDrumPattern(pattern)
  return Object.assign({}, normalized, {
    tracks: normalizeDrumPattern({ tracks: tracks, resolution: normalized.resolution, swing: normalized.swing }).tracks,
  })
}
