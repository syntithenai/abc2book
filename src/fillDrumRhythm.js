import { slotsPerBar } from './metronomeRhythmPresets'
import { getRhythmSwing, slotDurationSec } from './rhythmGrid'
import {
  ENGINE_MODE_DRUMS,
  normalizeRhythmConfig,
  normalizeDrumPattern,
} from './rhythmEngineTypes'

const EMPTY_ROLE = { bass: false, chord: false, accent: false, arpeggio: false }

export function slotRolesFromDrumPattern(drumPattern, slotIndex) {
  const pattern = normalizeDrumPattern(drumPattern)
  const tracks = pattern.tracks || []
  const role = Object.assign({}, EMPTY_ROLE)
  tracks.forEach(function(track) {
    if (!track || !track.id || !Array.isArray(track.steps)) return
    if (!track.steps[slotIndex]) return
    switch (track.id) {
      case 'kick':
        role.bass = true
        break
      case 'snare':
      case 'rim':
        role.chord = true
        break
      case 'tom':
        role.accent = true
        break
      case 'hat':
        role.arpeggio = true
        break
      default:
        break
    }
  })
  return role
}

export function roleToPatternChar(role) {
  if (!role) return ''
  if (role.bass) return 'boom'
  if (role.chord) return 'chick'
  if (role.accent) return 'boom2'
  if (role.arpeggio) return 'chick'
  return ''
}

export function roleIsActive(role) {
  return !!(role && (role.bass || role.chord || role.accent || role.arpeggio))
}

/**
 * Build reusable drum rhythm template from metronome drum config.
 * Slot times are scaled per bar via buildBarScheduleFromContext.
 */
export function buildFillRhythmContext(drumRhythm) {
  const config = normalizeRhythmConfig(drumRhythm)
  if (config.engineMode !== ENGINE_MODE_DRUMS || !config.drumPattern) return null
  const totalSlots = slotsPerBar(config)
  if (!(totalSlots > 0)) return null

  const swing = getRhythmSwing(config)
  const relDurations = []
  for (let slot = 0; slot < totalSlots; slot += 1) {
    relDurations.push(slotDurationSec(config, slot, 1, swing))
  }

  const roles = []
  const pattern = []
  for (let slot = 0; slot < totalSlots; slot += 1) {
    const role = slotRolesFromDrumPattern(config.drumPattern, slot)
    roles.push(role)
    pattern.push(roleToPatternChar(role))
  }

  return {
    source: 'drum',
    rhythm: config,
    slotsPerBar: totalSlots,
    relDurations: relDurations,
    roles: roles,
    pattern: pattern,
  }
}

export function buildBarScheduleFromContext(rhythmContext, barDurationSec) {
  if (!rhythmContext || !(rhythmContext.slotsPerBar > 0)) return null
  const relTotal = rhythmContext.relDurations.reduce(function(sum, value) {
    return sum + value
  }, 0)
  if (!(relTotal > 0) || !(barDurationSec > 0)) return null

  const slotStartsSec = []
  const slotDurationsSec = []
  let elapsed = 0
  for (let slot = 0; slot < rhythmContext.slotsPerBar; slot += 1) {
    const dur = (rhythmContext.relDurations[slot] / relTotal) * barDurationSec
    slotStartsSec.push(Math.round(elapsed * 1000000) / 1000000)
    slotDurationsSec.push(Math.round(dur * 1000000) / 1000000)
    elapsed += dur
  }

  return {
    source: 'drum',
    slotsPerBar: rhythmContext.slotsPerBar,
    slotStartsSec: slotStartsSec,
    slotDurationsSec: slotDurationsSec,
    roles: rhythmContext.roles,
    pattern: rhythmContext.pattern,
  }
}

export function buildActiveSlotIndices(schedule, options) {
  const opts = options || {}
  const includeArpeggio = opts.includeArpeggio !== false
  if (!schedule || !Array.isArray(schedule.roles)) return []
  const indices = []
  schedule.roles.forEach(function(role, index) {
    if (!role) return
    if (role.bass || role.chord || role.accent) {
      indices.push(index)
      return
    }
    if (includeArpeggio && role.arpeggio) indices.push(index)
  })
  return indices
}

export function buildChordHitSlots(schedule) {
  if (!schedule || !Array.isArray(schedule.roles)) return []
  return schedule.roles.reduce(function(acc, role, index) {
    if (role && (role.chord || role.accent)) acc.push(index)
    return acc
  }, [])
}

export function buildBassHitSlots(schedule) {
  if (!schedule || !Array.isArray(schedule.roles)) return []
  return schedule.roles.reduce(function(acc, role, index) {
    if (role && (role.bass || role.accent)) acc.push(index)
    return acc
  }, [])
}
