import { createRhythm, slotsPerBar } from './metronomeRhythmPresets'
import {
  createRhythmConfig,
  normalizeDrumPattern,
  normalizeRhythmConfig,
  ENGINE_MODE_DRUMS,
  setDrumStep,
} from './rhythmEngineTypes'

export const MAX_SLOTS_PER_BAR = 32

export const EDITOR_SUBDIVISION_BEATS = 'beats'
export const EDITOR_SUBDIVISION_PULSES = 'pulses'
export const EDITOR_SUBDIVISION_HALF_PULSES = 'halfPulses'

const SUBDIVISION_LABELS = {
  [EDITOR_SUBDIVISION_BEATS]: 'Beats',
  [EDITOR_SUBDIVISION_PULSES]: 'Pulses',
  [EDITOR_SUBDIVISION_HALF_PULSES]: 'Half pulses',
}

function pulsesArray(rhythm) {
  const r = normalizeRhythmConfig(rhythm)
  return Array.isArray(r.pulsesPerBeat) ? r.pulsesPerBeat.slice() : [1]
}

function pulsesEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false
  return left.every(function(value, index) { return value === right[index] })
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

export function slotRangeForBeat(rhythm, beatIndex) {
  const config = normalizeRhythmConfig(rhythm)
  let start = 0
  for (let i = 0; i < beatIndex; i++) {
    start += config.pulsesPerBeat[i] || 1
  }
  const count = config.pulsesPerBeat[beatIndex] || 1
  return { start: start, count: count, end: start + count }
}

export function beatsMatchPulsesView(rhythm) {
  return pulsesArray(rhythm).every(function(pulses) { return pulses === 1 })
}

export function getEditorSubdivisionOptions(rhythm) {
  const config = normalizeRhythmConfig(rhythm)
  const options = [
    {
      id: EDITOR_SUBDIVISION_BEATS,
      label: SUBDIVISION_LABELS[EDITOR_SUBDIVISION_BEATS],
      slotsPerBar: config.beatsPerBar,
    },
    {
      id: EDITOR_SUBDIVISION_PULSES,
      label: SUBDIVISION_LABELS[EDITOR_SUBDIVISION_PULSES],
      slotsPerBar: slotsPerBar(config),
    },
  ]
  const doubled = pulsesArray(config).map(function(pulses) { return pulses * 2 })
  const doubledSlots = doubled.reduce(function(sum, pulses) { return sum + pulses }, 0)
  if (doubledSlots <= MAX_SLOTS_PER_BAR) {
    options.push({
      id: EDITOR_SUBDIVISION_HALF_PULSES,
      label: SUBDIVISION_LABELS[EDITOR_SUBDIVISION_HALF_PULSES],
      slotsPerBar: doubledSlots,
    })
  }
  return options
}

export function getEditorSlotCount(rhythm, subdivision) {
  const config = normalizeRhythmConfig(rhythm)
  if (subdivision === EDITOR_SUBDIVISION_BEATS) return config.beatsPerBar
  return slotsPerBar(config)
}

export function editorSubdivisionHint(rhythm, subdivision) {
  const config = normalizeRhythmConfig(rhythm)
  if (subdivision === EDITOR_SUBDIVISION_BEATS) {
    return config.beatsPerBar + ' beat groups'
  }
  if (subdivision === EDITOR_SUBDIVISION_HALF_PULSES) {
    return slotsPerBar(config) + ' half-pulse steps per bar'
  }
  return slotsPerBar(config) + ' pulse steps per bar'
}

function targetPulsesForSubdivision(rhythm, subdivision, previousSubdivision) {
  const pulses = pulsesArray(rhythm)
  if (subdivision === EDITOR_SUBDIVISION_HALF_PULSES) {
    if (previousSubdivision !== EDITOR_SUBDIVISION_HALF_PULSES) {
      return pulses.map(function(p) { return p * 2 })
    }
    return pulses
  }
  if (subdivision === EDITOR_SUBDIVISION_PULSES
      && previousSubdivision === EDITOR_SUBDIVISION_HALF_PULSES) {
    return pulses.map(function(p) { return Math.max(1, p / 2) })
  }
  return pulses
}

export function applyEditorSubdivision(rhythm, subdivision, previousSubdivision) {
  const config = normalizeRhythmConfig(rhythm)
  if (subdivision === EDITOR_SUBDIVISION_BEATS) return config

  const targetPulses = targetPulsesForSubdivision(config, subdivision, previousSubdivision)
  if (pulsesEqual(targetPulses, pulsesArray(config))) return config

  const base = createRhythm(config.beatsPerBar, config.accents, targetPulses)
  const nextRhythm = createRhythmConfig(base.beatsPerBar, base.accents, base.pulsesPerBeat, {
    engineMode: config.engineMode,
    presetId: '',
    drumPattern: config.engineMode === ENGINE_MODE_DRUMS && config.drumPattern
      ? remapDrumPatternGranularity(config.drumPattern, config, base)
      : null,
  })
  if (config.engineMode === ENGINE_MODE_DRUMS && nextRhythm.drumPattern && config.drumPattern) {
    nextRhythm.drumPattern.swing = config.drumPattern.swing
  }
  return nextRhythm
}

export function beatGroupIsOn(track, rhythm, beatIndex) {
  if (!track || !Array.isArray(track.steps)) return false
  const range = slotRangeForBeat(rhythm, beatIndex)
  for (let i = 0; i < range.count; i++) {
    if (track.steps[range.start + i]) return true
  }
  return false
}

export function setDrumBeatSteps(pattern, trackId, beatIndex, rhythm, on) {
  if (!pattern) return pattern
  const range = slotRangeForBeat(rhythm, beatIndex)
  let next = pattern
  for (let i = 0; i < range.count; i++) {
    next = setDrumStep(next, trackId, range.start + i, on)
  }
  return next
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

export function remapDrumRhythmPulses(previousRhythm, nextRhythm) {
  const prev = normalizeRhythmConfig(previousRhythm)
  const next = normalizeRhythmConfig(nextRhythm)
  if (!next.drumPattern && prev.drumPattern) {
    next.drumPattern = remapDrumPatternGranularity(prev.drumPattern, prev, next)
  } else if (next.drumPattern) {
    next.drumPattern = remapDrumPatternGranularity(next.drumPattern, prev, next)
  }
  return next
}
