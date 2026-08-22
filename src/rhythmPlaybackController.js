import { normalizeRhythmConfig } from './rhythmEngineTypes'
import {
  getRhythmSwing,
  createPlayingScheduleState,
  resetPlayingScheduleState,
  schedulePlayingSlots,
  bootstrapPlayingScheduleEpoch,
} from './rhythmGrid'
import {
  createRhythmTimeline,
  computeCountInSchedule,
  reanchorTimelineAtSlot,
  countInSlotRange,
  scheduleTimelineSlots,
  audioTimeForGlobalSlot,
  globalSlotAtOrAfterAudioTime,
  slotInBarForGlobal,
  DEFAULT_TIMELINE_LOOKAHEAD_SEC,
} from './rhythmTimeline'
import { armRhythmOutputBus, silenceRhythmOutputBus } from './rhythmOutputBus'
import { rhythmsEqual } from './metronomeRhythmPresets'
import { isCompoundMetronomeRhythm } from './playbackStateLogic'

export const PHASE_IDLE = 'idle'
export const PHASE_COUNT_IN = 'countIn'
export const PHASE_ENTRY_GAP = 'entryGap'
export const PHASE_PLAYING = 'playing'

export const SCHEDULER_INTERVAL_MS = 25
const MUSIC_START_POLL_MS = 10
const MIN_CLICK_SCHEDULE_LEAD_SEC = 0.003
const COUNT_IN_LEAD_IN_SEC = 0.05

export function createRhythmPlaybackController(outputBus) {
  return {
    phase: PHASE_IDLE,
    generation: 0,
    outputBus: outputBus,
    rhythm: null,
    tempo: 120,
    swing: 0,
    duringPlayback: false,
    intervalId: null,
    musicStartTimeoutId: null,
    statechangeHandler: null,
    audioContext: null,
    timeline: null,
    countInSchedule: null,
    postCountInHandoff: false,
    scheduleState: createPlayingScheduleState(),
    musicStartAudioTime: null,
    musicStartSlot: 0,
    pickupBeats: 0,
    countInSlotsTotal: 0,
    countInSlotsEmitted: 0,
    countInScheduledGeneration: null,
    countInAttemptGeneration: null,
    callbacks: {
      onSlot: null,
      onMusicStart: null,
      onFirstNoteSchedule: null,
      playSlot: null,
      getMusicSeconds: null,
      getTempoFactor: null,
      getGridTempo: null,
      onDrift: null,
    },
  }
}

export function getRhythmPlaybackPhase(controller) {
  return controller ? controller.phase : PHASE_IDLE
}

function clearSchedulerInterval(controller) {
  if (controller.intervalId) {
    clearInterval(controller.intervalId)
    controller.intervalId = null
  }
}

function clearMusicStartTimeout(controller) {
  if (controller.musicStartTimeoutId) {
    clearTimeout(controller.musicStartTimeoutId)
    controller.musicStartTimeoutId = null
  }
}

function removeStatechangeHandler(controller) {
  if (controller.statechangeHandler && controller.audioContext) {
    controller.audioContext.removeEventListener('statechange', controller.statechangeHandler)
    controller.statechangeHandler = null
  }
}

function bumpGeneration(controller) {
  controller.generation += 1
  return controller.generation
}

function isCurrentGeneration(controller, generation) {
  return controller && controller.generation === generation
}

function playSlotAt(controller, audioTime, slotInBar, globalSlot, expectedAudioTime) {
  if (!controller.outputBus || !controller.audioContext || !controller.rhythm) return
  const destination = armRhythmOutputBus(controller.outputBus, controller.audioContext)
  if (!destination) return
  const playFn = controller.callbacks.playSlot
  if (playFn) {
    playFn(controller.audioContext, audioTime, controller.rhythm, slotInBar, destination, {
      globalSlot: globalSlot,
      expectedAudioTime: expectedAudioTime != null ? expectedAudioTime : audioTime,
      generation: controller.generation,
    })
  }
}

