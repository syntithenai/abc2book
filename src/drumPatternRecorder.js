import { slotsPerBar } from './metronomeRhythmPresets'
import {
  getRhythmSwing,
  musicSecondsForGlobalSlot,
  barDurationSec,
} from './rhythmGrid'
import { normalizeRhythmConfig, setDrumStep } from './rhythmEngineTypes'

const MAX_RECORD_UNDO = 32

/**
 * Quantize an audioContext time to the nearest rhythm slot within a looping bar.
 * @param {number} hitTime - audioContext.currentTime of the hit
 * @param {number} downbeatTime - audioContext time of slot 0 in the current loop
 * @param {object} rhythm - rhythm config
 * @param {number} tempo - BPM
 * @returns {number} slot index 0..slotsPerBar-1
 */
export function quantizeHitTimeToSlot(hitTime, downbeatTime, rhythm, tempo) {
  const config = normalizeRhythmConfig(rhythm)
  const swing = getRhythmSwing(config)
  const totalSlots = slotsPerBar(config)
  if (!(totalSlots > 0)) return 0
  const barDur = barDurationSec(config, tempo, swing)
  if (!(barDur > 0)) return 0

  const elapsed = Math.max(0, hitTime - downbeatTime)
  const loopPos = elapsed % barDur
  let bestSlot = 0
  let bestDist = Infinity
  for (let slot = 0; slot < totalSlots; slot++) {
    const slotTime = musicSecondsForGlobalSlot(slot, config, tempo, swing)
    const dist = Math.abs(slotTime - loopPos)
    if (dist < bestDist) {
      bestDist = dist
      bestSlot = slot
    }
  }
  return bestSlot
}

/**
 * @param {object} options
 * @param {object} options.rhythm
 * @param {number} options.tempo
 * @param {'replace'|'overdub'} [options.mode]
 * @param {object} [options.initialPattern]
 */
export function createRecordingSession(options) {
  const opts = options || {}
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  const tempo = parseFloat(opts.tempo) || 120
  const mode = opts.mode === 'overdub' ? 'overdub' : 'replace'
  let pattern = opts.initialPattern
    ? JSON.parse(JSON.stringify(opts.initialPattern))
    : (rhythm.drumPattern ? JSON.parse(JSON.stringify(rhythm.drumPattern)) : null)
  const undoStack = []
  let downbeatTime = null
  let armed = false

  function pushUndo() {
    if (!pattern) return
    undoStack.push(JSON.parse(JSON.stringify(pattern)))
    if (undoStack.length > MAX_RECORD_UNDO) undoStack.shift()
  }

  return {
    getPattern: function() {
      return pattern ? JSON.parse(JSON.stringify(pattern)) : null
    },
    setDownbeatTime: function(time) {
      downbeatTime = parseFloat(time)
    },
    arm: function(clearPattern) {
      armed = true
      if (mode === 'replace' && clearPattern) {
        const count = slotsPerBar(rhythm)
        pattern = {
          resolution: count,
          swing: rhythm.drumPattern ? rhythm.drumPattern.swing : 0,
          tracks: (rhythm.drumPattern && rhythm.drumPattern.tracks
            ? rhythm.drumPattern.tracks
            : []).map(function(track) {
            return Object.assign({}, track, {
              steps: Array.from({ length: count }, function() { return 0 }),
              stepSamples: Array.from({ length: count }, function() { return null }),
              velocities: Array.from({ length: count }, function() { return 0 }),
            })
          }),
        }
      }
    },
    disarm: function() {
      armed = false
    },
    isArmed: function() {
      return armed
    },
    /**
     * @returns {{ pattern: object, slotIndex: number, trackId: string }|null}
     */
    noteHit: function(trackId, hitTime) {
      if (!armed || downbeatTime == null || !pattern) return null
      const slotIndex = quantizeHitTimeToSlot(hitTime, downbeatTime, rhythm, tempo)
      pushUndo()
      if (mode === 'overdub' || !pattern.tracks.some(function(t) {
        return t.id === trackId && t.steps && t.steps[slotIndex]
      })) {
        pattern = setDrumStep(pattern, trackId, slotIndex, true)
      }
      return { pattern: JSON.parse(JSON.stringify(pattern)), slotIndex: slotIndex, trackId: trackId }
    },
    undoLastHit: function() {
      if (undoStack.length === 0) return null
      pattern = undoStack.pop()
      return pattern ? JSON.parse(JSON.stringify(pattern)) : null
    },
  }
}
