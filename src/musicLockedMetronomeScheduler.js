import { slotBeatIndex, slotPulseIndex, slotsPerBar } from './metronomeRhythmPresets'
import { normalizeRhythmConfig, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'

export const DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC = 0.15

export function createMusicLockedMetronomeState() {
  return {
    scheduledKeys: new Set(),
    anchorMusicSeconds: null,
    anchorAudioTime: null,
    tempo: 0,
  }
}

export function resetMusicLockedMetronome(state) {
  if (!state) return
  state.scheduledKeys = new Set()
  state.anchorMusicSeconds = null
  state.anchorAudioTime = null
  state.tempo = 0
}

export function getRhythmSwing(rhythm) {
  const config = normalizeRhythmConfig(rhythm)
  if (config.engineMode !== ENGINE_MODE_DRUMS || !config.drumPattern) return 0
  const swing = parseFloat(config.drumPattern.swing)
  return Number.isFinite(swing) && swing > 0 ? Math.min(0.5, swing) : 0
}

export function slotDurationSec(rhythm, slot, secPerBeat, swing) {
  const config = normalizeRhythmConfig(rhythm)
  const beatIndex = slotBeatIndex(config, slot)
  const pulses = (config.pulsesPerBeat && config.pulsesPerBeat[beatIndex]) || 1
  if (pulses <= 1 || !(swing > 0)) {
    return secPerBeat / pulses
  }
  const pulseIndex = slotPulseIndex(config, slot)
  if (pulses === 2) {
    const long = secPerBeat * (0.5 + swing * 0.5)
    const short = secPerBeat - long
    return pulseIndex === 0 ? long : short
  }
  const even = secPerBeat / pulses
  if (pulseIndex === 0) {
    return even * (1 + swing)
  }
  if (pulseIndex === 1) {
    return even * (1 - swing)
  }
  return even
}

export function barDurationSec(rhythm, tempo, swing) {
  const config = normalizeRhythmConfig(rhythm)
  const secPerBeat = 60 / (parseFloat(tempo) || 120)
  const totalSlots = slotsPerBar(config)
  let dur = 0
  for (let slot = 0; slot < totalSlots; slot++) {
    dur += slotDurationSec(config, slot, secPerBeat, swing)
  }
  return dur
}

export function musicSecondsForGlobalSlot(globalSlot, rhythm, tempo, swing) {
  const config = normalizeRhythmConfig(rhythm)
  const secPerBeat = 60 / (parseFloat(tempo) || 120)
  const totalSlots = slotsPerBar(config)
  if (!(totalSlots > 0)) return 0
  const slot = ((globalSlot % totalSlots) + totalSlots) % totalSlots
  const barIndex = Math.floor(globalSlot / totalSlots)
  let secs = barIndex * barDurationSec(config, tempo, swing)
  for (let s = 0; s < slot; s++) {
    secs += slotDurationSec(config, s, secPerBeat, swing)
  }
  return Math.max(0, secs)
}

export function globalSlotAtMusicSeconds(musicSeconds, rhythm, tempo, swing) {
  const config = normalizeRhythmConfig(rhythm)
  const secPerBeat = 60 / (parseFloat(tempo) || 120)
  const totalSlots = slotsPerBar(config)
  if (!(totalSlots > 0)) return 0
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const barDur = barDurationSec(config, tempo, swing)
  if (!(barDur > 0)) return 0
  const barIndex = Math.floor(secs / barDur)
  const posInBar = secs - barIndex * barDur
  let elapsed = 0
  for (let slot = 0; slot < totalSlots; slot++) {
    const slotDur = slotDurationSec(config, slot, secPerBeat, swing)
    if (posInBar < elapsed + slotDur - 0.0001) {
      return barIndex * totalSlots + slot
    }
    elapsed += slotDur
  }
  return (barIndex + 1) * totalSlots
}

export function slotScheduleKey(globalSlot) {
  return String(globalSlot)
}

export function audioTimeForMusicSeconds(state, musicSeconds, audioContextTime) {
  if (state.anchorMusicSeconds == null || state.anchorAudioTime == null) {
    state.anchorMusicSeconds = musicSeconds
    state.anchorAudioTime = audioContextTime
  }
  return state.anchorAudioTime + (musicSeconds - state.anchorMusicSeconds)
}

function musicSecondsToAudioTime(state, slotMusicTime) {
  return state.anchorAudioTime + (slotMusicTime - state.anchorMusicSeconds)
}

/**
 * Schedule clicks/drums from the music clock. Re-anchors each call so playback
 * cannot drift from the tune.
 */
export function scheduleMusicLockedSlots(state, options) {
  const opts = options || {}
  if (!state) return { scheduled: 0 }
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  const tempo = parseFloat(opts.tempo) || 120
  const swing = opts.swing != null ? opts.swing : getRhythmSwing(rhythm)
  const musicSeconds = Math.max(0, parseFloat(opts.musicSeconds) || 0)
  const audioContextTime = parseFloat(opts.audioContextTime)
  const lookaheadSec = opts.lookaheadSec > 0
    ? parseFloat(opts.lookaheadSec)
    : DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC
  const playSlot = opts.playSlot
  if (!playSlot || !Number.isFinite(audioContextTime)) {
    return { scheduled: 0 }
  }

  state.anchorMusicSeconds = musicSeconds
  state.anchorAudioTime = audioContextTime
  state.tempo = tempo

  const totalSlots = slotsPerBar(rhythm)
  if (!(totalSlots > 0)) return { scheduled: 0 }

  let globalSlot = globalSlotAtMusicSeconds(musicSeconds, rhythm, tempo, swing)
  const endMusicSeconds = musicSeconds + lookaheadSec
  let scheduled = 0

  while (true) {
    const slotMusicTime = musicSecondsForGlobalSlot(globalSlot, rhythm, tempo, swing)
    if (slotMusicTime > endMusicSeconds + 0.0001) break
    if (slotMusicTime >= musicSeconds - 0.0001) {
      const key = slotScheduleKey(globalSlot)
      if (!state.scheduledKeys.has(key)) {
        const slotInBar = ((globalSlot % totalSlots) + totalSlots) % totalSlots
        const audioTime = musicSecondsToAudioTime(state, slotMusicTime)
        if (audioTime >= audioContextTime - 0.001) {
          playSlot(audioTime, slotInBar, globalSlot)
          state.scheduledKeys.add(key)
          scheduled += 1
        }
      }
    }
    globalSlot += 1
    if (globalSlot > 100000) break
  }

  return { scheduled: scheduled }
}
