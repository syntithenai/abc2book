import { slotsPerBar } from './metronomeRhythmPresets'
import { barDurationSec, getRhythmSwing, slotDurationSec } from './rhythmGrid'
import { normalizeRhythmConfig, setDrumStep } from './rhythmEngineTypes'

const MAX_RECORD_UNDO = 32

function transportSlotOffsetInBarSec(rhythm, tempo, slotIndex) {
  const config = normalizeRhythmConfig(rhythm)
  const secPerBeat = 60 / (parseFloat(tempo) || 120)
  const swing = getRhythmSwing(config)
  let offset = 0
  for (let slot = 0; slot < slotIndex; slot++) {
    offset += slotDurationSec(config, slot, secPerBeat, swing)
  }
  return offset
}

export function transportBarDurationSec(rhythm, tempo) {
  const config = normalizeRhythmConfig(rhythm)
  const swing = getRhythmSwing(config)
  return barDurationSec(config, tempo, swing)
}

/**
 * Quantize an audioContext time to the nearest rhythm slot within a looping bar.
 * Matches Metronome playback timing, including drum swing.
 * @param {number} hitTime - audioContext.currentTime of the hit
 * @param {number} downbeatTime - audioContext time of slot 0 in the current loop
 * @param {object} rhythm - rhythm config
 * @param {number} tempo - BPM
 * @param {number} [preferredSlot] - active transport slot, when available
 * @returns {number} slot index 0..slotsPerBar-1
 */
export function quantizeHitTimeToSlot(hitTime, downbeatTime, rhythm, tempo, preferredSlot) {
  const config = normalizeRhythmConfig(rhythm)
  const totalSlots = slotsPerBar(config)
  if (!(totalSlots > 0)) return 0
  if (preferredSlot != null && preferredSlot >= 0 && preferredSlot < totalSlots) {
    return preferredSlot
  }

  const barDur = transportBarDurationSec(config, tempo)
  if (!(barDur > 0)) return 0

  const elapsed = Math.max(0, hitTime - downbeatTime)
  const loopPos = elapsed % barDur
  let bestSlot = 0
  let bestDist = Infinity
  for (let slot = 0; slot < totalSlots; slot++) {
    const slotTime = transportSlotOffsetInBarSec(config, tempo, slot)
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
 * @param {object} [options.initialPattern]
 */
export function createRecordingSession(options) {
  const opts = options || {}
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  const tempo = parseFloat(opts.tempo) || 120
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
    arm: function() {
      armed = true
    },
    disarm: function() {
      armed = false
    },
    isArmed: function() {
      return armed
    },
    /**
     * @param {number} [preferredSlot]
     * @returns {{ pattern: object, slotIndex: number, trackId: string }|null}
     */
    noteHit: function(trackId, hitTime, preferredSlot) {
      if (!armed || downbeatTime == null || !pattern) return null
      const slotIndex = quantizeHitTimeToSlot(hitTime, downbeatTime, rhythm, tempo, preferredSlot)
      pushUndo()
      pattern = setDrumStep(pattern, trackId, slotIndex, true)
      return { pattern: JSON.parse(JSON.stringify(pattern)), slotIndex: slotIndex, trackId: trackId }
    },
    undoLastHit: function() {
      if (undoStack.length === 0) return null
      pattern = undoStack.pop()
      return pattern ? JSON.parse(JSON.stringify(pattern)) : null
    },
  }
}
