import { slotPulseIndex, slotsPerBar } from './metronomeRhythmPresets'
import { normalizeRhythmConfig } from './rhythmEngineTypes'
import { slotDurationSec, barDurationSec, secPerRhythmBeat } from './rhythmGrid'

export const DEFAULT_TIMELINE_LOOKAHEAD_SEC = 0.25
const MIN_SCHEDULE_LEAD_SEC = 0.003

/**
 * Pure audio-clock rhythm grid. Global slot 0 = downbeat; negative slots = count-in.
 * All click/drum times are audioTimeForGlobalSlot(k) — no music-seconds conversion.
 */
export function createRhythmTimeline(options) {
  const opts = options || {}
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  const tempo = parseFloat(opts.tempo) || 120
  const swing = opts.swing != null ? opts.swing : 0
  const downbeatAudioTime = parseFloat(opts.downbeatAudioTime)
  const totalSlots = slotsPerBar(rhythm)
  const secPerBeat = secPerRhythmBeat(tempo)
  const barDur = barDurationSec(rhythm, tempo, swing)
  const offsetInBar = []
  const slotDurations = []
  let cumulative = 0
  for (let slot = 0; slot < totalSlots; slot++) {
    const dur = slotDurationSec(rhythm, slot, secPerBeat, swing)
    offsetInBar[slot] = cumulative
    slotDurations[slot] = dur
    cumulative += dur
  }
  return {
    rhythm: rhythm,
    tempo: tempo,
    swing: swing,
    downbeatAudioTime: Number.isFinite(downbeatAudioTime) ? downbeatAudioTime : 0,
    totalSlots: totalSlots,
    secPerBeat: secPerBeat,
    barDur: barDur,
    offsetInBar: offsetInBar,
    slotDurations: slotDurations,
  }
}

export function audioTimeForGlobalSlot(timeline, globalSlot) {
  const k = Math.floor(globalSlot)
  const totalSlots = timeline.totalSlots
  if (!(totalSlots > 0)) return timeline.downbeatAudioTime
  const slotInBar = ((k % totalSlots) + totalSlots) % totalSlots
  const barIndex = Math.floor(k / totalSlots)
  return timeline.downbeatAudioTime + barIndex * timeline.barDur + timeline.offsetInBar[slotInBar]
}

export function slotInBarForGlobal(globalSlot, totalSlots) {
  return ((globalSlot % totalSlots) + totalSlots) % totalSlots
}

function slotInBarAtOffset(timeline, posInBar) {
  for (let slot = 0; slot < timeline.totalSlots; slot++) {
    const start = timeline.offsetInBar[slot]
    const dur = timeline.slotDurations[slot]
    if (posInBar < start + dur - 0.0001) {
      return slot
    }
  }
  return 0
}

/**
 * Smallest global slot k where audioTimeForGlobalSlot(k) >= audioTime (within tolerance).
 */