function scheduleMusicStartAtAudioTime(controller, generation, musicStartAudioTime) {
  clearMusicStartTimeout(controller)
  const target = parseFloat(musicStartAudioTime)
  if (!Number.isFinite(target)) {
    triggerMusicStart(controller)
    return
  }
  const scheduleTrigger = function() {
    if (!isCurrentGeneration(controller, generation)) return
    if (!controller.audioContext) return
    if (controller.audioContext.state !== 'running') {
      controller.musicStartTimeoutId = setTimeout(scheduleTrigger, MUSIC_START_POLL_MS)
      return
    }
    const remainingSec = target - controller.audioContext.currentTime
    if (remainingSec <= 0.0005) {
      triggerMusicStart(controller)
      return
    }
    const finePoll = controller.duringPlayback === true
    let delayMs
    if (finePoll) {
      delayMs = remainingSec > 0.05
        ? Math.max(1, Math.round((remainingSec - 0.015) * 1000))
        : 1
    } else {
      delayMs = Math.max(1, Math.min(MUSIC_START_POLL_MS, remainingSec * 1000 - 1))
    }
    controller.musicStartTimeoutId = setTimeout(scheduleTrigger, delayMs)
  }
  scheduleTrigger()
}

function scheduleCountInClicks(controller, generation) {
  if (!controller.audioContext) return
  if (controller.countInScheduledGeneration === generation) return
  controller.countInScheduledGeneration = generation
  const getGridTempo = controller.callbacks.getGridTempo
  if (typeof getGridTempo === 'function') {
    const gridTempo = parseFloat(getGridTempo())
    if (gridTempo > 0) {
      controller.tempo = gridTempo
    }
  }
  const ctx = controller.audioContext
  const now = ctx.currentTime
  const firstClickAudioTime = Math.max(
    now + COUNT_IN_LEAD_IN_SEC,
    now + MIN_CLICK_SCHEDULE_LEAD_SEC
  )
  const tempTimeline = createRhythmTimeline({
    rhythm: controller.rhythm,
    tempo: controller.tempo,
    swing: controller.swing,
    downbeatAudioTime: 0,
  })
  const usePulseSlots = isCompoundMetronomeRhythm(controller.rhythm)
  const schedule = computeCountInSchedule(tempTimeline, {
    slotCount: controller.countInSlotsTotal,
    pickupBeats: controller.pickupBeats,
    pickupDelaySec: (parseFloat(controller.entryGapDelayMs) || 0) / 1000,
    firstClickAudioTime: firstClickAudioTime,
    endOnDownbeat: false,
    usePulseSlots: usePulseSlots,
  })
  schedule.range = countInSlotRange(tempTimeline, {
    slotCount: controller.countInSlotsTotal,
    pickupBeats: controller.pickupBeats,
    musicStartSlot: schedule.musicStartSlot,
    usePulseSlots: usePulseSlots,
  })
  controller.musicStartAudioTime = schedule.musicStartAudioTime
  controller.musicStartSlot = schedule.musicStartSlot
  controller.countInEndedOnDownbeat = schedule.endOnDownbeat === true
  controller.timeline = createRhythmTimeline({
    rhythm: controller.rhythm,
    tempo: controller.tempo,
    swing: controller.swing,
    downbeatAudioTime: schedule.downbeatAudioTime,
  })
  const pickupBeats = parseFloat(controller.pickupBeats) || 0
  const fractionalPickup = pickupBeats > 0 && pickupBeats < 1 - 1e-6
  const anchorSlot = fractionalPickup ? 0 : schedule.musicStartSlot
  const anchorTime = fractionalPickup
    ? schedule.downbeatAudioTime
    : schedule.musicStartAudioTime
  reanchorTimelineAtSlot(controller.timeline, anchorSlot, anchorTime)
  controller.countInSchedule = schedule
  resetPlayingScheduleState(controller.scheduleState)


  const scheduleClicks = function() {
    schedule.clicks.forEach(function(click, index) {
      playSlotAt(controller, click.audioTime, click.slotInBar, click.globalSlot, click.audioTime)
      controller.countInSlotsEmitted += 1
      if (typeof controller.callbacks.onSlot === 'function') {
        controller.callbacks.onSlot(
          click.slotInBar,
          controller.countInSlotsEmitted,
          controller.countInSlotsTotal
        )
      }
      if (index === schedule.clicks.length - 1
          && typeof controller.callbacks.onFirstNoteSchedule === 'function') {
        controller.callbacks.onFirstNoteSchedule(click.audioTime)
      }
    })
  }

  if (controller.duringPlayback) {
    controller.countInSlotsEmitted = 0
    controller.phase = PHASE_COUNT_IN
    scheduleClicks()
    // Pre-schedule the first music downbeat with the count-in clicks so it is
    // already on the Web Audio clock. Handoff used to miss or late-fire slot 0.
    if (controller.timeline
        && typeof schedule.musicStartAudioTime === 'number'
        && schedule.musicStartSlot != null) {
      const musicSlot = Math.floor(schedule.musicStartSlot)
      const slotInBar = slotInBarForGlobal(musicSlot, controller.timeline.totalSlots)
      playSlotAt(
        controller,
        schedule.musicStartAudioTime,
        slotInBar,
        musicSlot,
        schedule.musicStartAudioTime
      )
      controller.scheduleState.scheduledKeys.add(String(musicSlot))
    }
    // Arm MIDI on the Web Audio clock while musicStart is still in the future.
    // Starting it from onMusicStart (setTimeout) was routinely 6–10ms late.
    if (typeof controller.callbacks.onPreScheduleMusic === 'function'
        && typeof schedule.musicStartAudioTime === 'number') {
      controller.callbacks.onPreScheduleMusic(schedule.musicStartAudioTime)
    }
    controller.phase = PHASE_ENTRY_GAP
    scheduleMusicStartAtAudioTime(controller, generation, schedule.musicStartAudioTime)
    return
  }

  scheduleClicks()

  controller.phase = PHASE_ENTRY_GAP
  scheduleMusicStartAtAudioTime(controller, generation, schedule.musicStartAudioTime)
}

