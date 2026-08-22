import { playMetronomeTick, getDrumVolume } from './metronomeTickSounds'
import { slotAccentLevel, slotBeatIndex, slotPulseIndex } from './metronomeRhythmPresets'
import {
  ENGINE_MODE_DRUMS,
  normalizeRhythmConfig,
  getDrumStepSample,
  getDrumStepVelocity,
} from './rhythmEngineTypes'
import { playDrumHit } from './drumSampleKit'

/** Beat accents in compound meters (e.g. 9/8) read slightly late vs piano
 * onset once subdivision clicks lock the pulse; nudge those beats earlier.
 * Simple meters (3/4, 2/4 with one pulse/beat) stay on the grid. */
export const COMPOUND_BEAT_CLICK_ADVANCE_SEC = 0.006

export function playRhythmSlot(audioContext, time, rhythm, slotIndex, destination) {
  if (!audioContext || !rhythm) return

  const config = normalizeRhythmConfig(rhythm)
  if (config.engineMode === ENGINE_MODE_DRUMS && config.drumPattern) {
    playDrumSlot(audioContext, time, config, slotIndex, destination)
    return
  }

  const accentLevel = slotAccentLevel(config, slotIndex)
  let when = time
  const compound = Array.isArray(config.pulsesPerBeat)
    && config.pulsesPerBeat.some(function(p) { return (parseInt(p, 10) || 1) > 1 })
  if (compound && slotPulseIndex(config, slotIndex) === 0) {
    when = time - COMPOUND_BEAT_CLICK_ADVANCE_SEC
  }
  playMetronomeTick(audioContext, when, accentLevel, destination)
}

export function playDrumSlot(audioContext, time, rhythm, slotIndex, destination) {
  if (!audioContext || !rhythm || !rhythm.drumPattern) return

  const pattern = rhythm.drumPattern
  const tracks = pattern.tracks || []
  const totalSteps = pattern.resolution || 1
  const stepIndex = ((slotIndex % totalSteps) + totalSteps) % totalSteps
  const masterVolume = getDrumVolume()

  tracks.forEach(function(track) {
    const steps = track.steps || []
    if (!steps[stepIndex]) return
    const sampleId = getDrumStepSample(track, stepIndex)
    const velocity = getDrumStepVelocity(track, stepIndex) * masterVolume
    playDrumHit(audioContext, time, sampleId, velocity, 0, destination)
  })
}

/**
 * Play all slots in a bar for during-playback drum loops.
 * Returns scheduled slot count.
 */
export function playDrumBarSlots(audioContext, startTime, rhythm, tempo) {
  if (!audioContext || !rhythm || !rhythm.drumPattern) return 0
  const config = normalizeRhythmConfig(rhythm)
  if (config.engineMode !== ENGINE_MODE_DRUMS) return 0

  const totalSteps = config.drumPattern.resolution || 1
  const secondsPerBeat = 60 / (parseFloat(tempo) || 120)
  let slotTime = startTime

  for (let slot = 0; slot < totalSteps; slot++) {
    const beatIndex = slotBeatIndex(config, slot)
    const pulsesForBeat = (config.pulsesPerBeat && config.pulsesPerBeat[beatIndex]) || 1
    const slotDuration = secondsPerBeat / pulsesForBeat
    playDrumSlot(audioContext, slotTime, config, slot)
    slotTime += slotDuration
  }
  return totalSteps
}