export function globalSlotAtOrAfterAudioTime(timeline, audioTime) {
  const t = parseFloat(audioTime)
  if (!Number.isFinite(t)) return 0
  const rel = t - timeline.downbeatAudioTime
  const totalSlots = timeline.totalSlots
  const barDur = timeline.barDur
  if (!(totalSlots > 0) || !(barDur > 0)) return 0

  if (rel >= 0) {
    const barIndex = Math.floor(rel / barDur)
    const posInBar = rel - barIndex * barDur
    const slotInBar = slotInBarAtOffset(timeline, posInBar)
    return barIndex * totalSlots + slotInBar
  }

  let lo = -totalSlots * 64
  let hi = 0
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (audioTimeForGlobalSlot(timeline, mid) < t - 0.0001) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/**
 * Count-in click slots: slotCount clicks, then one silent gap slot, then music at musicStartSlot.
 */
export function musicStartSlotForPickup(pickupBeats) {
  const beats = parseFloat(pickupBeats) || 0
  if (beats <= 0) return 0
  return -Math.round(beats)
}

export function beatStartSlotBeforeMusic(timeline, musicStartSlot, beatsBack) {
  const count = Math.max(0, Math.floor(parseFloat(beatsBack) || 0))
  if (count <= 0 || !timeline) return musicStartSlot
  const rhythm = timeline.rhythm
  const totalSlots = slotsPerBar(rhythm)
  let slot = musicStartSlot - 1
  for (let b = 0; b < count - 1; b++) {
    const inBar = slotInBarForGlobal(slot, totalSlots)
    slot -= slotPulseIndex(rhythm, inBar)
    slot -= 1
  }
  const inBar = slotInBarForGlobal(slot, totalSlots)
  return slot - slotPulseIndex(rhythm, inBar)
}

export function countInBeatClickSlots(timeline, beatCount, musicStartSlot) {
  const beats = Math.max(0, Math.floor(parseFloat(beatCount) || 0))
  if (beats <= 0 || !timeline) return []
  const slots = []
  for (let beatsBack = beats; beatsBack >= 1; beatsBack--) {
    slots.push(beatStartSlotBeforeMusic(timeline, musicStartSlot, beatsBack))
  }
  return slots
}

export function countInSlotRange(timeline, options) {
  const opts = options || {}
  const beatCount = Math.max(0, Math.floor(parseFloat(opts.beatCount || opts.slotCount) || 0))
  const musicStartSlot = opts.musicStartSlot != null
    ? Math.floor(opts.musicStartSlot)
    : (opts.musicStartAudioTime != null
      ? globalSlotAtOrAfterAudioTime(timeline, parseFloat(opts.musicStartAudioTime))
      : musicStartSlotForPickup(opts.pickupBeats))
  const clickSlots = countInBeatClickSlots(timeline, beatCount, musicStartSlot)
  const firstSlot = clickSlots.length > 0
    ? clickSlots[0]
    : musicStartSlot - beatCount - 1
  return {
    musicStartSlot: musicStartSlot,
    firstSlot: firstSlot,
    slots: clickSlots,
    gapSlot: musicStartSlot - 1,
  }
}

/**
 * Walk the grid forward from firstClickAudioTime through count-in, gap, and optional pickup delay.
 */
export function computeCountInSchedule(timeline, options) {
  const opts = options || {}
  const beatCount = Math.max(0, Math.floor(parseFloat(opts.beatCount || opts.slotCount) || 0))
  const pickupBeats = parseFloat(opts.pickupBeats) || 0
  const pickupDelaySec = parseFloat(opts.pickupDelaySec) || 0
  const firstClickAudioTime = parseFloat(opts.firstClickAudioTime)
  const range = countInSlotRange(timeline, {
    beatCount: beatCount,
    slotCount: beatCount,
    pickupBeats: pickupBeats,
  })
  const clickSlots = range.slots
  const clicks = []
  let t = firstClickAudioTime
  for (let i = 0; i < clickSlots.length; i++) {
    const globalSlot = clickSlots[i]
    clicks.push({
      globalSlot: globalSlot,
      audioTime: t,
      slotInBar: slotInBarForGlobal(globalSlot, timeline.totalSlots),
    })
    t += timeline.secPerBeat
  }
  if (pickupBeats > 0 || pickupDelaySec > 0) {
    const gapSlot = range.gapSlot
    const gapInBar = slotInBarForGlobal(gapSlot, timeline.totalSlots)
    t += timeline.slotDurations[gapInBar]
  }
  t += pickupDelaySec
  const downbeatAudioTime = t + pickupBeats * timeline.secPerBeat
  return {
    clicks: clicks,
    musicStartAudioTime: t,
    musicStartSlot: range.musicStartSlot,
    downbeatAudioTime: downbeatAudioTime,
    gapSlot: range.gapSlot,
    range: range,
  }
}

export function computeDownbeatAudioTime(options) {
  const opts = options || {}
  const musicStartAudioTime = parseFloat(opts.musicStartAudioTime)
  const pickupBeats = parseFloat(opts.pickupBeats) || 0
  const tempo = parseFloat(opts.tempo) || 120
  if (!Number.isFinite(musicStartAudioTime)) return 0
  return musicStartAudioTime + pickupBeats * secPerRhythmBeat(tempo)
}

export function computeMusicStartAudioTime(options) {
  const opts = options || {}
  const downbeatAudioTime = parseFloat(opts.downbeatAudioTime)
  const pickupBeats = parseFloat(opts.pickupBeats) || 0
  const tempo = parseFloat(opts.tempo) || 120
  if (!Number.isFinite(downbeatAudioTime)) return 0
  return downbeatAudioTime - pickupBeats * secPerRhythmBeat(tempo)
}

/**
 * Re-anchor downbeat so globalSlot k stays at audioContextTime (preserves phase on seek/tempo).
 */
export function reanchorTimelineAtSlot(timeline, globalSlot, audioContextTime) {
  const slotTime = audioTimeForGlobalSlot(timeline, globalSlot)
  const offset = slotTime - timeline.downbeatAudioTime
  timeline.downbeatAudioTime = parseFloat(audioContextTime) - offset
}

export function musicSecondsAtAudioTime(timeline, audioTime, musicStartAudioTime, tempoFactor) {
  const factor = tempoFactor > 0 ? parseFloat(tempoFactor) : 1
  const start = parseFloat(musicStartAudioTime)
  const t = parseFloat(audioTime)
  if (!Number.isFinite(start) || !Number.isFinite(t)) return 0
  return Math.max(0, (t - start) * factor)
}

export function audioTimeForMusicSeconds(musicStartAudioTime, musicSeconds, tempoFactor) {
  const factor = tempoFactor > 0 ? parseFloat(tempoFactor) : 1
  const start = parseFloat(musicStartAudioTime)
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  if (!Number.isFinite(start)) return 0
  return start + secs / factor
}

export function createTimelineScheduleState() {
  return {
    scheduledKeys: new Set(),
    nextGlobalSlot: null,
  }
}

export function resetTimelineScheduleState(state) {
  if (!state) return
  state.scheduledKeys = new Set()
  state.nextGlobalSlot = null
}

/**
 * Schedule slots on the audio timeline from audioContextTime through lookahead.
 */
export function scheduleTimelineSlots(timeline, state, options) {
  const opts = options || {}
  if (!state || !timeline) return { scheduled: 0 }
  const audioContextTime = parseFloat(opts.audioContextTime)
  const lookaheadSec = opts.lookaheadSec > 0
    ? parseFloat(opts.lookaheadSec)
    : DEFAULT_TIMELINE_LOOKAHEAD_SEC
  const playSlot = opts.playSlot
  const minGlobalSlot = opts.minGlobalSlot != null
    ? Math.floor(opts.minGlobalSlot)
    : 0
  const maxGlobalSlot = opts.maxGlobalSlot != null
    ? Math.floor(opts.maxGlobalSlot)
    : null
  if (!playSlot || !Number.isFinite(audioContextTime)) {
    return { scheduled: 0 }
  }

  const totalSlots = timeline.totalSlots
  const endTime = audioContextTime + lookaheadSec
  let globalSlot = state.nextGlobalSlot
  if (globalSlot == null) {
    const anchor = Math.max(minGlobalSlot, globalSlotAtOrAfterAudioTime(timeline, audioContextTime))
    const barStart = totalSlots > 0 ? Math.floor(anchor / totalSlots) * totalSlots : minGlobalSlot
    globalSlot = Math.max(minGlobalSlot, barStart)
  }
  if (globalSlot < minGlobalSlot) globalSlot = minGlobalSlot

  let scheduled = 0
  const tolerance = 0.002

  while (globalSlot < 100000) {
    if (maxGlobalSlot != null && globalSlot > maxGlobalSlot) break
    const audioTime = audioTimeForGlobalSlot(timeline, globalSlot)
    if (audioTime >= endTime) break
    const key = String(globalSlot)
    if (!state.scheduledKeys.has(key)) {
      const slotInBar = slotInBarForGlobal(globalSlot, totalSlots)
      const slotDur = timeline.slotDurations[slotInBar] || 0
      if (audioTime < audioContextTime - tolerance) {
        if (slotDur > 0 && audioContextTime - audioTime < slotDur * 0.85) {
          const when = Math.max(audioContextTime + MIN_SCHEDULE_LEAD_SEC, audioTime)
          playSlot(when, slotInBar, globalSlot)
          scheduled += 1
        }
        state.scheduledKeys.add(key)
      } else {
        playSlot(audioTime, slotInBar, globalSlot)
        state.scheduledKeys.add(key)
        scheduled += 1
      }
    }
    globalSlot += 1
  }
  state.nextGlobalSlot = globalSlot
  return { scheduled: scheduled }
}