function triggerMusicStart(controller) {
  clearMusicStartTimeout(controller)
  clearSchedulerInterval(controller)
  const duringPlayback = controller.duringPlayback === true
  const onMusicStart = controller.callbacks.onMusicStart
  const scheduledMusicStartAudioTime = controller.musicStartAudioTime
  const now = controller.audioContext ? controller.audioContext.currentTime : null
  if (duringPlayback) {
    controller.phase = PHASE_ENTRY_GAP
    if (typeof onMusicStart === 'function') {
      onMusicStart(scheduledMusicStartAudioTime)
    }
    return
  }
  controller.phase = PHASE_IDLE
  clearSchedulerInterval(controller)
  silenceRhythmOutputBus(controller.outputBus, controller.audioContext)
  if (typeof onMusicStart === 'function') {
    onMusicStart(scheduledMusicStartAudioTime)
  }
}

function runPlayingTick(controller) {
  if (!controller.audioContext || controller.audioContext.state !== 'running') return
  if (controller.phase === PHASE_COUNT_IN || controller.phase === PHASE_ENTRY_GAP) return
  if (controller.phase !== PHASE_PLAYING) return
  if (!controller.rhythm) return
  const playSlot = function(audioTime, slotInBar, globalSlot) {
    playSlotAt(controller, audioTime, slotInBar, globalSlot, audioTime)
  }
  if (controller.timeline) {
    const barLookahead = controller.timeline.barDur > 0
      ? controller.timeline.barDur
      : 2
    const minSlot = controller.musicStartSlot != null
      ? Math.floor(controller.musicStartSlot)
      : 0
    const shortLookahead = controller.postCountInHandoff === true
    scheduleTimelineSlots(controller.timeline, controller.scheduleState, {
      audioContextTime: controller.audioContext.currentTime,
      lookaheadSec: shortLookahead
        ? DEFAULT_TIMELINE_LOOKAHEAD_SEC
        : Math.max(0.25, barLookahead),
      minGlobalSlot: minSlot,
      suppressCatchupAtMinSlot: shortLookahead,
      playSlot: playSlot,
    })
    if (shortLookahead) {
      controller.postCountInHandoff = false
    }
    return
  }
  const getMusicSeconds = controller.callbacks.getMusicSeconds
  const musicSeconds = typeof getMusicSeconds === 'function' ? getMusicSeconds() : 0
  const tempoFactor = typeof controller.callbacks.getTempoFactor === 'function'
    ? controller.callbacks.getTempoFactor()
    : 1
  schedulePlayingSlots(controller.scheduleState, {
    rhythm: controller.rhythm,
    tempo: controller.tempo,
    tempoFactor: tempoFactor,
    swing: controller.swing,
    musicSeconds: musicSeconds,
    musicStartSlot: controller.musicStartSlot != null ? controller.musicStartSlot : 0,
    audioContextTime: controller.audioContext.currentTime,
    playSlot: playSlot,
  })
}

