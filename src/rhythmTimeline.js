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
 * Global slot where music (anacrusis) begins, relative to downbeat slot 0.
 * Compound meters use pulses (e.g. 12/8 eighth pickup = 1/3 beat → slot -1).
 * Rounding whole beats alone maps sub-beat pickups to 0 and re-anchors the
 * downbeat onto the pickup, shifting accents during playback.
 */
export function musicStartSlotForPickup(pickupBeats, rhythm) {
  const beats = parseFloat(pickupBeats) || 0
  if (beats <= 0) return 0
  const pulses = rhythm && Array.isArray(rhythm.pulsesPerBeat)
    ? rhythm.pulsesPerBeat
    : null
  const compound = pulses && pulses.some(function(p) {
    return (parseInt(p, 10) || 1) > 1
  })
  // Sub-beat pickup in simple meters: music starts before slot-0 downbeat.
  // Anchor slot 0 at the downbeat, not a full beat early.
  if (beats < 1 - 1e-6 && !compound) return 0
  if (!pulses || pulses.length === 0) {
    return -Math.max(1, Math.round(beats))
  }
  let remaining = beats
  let slots = 0
  let beatIndex = pulses.length - 1
  // Walk backward from the barline, consuming whole beats then a fraction.
  while (remaining > 1e-6) {
    const pulsesInBeat = pulses[((beatIndex % pulses.length) + pulses.length) % pulses.length] || 1
    if (remaining >= 1 - 1e-6) {
      slots += pulsesInBeat
      remaining -= 1
      beatIndex -= 1
    } else {
      const fracSlots = Math.round(remaining * pulsesInBeat)
      slots += Math.max(1, fracSlots)
      remaining = 0
    }
  }
  return slots > 0 ? -slots : 0
}

