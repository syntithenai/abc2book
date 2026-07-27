import { playMetronomeTick, getDrumVolume } from './metronomeTickSounds'
import { slotAccentLevel, slotBeatIndex } from './metronomeRhythmPresets'
import { ENGINE_MODE_DRUMS, normalizeRhythmConfig } from './rhythmEngineTypes'
import { playDrumHit } from './drumSampleKit'

export function playRhythmSlot(audioContext, time, rhythm, slotIndex, destination) {
  if (!audioContext || !rhythm) return

  const config = normalizeRhythmConfig(rhythm)
  if (config.engineMode === ENGINE_MODE_DRUMS && config.drumPattern) {
    playDrumSlot(audioContext, time, config, slotIndex, destination)
    return
  }

  const accentLevel = slotAccentLevel(config, slotIndex)
  playMetronomeTick(audioContext, time, accentLevel, destination)
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
    const velocity = (parseFloat(track.velocity) || 0) * masterVolume
    playDrumHit(audioContext, time, track.sample, velocity, 0, destination)
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