function ensurePlayingInterval(controller) {
  if (controller.intervalId) return
  controller.intervalId = setInterval(function() {
    if (controller.phase !== PHASE_PLAYING) return
    runPlayingTick(controller)
  }, SCHEDULER_INTERVAL_MS)
}

function bootstrapPlayingFromMusicStart(controller, musicSeconds) {
  if (!controller.audioContext) return
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const tempoFactor = typeof controller.callbacks.getTempoFactor === 'function'
    ? controller.callbacks.getTempoFactor()
    : 1
  const factor = tempoFactor > 0 ? tempoFactor : 1
  let anchorAudio = controller.audioContext.currentTime
  if (controller.musicStartAudioTime != null) {
    anchorAudio = controller.musicStartAudioTime + secs / factor
  }
  bootstrapPlayingScheduleEpoch(
    controller.scheduleState,
    secs,
    anchorAudio,
    controller.tempo,
    factor
  )
}

export function stopRhythmPlaybackController(controller) {
  if (!controller) return
  bumpGeneration(controller)
  clearSchedulerInterval(controller)
  clearMusicStartTimeout(controller)
  removeStatechangeHandler(controller)
  silenceRhythmOutputBus(controller.outputBus, controller.audioContext)
  controller.phase = PHASE_IDLE
  controller.countInSlotsEmitted = 0
  controller.countInSlotsTotal = 0
  controller.countInScheduledGeneration = null
  controller.countInAttemptGeneration = null
  controller.timeline = null
  controller.countInSchedule = null
  controller.postCountInHandoff = false
  controller.musicStartAudioTime = null
  controller.musicStartSlot = 0
  resetPlayingScheduleState(controller.scheduleState)
}

export function startRhythmCountIn(controller, options) {
  const opts = options || {}
  if (!controller) return false
  stopRhythmPlaybackController(controller)
  const generation = controller.generation
  controller.phase = PHASE_COUNT_IN
  controller.rhythm = normalizeRhythmConfig(opts.rhythm)
  controller.tempo = parseFloat(opts.tempo) || 120
  controller.swing = opts.swing != null ? opts.swing : getRhythmSwing(controller.rhythm)
  controller.duringPlayback = opts.duringPlayback === true
  controller.audioContext = opts.audioContext || null
  controller.countInSlotsTotal = Math.max(0, Math.floor(parseFloat(opts.slotCount) || 0))
  controller.countInSlotsEmitted = 0
  controller.pickupBeats = parseFloat(opts.pickupBeats) || 0
  controller.entryGapDelayMs = parseFloat(opts.entryGapDelayMs) || 0
  controller.musicStartAudioTime = typeof opts.musicStartAudioTime === 'number'
    ? opts.musicStartAudioTime
    : null
  controller.callbacks.onSlot = opts.onSlot || null
  controller.callbacks.onMusicStart = opts.onMusicStart || null
  controller.callbacks.onFirstNoteSchedule = opts.onFirstNoteSchedule || null
  controller.callbacks.onPreScheduleMusic = opts.onPreScheduleMusic || null
  controller.callbacks.playSlot = opts.playSlot || null
  controller.callbacks.getMusicSeconds = opts.getMusicSeconds || null
  controller.callbacks.getTempoFactor = opts.getTempoFactor || null
  controller.callbacks.getGridTempo = opts.getGridTempo || null
  controller.callbacks.onDrift = opts.onDrift || null
  controller.timeline = null

  if (!(controller.countInSlotsTotal > 0) || !controller.audioContext) {
    controller.phase = PHASE_IDLE
    return false
  }

  armRhythmOutputBus(controller.outputBus, controller.audioContext)

  const tryStart = function() {
    if (!isCurrentGeneration(controller, generation)) return false
    if (controller.countInAttemptGeneration === generation) {
      return controller.countInScheduledGeneration === generation
    }
    controller.countInAttemptGeneration = generation
    if (!controller.audioContext || controller.audioContext.state !== 'running') return false
    try {
      scheduleCountInClicks(controller, generation)
      return true
    } catch (e) {
      console.warn('count-in schedule failed', e)
      controller.phase = PHASE_IDLE
      controller.countInAttemptGeneration = null
      return false
    }
  }

  if (controller.audioContext.state === 'running') {
    return tryStart()
  }
  const ctx = controller.audioContext
  const onStateChange = function() {
    if (ctx.state === 'running') {
      removeStatechangeHandler(controller)
      tryStart()
    }
  }
  removeStatechangeHandler(controller)
  controller.statechangeHandler = onStateChange
  ctx.addEventListener('statechange', onStateChange)
  return true
}

