import { createRhythm, slotsPerBar } from './metronomeRhythmPresets'
import {
  createRhythmConfig,
  normalizeDrumPattern,
  normalizeRhythmConfig,
  ENGINE_MODE_DRUMS,
} from './rhythmEngineTypes'

export const MAX_SLOTS_PER_BAR = 32

function pulsesArray(rhythm) {
  const r = normalizeRhythmConfig(rhythm)
  return Array.isArray(r.pulsesPerBeat) ? r.pulsesPerBeat.slice() : [1]
}

function gcd(a, b) {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

function uniformMultiplier(leftPulses, rightPulses) {
  if (leftPulses.length !== rightPulses.length) return 0
  let ratio = 0
  for (let i = 0; i < leftPulses.length; i++) {
    const left = leftPulses[i]
    const right = rightPulses[i]
    if (!(left > 0) || !(right > 0)) return 0
    if (left === right) continue
    if (left > right) {
      if (left % right !== 0) return 0
      const r = left / right
      ratio = ratio === 0 ? r : (ratio === r ? ratio : 0)
    } else {
      if (right % left !== 0) return 0
      const r = right / left
      ratio = ratio === 0 ? r : (ratio === r ? ratio : 0)
    }
    if (ratio === 0) return 0
  }
  return ratio || 1
}

/** Pulse shape key ignoring absolute values (e.g. [3,3] matches [6,6]). */
export function pulseShapeKey(pulsesPerBeat) {
  const pulses = Array.isArray(pulsesPerBeat) ? pulsesPerBeat : [pulsesPerBeat || 1]
  const g = pulses.reduce(function(acc, p) { return gcd(acc, p) }, pulses[0] || 1)
  return pulses.map(function(p) { return Math.max(1, Math.round(p / g)) }).join('+')
}

export function rhythmPulseShapeKey(rhythm) {
  const r = normalizeRhythmConfig(rhythm)
  return r.beatsPerBar + ':' + pulseShapeKey(r.pulsesPerBeat)
}

/**
 * @returns {Array<{ multiplier: number, label: string, pulsesPerBeat: number[] }>}
 */
export function getGranularityOptions(rhythm) {
  const config = normalizeRhythmConfig(rhythm)
  const pulses = pulsesArray(config)
  const shape = pulseShapeKey(pulses)
  const multipliers = [1, 2, 4]
  const labelsByShape = {
    '1+1+1+1': { 1: 'Quarter', 2: 'Eighth', 4: '16th' },
    '1+1': { 1: 'Beat groups', 2: 'Finer', 4: 'Finest' },
    '1+1+1': { 1: 'Quarter', 2: 'Eighth', 4: '16th' },
    '1+1+1+1+1': { 1: 'Quarter', 2: 'Eighth', 4: '16th' },
  }
  const defaultLabels = { 1: 'Coarse', 2: 'Medium', 4: 'Fine' }
  const labelMap = labelsByShape[shape] || defaultLabels
  const options = []
  multipliers.forEach(function(multiplier) {
    const scaled = pulses.map(function(p) { return p * multiplier })
    const total = scaled.reduce(function(s, p) { return s + p }, 0)
    if (total > MAX_SLOTS_PER_BAR) return
    options.push({
      multiplier: multiplier,
      label: labelMap[multiplier] || ('×' + multiplier),
      pulsesPerBeat: scaled,
      slotsPerBar: total,
      isActive: pulses.every(function(p, i) { return p === scaled[i] }),
    })
  })
  if (options.length === 0) {
    options.push({
      multiplier: 1,
      label: 'Current',
      pulsesPerBeat: pulses,
      slotsPerBar: slotsPerBar(config),
      isActive: true,
    })
  } else {
    options.forEach(function(opt) {
      opt.isActive = pulses.every(function(p, i) { return p === opt.pulsesPerBeat[i] })
    })
  }
  return options
}

export function getActiveGranularityMultiplier(rhythm) {
  const options = getGranularityOptions(rhythm)
  const active = options.find(function(o) { return o.isActive })
  return active ? active.multiplier : 1
}

function remapTrackSteps(steps, stepSamples, velocities, oldSlots, newSlots, factor) {
  const oldSteps = steps || []
  const oldSamples = stepSamples || []
  const oldVel = velocities || []
  const nextSteps = Array.from({ length: newSlots }, function() { return 0 })
  const nextSamples = Array.from({ length: newSlots }, function() { return null })
  const nextVel = Array.from({ length: newSlots }, function() { return 0 })

  if (factor >= 1) {
    for (let i = 0; i < oldSlots; i++) {
      if (!oldSteps[i]) continue
      for (let sub = 0; sub < factor; sub++) {
        const target = i * factor + sub
        if (target < newSlots) {
          nextSteps[target] = 1
          nextSamples[target] = oldSamples[i] || null
          nextVel[target] = oldVel[i] > 0 ? oldVel[i] : 0
        }
      }
    }
  } else {
    const group = -factor
    for (let i = 0; i < newSlots; i++) {
      let on = false
      let sample = null
      let vel = 0
      for (let sub = 0; sub < group; sub++) {
        const src = i * group + sub
        if (src < oldSlots && oldSteps[src]) {
          on = true
          if (!sample && oldSamples[src]) sample = oldSamples[src]
          vel = Math.max(vel, oldVel[src] || 0)
        }
      }
      nextSteps[i] = on ? 1 : 0
      nextSamples[i] = on ? sample : null
      nextVel[i] = on ? vel : 0
    }
  }
  return { steps: nextSteps, stepSamples: nextSamples, velocities: nextVel }
}

export function remapDrumPatternGranularity(pattern, oldRhythm, newRhythm) {
  const oldSlots = slotsPerBar(normalizeRhythmConfig(oldRhythm))
  const newSlots = slotsPerBar(normalizeRhythmConfig(newRhythm))
  if (oldSlots === newSlots) return normalizeDrumPattern(pattern, newSlots)
  const normalized = normalizeDrumPattern(pattern, oldSlots)
  let factor = uniformMultiplier(pulsesArray(oldRhythm), pulsesArray(newRhythm))
  if (!factor) {
    if (newSlots > oldSlots && newSlots % oldSlots === 0) factor = newSlots / oldSlots
    else if (oldSlots > newSlots && oldSlots % newSlots === 0) factor = -(oldSlots / newSlots)
    else return normalizeDrumPattern(pattern, newSlots)
  }
  const tracks = normalized.tracks.map(function(track) {
    const remapped = remapTrackSteps(
      track.steps,
      track.stepSamples,
      track.velocities,
      oldSlots,
      newSlots,
      factor
    )
    return Object.assign({}, track, remapped)
  })
  return normalizeDrumPattern(Object.assign({}, normalized, {
    resolution: newSlots,
    tracks: tracks,
  }), newSlots)
}

/**
 * Scale pulsesPerBeat by multiplier and remap drum pattern.
 * @param {object} rhythm - full rhythm config
 * @param {number} multiplier - 1, 2, or 4
 */
export function setRhythmGranularity(rhythm, multiplier) {
  const config = normalizeRhythmConfig(rhythm)
  const option = getGranularityOptions(config).find(function(o) {
    return o.multiplier === multiplier
  })
  if (!option) return config
  const base = createRhythm(config.beatsPerBar, config.accents, option.pulsesPerBeat)
  const nextRhythm = createRhythmConfig(base.beatsPerBar, base.accents, base.pulsesPerBeat, {
    engineMode: config.engineMode,
    presetId: '',
    drumPattern: config.engineMode === ENGINE_MODE_DRUMS && config.drumPattern
      ? remapDrumPatternGranularity(config.drumPattern, config, base)
      : null,
  })
  if (config.engineMode === ENGINE_MODE_DRUMS && nextRhythm.drumPattern) {
    nextRhythm.drumPattern.swing = config.drumPattern.swing
  }
  return nextRhythm
}
