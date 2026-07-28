import { slotBeatIndex, slotPulseIndex, slotsPerBar } from './metronomeRhythmPresets'
import { normalizeRhythmConfig, ENGINE_MODE_DRUMS } from './rhythmEngineTypes'

export const DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC = 0.15
export const MAX_MUSIC_LOCKED_LOOKAHEAD_SEC = 8

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

export function computeMusicLockedLookaheadSec(rhythm, tempo, swing) {
  const barDur = barDurationSec(rhythm, tempo, swing)
  if (!(barDur > 0)) {
    return DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC
  }
  return Math.min(
    MAX_MUSIC_LOCKED_LOOKAHEAD_SEC,
    Math.max(DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC, barDur)
  )
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

export function slotInBarForGlobal(globalSlot, totalSlots) {
  return ((globalSlot % totalSlots) + totalSlots) % totalSlots
}

export function secPerRhythmBeat(tempo) {
  return 60 / (parseFloat(tempo) || 120)
}

/** Duration of one rhythm pulse after the last count-in slot (entry gap). */
export function entryGapDurationSec(rhythm, tempo, swing, slotIndexInBar) {
  const config = normalizeRhythmConfig(rhythm)
  const secPerBeat = secPerRhythmBeat(tempo)
  const totalSlots = slotsPerBar(config)
  const slot = ((slotIndexInBar % totalSlots) + totalSlots) % totalSlots
  return slotDurationSec(config, slot, secPerBeat, swing)
}

export function createPlayingScheduleState() {
  return {
    scheduledKeys: new Set(),
    epochMusicSeconds: null,
    epochAudioTime: null,
    tempo: 0,
  }
}

export function bootstrapPlayingScheduleEpoch(state, musicSeconds, audioContextTime, tempo) {
  resetPlayingScheduleState(state)
  ensureScheduleEpoch(state, musicSeconds, audioContextTime, tempo)
}

export function resetPlayingScheduleState(state) {
  if (!state) return
  state.scheduledKeys = new Set()
  state.epochMusicSeconds = null
  state.epochAudioTime = null
  state.tempo = 0
}

export const SCHEDULE_DRIFT_REANCHOR_SEC = 0.08

export function ensureScheduleEpoch(state, musicSeconds, audioContextTime, tempo) {
  const nextTempo = parseFloat(tempo) || 120
  const tempoChanged = state.tempo > 0 && state.tempo !== nextTempo
  if (state.epochMusicSeconds == null || state.epochAudioTime == null || tempoChanged) {
    state.epochMusicSeconds = musicSeconds
    state.epochAudioTime = audioContextTime
    state.tempo = nextTempo
    return
  }
  const expectedAudio = state.epochAudioTime + (musicSeconds - state.epochMusicSeconds)
  const drift = Math.abs(expectedAudio - audioContextTime)
  if (drift > SCHEDULE_DRIFT_REANCHOR_SEC) {
    state.epochMusicSeconds = musicSeconds
    state.epochAudioTime = audioContextTime
  }
  state.tempo = nextTempo
}

function slotMusicTimeToAudio(state, slotMusicTime) {
  return state.epochAudioTime + (slotMusicTime - state.epochMusicSeconds)
}

/**
 * Schedule clicks/drums from the music clock. Re-anchors when the music/audio
 * mapping drifts so slots are not marked scheduled without sounding.
 *
 * musicStartSlot: global slot of the first sounding note (0 = bar downbeat,
 * -1 = one-beat anacrusis). Offsets the grid so accent stays on the true
 * downbeat after a pickup.
 */
export function schedulePlayingSlots(state, options) {
  const opts = options || {}
  if (!state) return { scheduled: 0 }
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  const tempo = parseFloat(opts.tempo) || 120
  const swing = opts.swing != null ? opts.swing : getRhythmSwing(rhythm)
  const musicSeconds = Math.max(0, parseFloat(opts.musicSeconds) || 0)
  const audioContextTime = parseFloat(opts.audioContextTime)
  const musicStartSlot = Math.floor(parseFloat(opts.musicStartSlot) || 0)
  const lookaheadSec = opts.lookaheadSec > 0
    ? parseFloat(opts.lookaheadSec)
    : computeMusicLockedLookaheadSec(rhythm, tempo, swing)
  const playSlot = opts.playSlot
  if (!playSlot || !Number.isFinite(audioContextTime)) {
    return { scheduled: 0 }
  }

  ensureScheduleEpoch(state, musicSeconds, audioContextTime, tempo)

  const totalSlots = slotsPerBar(rhythm)
  if (!(totalSlots > 0)) return { scheduled: 0 }

  // musicSeconds=0 is the first sounding note (pickup or downbeat).
  const currentGlobalSlot = globalSlotAtMusicSeconds(musicSeconds, rhythm, tempo, swing)
    + musicStartSlot
  let globalSlot = currentGlobalSlot
  const endMusicSeconds = musicSeconds + lookaheadSec
  let scheduled = 0
  const scheduleToleranceSec = 0.002

  while (true) {
    // Slot times are relative to the first note, not the barline.
    const slotMusicTime = musicSecondsForGlobalSlot(
      globalSlot - musicStartSlot,
      rhythm,
      tempo,
      swing
    )
    if (slotMusicTime >= endMusicSeconds) break
    const key = slotScheduleKey(globalSlot)
    if (!state.scheduledKeys.has(key)) {
      if (slotMusicTime < musicSeconds - scheduleToleranceSec) {
        state.scheduledKeys.add(key)
      } else {
        const slotInBar = slotInBarForGlobal(globalSlot, totalSlots)
        const audioTime = slotMusicTimeToAudio(state, slotMusicTime)
        if (audioTime >= audioContextTime - scheduleToleranceSec) {
          playSlot(audioTime, slotInBar, globalSlot)
          state.scheduledKeys.add(key)
          scheduled += 1
        }
        // If audioTime is still in the past after drift checks, leave the key
        // unset so the next tick can play it after re-anchor.
      }
    }
    globalSlot += 1
    if (globalSlot > 100000) break
  }

  return { scheduled: scheduled }
}