export function enterRhythmPlaying(controller, options) {
  const opts = options || {}
  if (!controller) return
  if (controller.phase === PHASE_COUNT_IN || controller.phase === PHASE_ENTRY_GAP) {
    return
  }
  clearMusicStartTimeout(controller)
  removeStatechangeHandler(controller)
  clearSchedulerInterval(controller)
  controller.phase = PHASE_PLAYING
  controller.rhythm = normalizeRhythmConfig(opts.rhythm || controller.rhythm)
  controller.tempo = parseFloat(opts.tempo) || controller.tempo || 120
  controller.swing = opts.swing != null ? opts.swing : getRhythmSwing(controller.rhythm)
  controller.audioContext = opts.audioContext || controller.audioContext
  controller.callbacks.playSlot = opts.playSlot || controller.callbacks.playSlot
  controller.callbacks.getMusicSeconds = opts.getMusicSeconds || controller.callbacks.getMusicSeconds
  controller.callbacks.getTempoFactor = opts.getTempoFactor || controller.callbacks.getTempoFactor
  controller.callbacks.onDrift = opts.onDrift || controller.callbacks.onDrift
  controller.pickupBeats = opts.pickupBeats != null ? parseFloat(opts.pickupBeats) || 0 : controller.pickupBeats
  // Mid-tune resume has no count-in timeline — use music-seconds scheduling.
  controller.timeline = null
  if (typeof opts.musicStartAudioTime === 'number') {
    controller.musicStartAudioTime = opts.musicStartAudioTime
  }
  // Do not keep a leftover anacrusis slot from a prior count-in.
  controller.musicStartSlot = opts.musicStartSlot != null
    ? opts.musicStartSlot
    : 0

  if (controller.audioContext) {
    armRhythmOutputBus(controller.outputBus, controller.audioContext)
    const musicSeconds = typeof opts.musicSeconds === 'number' ? opts.musicSeconds : 0
    if (controller.musicStartAudioTime == null) {
      const tempoFactor = typeof controller.callbacks.getTempoFactor === 'function'
        ? controller.callbacks.getTempoFactor()
        : 1
      const factor = tempoFactor > 0 ? tempoFactor : 1
      controller.musicStartAudioTime = controller.audioContext.currentTime - musicSeconds / factor
    }
    bootstrapPlayingFromMusicStart(controller, musicSeconds)
    runPlayingTick(controller)
    ensurePlayingInterval(controller)
  }
}

export function tickRhythmPlaying(controller) {
  if (!controller || controller.phase !== PHASE_PLAYING) return
  runPlayingTick(controller)
}

export function seekRhythmPlaying(controller, musicSeconds) {
  if (!controller || controller.phase !== PHASE_PLAYING) return
  reanchorRhythm(controller, musicSeconds)
}