/** Count-in click placement for accent pattern; may differ from musicStartSlot. */
function countInClickAnchorSlot(musicStartSlot, pickupBeats, rhythm) {
  const beats = parseFloat(pickupBeats) || 0
  if (musicStartSlot !== 0 || beats <= 0 || beats >= 1 - 1e-6) {
    return musicStartSlot
  }
  const pulses = rhythm && Array.isArray(rhythm.pulsesPerBeat)
    ? rhythm.pulsesPerBeat
    : null
  const compound = pulses && pulses.some(function(p) {
    return (parseInt(p, 10) || 1) > 1
  })
  if (compound) return musicStartSlot
  // Sub-beat pickup anchors music at slot 0 downbeat; count-in accents still
  // align to beat boundaries one slot earlier (same as full-beat anacrusis).
  return -1
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

export function countInPulseClickSlots(timeline, slotCount, musicStartSlot) {
  const count = Math.max(0, Math.floor(parseFloat(slotCount) || 0))
  if (count <= 0 || !timeline) return []
  const startSlot = musicStartSlot != null ? Math.floor(musicStartSlot) : 0
  const slots = []
  for (let back = count; back >= 1; back -= 1) {
    slots.push(startSlot - back)
  }
  return slots
}

export function countInBeatClickSlots(timeline, beatCount, musicStartSlot, options) {
  const opts = options || {}
  const beats = Math.max(0, Math.floor(parseFloat(beatCount) || 0))
  if (beats <= 0 || !timeline) return []
  const startSlot = musicStartSlot != null ? Math.floor(musicStartSlot) : 0
  if (opts.endOnDownbeat === true) {
    const slots = []
    for (let i = beats - 1; i >= 0; i -= 1) {
      slots.push(startSlot - i)
    }
    return slots
  }
  const slots = []
  for (let beatsBack = beats; beatsBack >= 1; beatsBack--) {
    slots.push(beatStartSlotBeforeMusic(timeline, startSlot, beatsBack))
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
      : musicStartSlotForPickup(opts.pickupBeats, timeline && timeline.rhythm))
  const pickupBeats = parseFloat(opts.pickupBeats) || 0
  const clickAnchorSlot = countInClickAnchorSlot(
    musicStartSlot,
    pickupBeats,
    timeline && timeline.rhythm
  )
  const clickOpts = opts.endOnDownbeat === true ? { endOnDownbeat: true } : null
  const clickSlots = opts.usePulseSlots === true
    ? countInPulseClickSlots(timeline, beatCount, musicStartSlot)
    : countInBeatClickSlots(timeline, beatCount, musicStartSlot, clickOpts)
  const firstSlot = clickSlots.length > 0
    ? clickSlots[0]
    : musicStartSlot - beatCount - 1
  return {
    musicStartSlot: musicStartSlot,
    clickAccentSlotDelta: clickAnchorSlot - musicStartSlot,
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
    endOnDownbeat: opts.endOnDownbeat === true,
    usePulseSlots: opts.usePulseSlots === true,
  })
  const clickSlots = range.slots
  const accentDelta = range.clickAccentSlotDelta || 0
  const fractionalGapApplied = clickSlots.length > 0
    && opts.usePulseSlots !== true
    && range.musicStartSlot === 0
    && pickupBeats > 0
    && pickupBeats < 1 - 1e-6
  const clicks = []
  let t = firstClickAudioTime
  for (let i = 0; i < clickSlots.length; i++) {
    const globalSlot = clickSlots[i]
    if (i > 0) {
      if (opts.usePulseSlots === true) {
        const prevSlot = clickSlots[i - 1]
        const slotInBar = slotInBarForGlobal(prevSlot, timeline.totalSlots)
        t += timeline.slotDurations[slotInBar] || timeline.secPerBeat
      } else {
        t += timeline.secPerBeat
      }
    }
    clicks.push({
      globalSlot: globalSlot,
      audioTime: t,
      slotInBar: slotInBarForGlobal(globalSlot + accentDelta, timeline.totalSlots),
    })
  }
  if (clicks.length > 0) {
    const lastSlot = clickSlots[clickSlots.length - 1]
    if (opts.usePulseSlots === true) {
      const slotInBar = slotInBarForGlobal(lastSlot, timeline.totalSlots)
      t += timeline.slotDurations[slotInBar] || timeline.secPerBeat
    } else if (fractionalGapApplied) {
      // Sub-beat anacrusis: last click is one beat before downbeat; music enters
      // partway through that beat.
      t += (1 - pickupBeats) * timeline.secPerBeat
    } else {
      t += timeline.secPerBeat
    }
  }
  const endOnDownbeat = opts.endOnDownbeat === true
  let musicStartAudioTime
  let downbeatAudioTime
  if (endOnDownbeat) {
    musicStartAudioTime = clicks.length > 0
      ? clicks[clicks.length - 1].audioTime
      : firstClickAudioTime
    musicStartAudioTime += pickupDelaySec
    downbeatAudioTime = musicStartAudioTime + pickupBeats * timeline.secPerBeat
  } else {
    // Beat-aligned clicks already end one beat before musicStartSlot, so the next
    // beat boundary is the anacrusis/downbeat. pickupDelaySec is only needed when
    // the fractional gap above was not applied (e.g. full-beat anacrusis).
    if (!fractionalGapApplied) {
      t += pickupDelaySec
    }
    musicStartAudioTime = t
    downbeatAudioTime = t + pickupBeats * timeline.secPerBeat
  }
  return {
    clicks: clicks,
    musicStartAudioTime: musicStartAudioTime,
    musicStartSlot: range.musicStartSlot,
    downbeatAudioTime: downbeatAudioTime,
    gapSlot: range.gapSlot,
    range: range,
    endOnDownbeat: endOnDownbeat,
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
          const suppressCatchup = opts.suppressCatchupAtMinSlot === true
              && globalSlot === minGlobalSlot
          if (!suppressCatchup) {
            const when = Math.max(audioContextTime + MIN_SCHEDULE_LEAD_SEC, audioTime)
            playSlot(when, slotInBar, globalSlot)
            scheduled += 1
          }
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