export function reanchorRhythm(controller, musicSeconds) {
  if (!controller || controller.phase !== PHASE_PLAYING) return
  if (!controller.audioContext) return
  bootstrapPlayingFromMusicStart(controller, musicSeconds)
  runPlayingTick(controller)
}

export function checkRhythmDrift() {
  return false
}

export function setRhythmPlaybackTempo(controller, tempo) {
  if (!controller) return
  const next = parseFloat(tempo)
  if (!(next > 0)) return
  if (Math.abs(controller.tempo - next) < 0.01) return
  controller.tempo = next
  if (controller.phase === PHASE_PLAYING && controller.audioContext) {
    if (controller.timeline) {
      const now = controller.audioContext.currentTime
      const currentSlot = globalSlotAtOrAfterAudioTime(controller.timeline, now)
      controller.timeline = createRhythmTimeline({
        rhythm: controller.rhythm,
        tempo: next,
        swing: controller.swing,
        downbeatAudioTime: 0,
      })
      reanchorTimelineAtSlot(controller.timeline, currentSlot, now)
      resetPlayingScheduleState(controller.scheduleState)
      runPlayingTick(controller)
      return
    }
    const getMusicSeconds = controller.callbacks.getMusicSeconds
    const musicSeconds = typeof getMusicSeconds === 'function' ? getMusicSeconds() : 0
    bootstrapPlayingFromMusicStart(controller, musicSeconds)
    runPlayingTick(controller)
  }
}

export function setRhythmPlaybackRhythm(controller, rhythm) {
  if (!controller) return
  const next = normalizeRhythmConfig(rhythm)
  if (!next) return
  if (controller.rhythm && rhythmsEqual(controller.rhythm, next)) return
  controller.rhythm = next
  if (controller.phase === PHASE_PLAYING && controller.audioContext) {
    if (controller.timeline) {
      const now = controller.audioContext.currentTime
      const currentSlot = globalSlotAtOrAfterAudioTime(controller.timeline, now)
      controller.timeline = createRhythmTimeline({
        rhythm: next,
        tempo: controller.tempo,
        swing: controller.swing,
        downbeatAudioTime: 0,
      })
      reanchorTimelineAtSlot(controller.timeline, currentSlot, now)
      resetPlayingScheduleState(controller.scheduleState)
      runPlayingTick(controller)
      return
    }
    const getMusicSeconds = controller.callbacks.getMusicSeconds
    const musicSeconds = typeof getMusicSeconds === 'function' ? getMusicSeconds() : 0
    bootstrapPlayingFromMusicStart(controller, musicSeconds)
    runPlayingTick(controller)
  }
}

export function beginRhythmPlayingAtMusicStart(controller, options) {
  const opts = options || {}
  if (!controller) return
  const phase = controller.phase
  if (phase !== PHASE_PLAYING && phase !== PHASE_ENTRY_GAP) return
  controller.phase = PHASE_PLAYING
  const musicSeconds = typeof opts.musicSeconds === 'number' ? opts.musicSeconds : 0
  if (typeof opts.musicStartAudioTime === 'number') {
    controller.musicStartAudioTime = opts.musicStartAudioTime
  }
  if (opts.musicStartSlot != null) {
    controller.musicStartSlot = opts.musicStartSlot
  }
  if (controller.audioContext) {
    if (controller.timeline) {
      // Continue the count-in audio grid; optionally re-anchor if handoff
      // reports a different audible start than the pre-scheduled downbeat.
      if (typeof opts.musicStartAudioTime === 'number'
          && controller.musicStartSlot != null) {
        const anchorSlot = opts.timelineAnchorSlot != null
          ? opts.timelineAnchorSlot
          : controller.musicStartSlot
        let anchorTime = opts.musicStartAudioTime
        const pickupBeats = parseFloat(controller.pickupBeats) || 0
        const secPerBeat = controller.tempo > 0 ? 60 / controller.tempo : 0
        if (anchorSlot === 0 && pickupBeats > 0 && pickupBeats < 1 - 1e-6 && secPerBeat > 0
            && typeof anchorTime === 'number') {
          const slot0Time = audioTimeForGlobalSlot(controller.timeline, 0)
          const downbeatFromAnacrusis = anchorTime + pickupBeats * secPerBeat
          // Handoff may pass anacrusis connect time; slot 0 is the downbeat.
          if (slot0Time - anchorTime > secPerBeat * (pickupBeats - 0.05)) {
            anchorTime = downbeatFromAnacrusis
          }
        }
        const expected = audioTimeForGlobalSlot(
          controller.timeline,
          anchorSlot
        )
        const drift = Math.abs(expected - anchorTime)
        // Audible skew around 8–10ms was ignored at 20ms; re-anchor above ~3ms.
        if (opts.forceTimelineReanchor || drift > 0.003) {
          reanchorTimelineAtSlot(
            controller.timeline,
            anchorSlot,
            anchorTime
          )
        }
      }
      resetPlayingScheduleState(controller.scheduleState)
      const startSlot = controller.musicStartSlot != null
        ? Math.floor(controller.musicStartSlot)
        : 0
      const now = controller.audioContext.currentTime
      if (musicSeconds <= 0.001 && startSlot < 0) {
        // Full-beat anacrusis: play the pickup click at handoff.
        controller.postCountInHandoff = true
        controller.scheduleState.nextGlobalSlot = startSlot
      } else if (musicSeconds <= 0.001 && startSlot === 0) {
        // Prefer a count-in-pre-scheduled downbeat; otherwise skip if already past.
        if (controller.scheduleState.scheduledKeys.has('0')) {
          controller.scheduleState.nextGlobalSlot = 1
        } else {
          const slot0Time = audioTimeForGlobalSlot(controller.timeline, 0)
          if (typeof slot0Time === 'number' && now > slot0Time + 0.003) {
            controller.scheduleState.scheduledKeys.add('0')
            controller.scheduleState.nextGlobalSlot = 1
          } else {
            controller.postCountInHandoff = true
            controller.scheduleState.nextGlobalSlot = 0
          }
        }
      } else if (controller.duringPlayback === true
          && controller.countInEndedOnDownbeat === true
          && startSlot === 0
          && musicSeconds <= 0.001) {
        // Fourth count-in click was the downbeat (slot 0); do not replay it.
        controller.scheduleState.scheduledKeys.add('0')
        controller.scheduleState.nextGlobalSlot = 1
      } else if (musicSeconds > 0.001) {
        const slotInBar = slotInBarForGlobal(startSlot, controller.timeline.totalSlots)
        const slotDur = controller.timeline.slotDurations[slotInBar] || 0
        const slotStartTime = audioTimeForGlobalSlot(controller.timeline, startSlot)
        const withinDownbeat = slotDur > 0 && now - slotStartTime < slotDur * 0.9
        controller.scheduleState.scheduledKeys.add(String(startSlot))
        controller.scheduleState.nextGlobalSlot = withinDownbeat
          ? startSlot + 1
          : Math.max(startSlot + 1, globalSlotAtOrAfterAudioTime(controller.timeline, now))
      } else {
        const firstLiveSlot = Math.max(
          startSlot,
          globalSlotAtOrAfterAudioTime(controller.timeline, now)
        )
        for (let slot = startSlot; slot < firstLiveSlot; slot += 1) {
          controller.scheduleState.scheduledKeys.add(String(slot))
        }
        controller.scheduleState.nextGlobalSlot = firstLiveSlot
      }
    } else {
      bootstrapPlayingFromMusicStart(controller, musicSeconds)
    }
    runPlayingTick(controller)
    ensurePlayingInterval(controller)
  }
}

export function isRhythmPlaybackActive(controller) {
  return !!controller && controller.phase !== PHASE_IDLE
}

export function getRhythmTimelineSnapshot(controller) {
  if (!controller || !controller.timeline) return null
  return {
    downbeatAudioTime: controller.timeline.downbeatAudioTime,
    musicStartAudioTime: controller.musicStartAudioTime,
    musicStartSlot: controller.musicStartSlot,
    tempo: controller.tempo,
    totalSlots: controller.timeline.totalSlots,
  }
}
