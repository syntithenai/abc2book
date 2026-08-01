/**
 * Pure playback intent / seek / guard logic.
 * Used by useTuneBookMediaController and unit-tested without React or DOM.
 */

import { slotBeatIndex, slotsPerBar, rhythmFromTimeSignature } from './metronomeRhythmPresets'
import { defaultNoteLengthForMeter } from './barModel'

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
}

export function createPlaybackIntentSnapshot(overrides) {
  const o = overrides || {}
  return {
    playingIntent: !!o.playingIntent,
    userPaused: !!o.userPaused,
    isPlayingUi: !!o.isPlayingUi,
    playCancelled: !!o.playCancelled,
    seekWasPlaying: !!o.seekWasPlaying,
    seekInProgress: !!o.seekInProgress,
    seekGuardUntil: o.seekGuardUntil || 0,
  }
}

export function hasActivePlaybackIntent(snapshot) {
  return snapshot.playingIntent && !snapshot.userPaused
}

export function isPlaybackSupposedToBeRunning(snapshot) {
  if (snapshot.userPaused) return false
  return snapshot.playingIntent || snapshot.isPlayingUi
}

export function captureSeekPlaybackIntent(snapshot) {
  const wasPlaying = isPlaybackSupposedToBeRunning(snapshot)
  const next = Object.assign({}, snapshot, { seekWasPlaying: wasPlaying })
  if (wasPlaying) {
    next.playingIntent = true
  }
  return { wasPlaying: wasPlaying, snapshot: next }
}

export function isSeekGuardActive(snapshot, now) {
  const t = now !== undefined ? now : Date.now()
  return snapshot.seekInProgress || t < snapshot.seekGuardUntil
}

export function beginSeekOperation(snapshot, ms, now) {
  const duration = ms || 3000
  const t = now !== undefined ? now : Date.now()
  return Object.assign({}, snapshot, {
    seekInProgress: true,
    seekGuardUntil: t + duration,
  })
}

export function endSeekOperation(snapshot) {
  return Object.assign({}, snapshot, { seekInProgress: false })
}

export function clearSeekWasPlaying(snapshot) {
  return Object.assign({}, snapshot, { seekWasPlaying: false })
}

export function shouldSuppressSpuriousPause(snapshot, now) {
  return isSeekGuardActive(snapshot, now)
    || (snapshot.seekWasPlaying && hasActivePlaybackIntent(snapshot))
}

export function shouldIgnoreNativePlaybackEvents(snapshot, flags, now) {
  const f = flags || {}
  return !!f.externalMediaActive
    || !!f.suppressNativePlaybackEvents
    || shouldSuppressSpuriousPause(snapshot, now)
}

export function shouldBlockAutoplayDuringSeek(snapshot, opts, now) {
  if (!isSeekGuardActive(snapshot, now)) return false
  if (!snapshot.playingIntent || snapshot.userPaused) return false
  const o = opts || {}
  if (o.preservePosition || o.resumeAt !== undefined || o.userResume) return false
  return true
}

export function shouldBlockPlayDuringSeek(snapshot, opts, now) {
  const o = opts || {}
  if (o.restart) return false
  // Only a seek captured while playback was running auto-resumes itself
  // (finalizeMediaSeek), so only that case needs to swallow play() calls.
  // A seek made while paused must not block the user's next play.
  return isSeekGuardActive(snapshot, now)
    && snapshot.seekWasPlaying
    && snapshot.playingIntent
    && !snapshot.userPaused
}

/**
 * Playback position to restore when remounting the media engine for the same
 * tune (e.g. list↔single navigation). Returns null when the stored clock
 * belongs to a different tune so auto-advance always starts from the top.
 */
export function resolvePlaybackHandoffPosition(opts) {
  const o = opts || {}
  if (!o.tuneId || o.playbackClockTuneId !== o.tuneId) return null
  if (o.queueResumePending) return null
  if (o.routeMode === 'none') return null

  const regionStart = typeof o.regionStart === 'number' ? o.regionStart : 0
  const pos = typeof o.positionSeconds === 'number' ? o.positionSeconds : 0
  const shouldPreserve = !!(
    o.userPaused
    || o.activePlaybackIntent
    || (o.playingIntent && pos > regionStart + 0.05)
  )
  if (!shouldPreserve) return null
  return pos
}

export function shouldTriggerAutoplayRecovery(snapshot, flags) {
  const f = flags || {}
  if (f.isSeekGuardActive) return false
  if (f.tapToPlay) return false
  if (f.queueItemUnplayable) return false
  if (snapshot.playCancelled) return false
  if (!snapshot.playingIntent || snapshot.userPaused) return false
  if (snapshot.isPlayingUi || f.isLoading) return false
  // Cold-start kickoff is handled by engine-specific autostart retries and
  // tap-to-play prompts. Recovery is only for output that dropped after we
  // had confirmed playback at least once.
  if (!f.playbackStarted) return false
  return true
}

export function youtubeAutoplayAppearsBlocked(snapshot, ytPlayerState) {
  if (snapshot.userPaused) return false
  // A blocked cold-start autoplay typically leaves the player unstarted (-1) or
  // cued (5); a paused (2) player after an autostart attempt is also a signal
  // the browser refused to play without a gesture.
  return ytPlayerState === YT_STATE.PAUSED
    || ytPlayerState === YT_STATE.CUED
    || ytPlayerState === YT_STATE.UNSTARTED
}

/**
 * During playlist auto-advance the next engine may still be loading. Suppress
 * tap-to-play prompts until playback confirms or the transition guard expires.
 */
export function shouldSuppressTapToPlayDuringQueueAdvance(flags) {
  const f = flags || {}
  return !!(
    f.playbackTransitionGuardActive
    && f.playingIntent
    && !f.userPaused
    && !f.playbackStarted
  )
}

export function shouldShowTapToPlayFromYoutubePoll(
  snapshot,
  pollToken,
  activePollToken,
  ytPlayerState,
  isLastAttempt,
  options
) {
  const opts = options || {}
  if (pollToken !== activePollToken) return false
  if (!snapshot.playingIntent || snapshot.playCancelled || snapshot.userPaused) return false
  if (ytPlayerState === YT_STATE.PLAYING) return false
  if (shouldSuppressTapToPlayDuringQueueAdvance({
    playbackTransitionGuardActive: opts.playbackTransitionGuardActive,
    playingIntent: snapshot.playingIntent,
    userPaused: snapshot.userPaused,
    playbackStarted: opts.playbackStarted,
  })) {
    return false
  }
  if (isLastAttempt && ytPlayerState !== YT_STATE.BUFFERING
    && youtubeAutoplayAppearsBlocked(snapshot, ytPlayerState)) {
    return true
  }
  return false
}

export function shouldDismissTapToPlayModalWithoutStop(routeMode, userPaused) {
  return canResumePlayback(routeMode, userPaused)
}

export function canResumePlayback(routeMode, userPaused) {
  if (routeMode === 'none') return false
  return !!userPaused
}

export function applyPause(snapshot) {
  return Object.assign({}, snapshot, {
    seekWasPlaying: false,
    userPaused: true,
    isPlayingUi: false,
  })
}

export function applyResumeFromPause(snapshot) {
  return Object.assign({}, snapshot, {
    userPaused: false,
    playingIntent: true,
    playCancelled: false,
    isPlayingUi: true,
  })
}

/** True when async play confirmations may set isPlaying and drive output. */
export function shouldConfirmPlayingStarted(snapshot) {
  if (snapshot.playCancelled) return false
  if (!snapshot.playingIntent) return false
  if (snapshot.userPaused) return false
  return true
}

/** True when an already-mounted player/processor may be used for the active source. */
export function shouldUseExistingPlayer(loadedSrc, activeSrc, ready) {
  if (!ready) return false
  if (!loadedSrc || !activeSrc) return false
  return loadedSrc === activeSrc
}

export function shouldHandleNativePause(snapshot, flags, now) {
  if (shouldSuppressSpuriousPause(snapshot, now)) return false
  if (flags && flags.externalMediaActive) return false
  if (flags && flags.suppressNativePlaybackEvents) return false
  if (isSeekGuardActive(snapshot, now)) return false
  if (hasActivePlaybackIntent(snapshot)) return false
  return true
}

/**
 * Media Session should stay "playing" while we still intend to play — including
 * the brief gap between tracks — so Android does not drop the continuous
 * playback / autoplay privilege when the UI isPlaying flag flips false.
 */
export function resolveMediaSessionPlaybackState(snapshot) {
  if (hasActivePlaybackIntent(snapshot)) return 'playing'
  if (snapshot.isPlayingUi && !snapshot.userPaused) return 'playing'
  return 'paused'
}

/**
 * True when the browser paused the native media element while we still want
 * playback (e.g. Android home / screen-off). Callers should try to resume
 * instead of treating it as a user pause.
 */
export function shouldRecoverUnexpectedNativePause(snapshot, flags, now) {
  if (!hasActivePlaybackIntent(snapshot)) return false
  if (shouldSuppressSpuriousPause(snapshot, now)) return false
  if (flags && flags.externalMediaActive) return false
  if (flags && flags.suppressNativePlaybackEvents) return false
  if (isSeekGuardActive(snapshot, now)) return false
  return true
}

/** Resume AudioContext / outputs when returning to a visible tab with intent. */
export function shouldResumePlaybackOnVisible(snapshot) {
  return hasActivePlaybackIntent(snapshot)
}

export function clampSeekRatio(value) {
  const n = parseFloat(value)
  if (isNaN(n)) return null
  return Math.max(0, Math.min(1, n))
}

export function seekSecondsFromRatio(ratio, duration) {
  const r = clampSeekRatio(ratio)
  const d = parseFloat(duration)
  if (r === null || isNaN(d) || d <= 0) return null
  return r * d
}

export function seekRatioFromSeconds(seconds, duration) {
  const s = Math.max(0, parseFloat(seconds) || 0)
  const d = parseFloat(duration)
  if (isNaN(d) || d <= 0) return null
  return Math.min(1, s / d)
}

function isUsableSeconds(value) {
  return value !== null
    && value !== undefined
    && !isNaN(value)
    && isFinite(value)
    && value >= 0
}

export const DEFAULT_SEEK_SETTLE_TOLERANCE_SECONDS = 1.2

/**
 * True when an engine/beat reading is still reporting a pre-seek position
 * while playback is settling on a new seek target.
 */
export function isStaleSeekEngineReading(engineSeconds, input) {
  const o = input || {}
  const target = o.seekTargetSeconds
  if (!isUsableSeconds(target) || !isUsableSeconds(engineSeconds)) return false
  const tol = o.settleToleranceSeconds !== undefined
    ? o.settleToleranceSeconds
    : DEFAULT_SEEK_SETTLE_TOLERANCE_SECONDS
  const engine = engineSeconds
  const from = isUsableSeconds(o.seekFromSeconds) ? o.seekFromSeconds : null
  if (from !== null && target > from) {
    return engine < target - tol
  }
  if (from !== null && target < from) {
    return engine > target + tol && engine > from - tol
  }
  return engine < target - tol
}

/**
 * Single source of truth for the displayed playback position.
 *
 * Priority:
 *   1. While a seek is settling (now < seekHoldUntil) -> the seek target.
 *   2. While seek guard is active and the engine still reports a stale
 *      pre-seek position -> the seek target.
 *   3. When paused / not playing -> the last stored position.
 *   4. Otherwise -> the active engine's clock, falling back to stored when
 *      the engine has no usable reading yet (e.g. external output still
 *      reconnecting, or a muted native element reporting garbage).
 *
 * This is intentionally the ONLY place that decides position, so muted or
 * inactive engines can never stomp the progress bar.
 */
export function resolveDisplaySeconds(input) {
  const o = input || {}
  const now = o.now !== undefined ? o.now : Date.now()
  const stored = isUsableSeconds(o.storedSeconds) ? o.storedSeconds : 0
  const seekTarget = isUsableSeconds(o.seekTargetSeconds) ? o.seekTargetSeconds : null

  if (now < (o.seekHoldUntil || 0)) {
    return seekTarget !== null ? seekTarget : stored
  }
  if (seekTarget !== null && now < (o.seekGuardUntil || 0)) {
    if (!isUsableSeconds(o.engineSeconds)) {
      return seekTarget
    }
    if (isStaleSeekEngineReading(o.engineSeconds, o)) {
      return seekTarget
    }
  }
  if (o.userPaused || !o.playingIntent) {
    return stored
  }
  if (isUsableSeconds(o.engineSeconds)) {
    return o.engineSeconds
  }
  return stored
}

export function beginSeekHold(now, ms) {
  const base = now !== undefined ? now : Date.now()
  return base + (ms || 800)
}

/**
 * ABC default unit length when L: is omitted (matches abcjs / barModel).
 */
export function defaultAbcBeatLengthForMeter(meter) {
  const parts = defaultNoteLengthForMeter(meter || '4/4').split('/')
  const num = parseFloat(parts[0]) || 1
  const den = parseFloat(parts[1]) || 8
  return den > 0 ? num / den : 0.125
}

/**
 * Map abcjs meter units onto the metronome rhythm beat grid. abcjs
 * getBeatsPerMeasure() follows the tune's L: unit (often 2 for 4/4 half-notes)
 * while the metronome rhythm preset counts quarter-note beats (4 for 4/4).
 */
export function rhythmAlignedCountInInput(visualObj, rhythm, options) {
  const o = options || {}
  if (!visualObj || typeof visualObj.getBeatsPerMeasure !== 'function') {
    return null
  }
  const abcBeatsPerMeasure = parseFloat(visualObj.getBeatsPerMeasure()) || 0
  let beatLength = parseFloat(visualObj.getBeatLength()) || 0
  const msPerMeasure = o.effectiveMsPerMeasure > 0
    ? parseFloat(o.effectiveMsPerMeasure) || 0
    : (typeof visualObj.millisecondsPerMeasure === 'function'
      ? parseFloat(visualObj.millisecondsPerMeasure()) || 0
      : 0)
  const meter = o.meter != null ? String(o.meter).trim() : ''
  if (!(beatLength > 0)) {
    beatLength = defaultAbcBeatLengthForMeter(meter || '4/4')
  }
  let rhythmBeatsPerBar = rhythm && rhythm.beatsPerBar > 0
    ? rhythm.beatsPerBar
    : abcBeatsPerMeasure
  if (meter) {
    const meterRhythm = rhythmFromTimeSignature(meter)
    if (meterRhythm && meterRhythm.beatsPerBar > 0) {
      rhythmBeatsPerBar = meterRhythm.beatsPerBar
    }
  } else if (rhythmBeatsPerBar === abcBeatsPerMeasure && beatLength > 0 && beatLength < 0.25) {
    const quarterBeats = Math.round(abcBeatsPerMeasure * beatLength / 0.25)
    if (quarterBeats > 0 && quarterBeats < abcBeatsPerMeasure) {
      rhythmBeatsPerBar = quarterBeats
    }
  }
  if (!(abcBeatsPerMeasure > 0) || !(beatLength > 0) || !(msPerMeasure > 0)
      || !(rhythmBeatsPerBar > 0)) {
    return null
  }
  const beatScale = rhythmBeatsPerBar / abcBeatsPerMeasure
  const rhythmBeatLength = beatLength / beatScale
  return {
    beatsPerMeasure: rhythmBeatsPerBar,
    pickupLength: parseFloat(visualObj.getPickupLength()) || 0,
    beatLength: rhythmBeatLength,
    millisecondsPerMeasure: msPerMeasure,
    tempoFactor: o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1,
    countInBeats: o.countInBeats,
    countInBarOnly: !!o.countInBarOnly,
    countInBars: o.countInBars,
  }
}

/**
 * Metronome count-in for MIDI playback with optional anacrusis (pickup).
 *
 * Without pickup: N bars of clicks (N = countInBars), then music on the next beat.
 * With pickup: (N bars minus pickup length) of clicks, then any fractional-beat
 * gap before the anacrusis. The Metronome waits until the last click finishes
 * before firing its callback; delayMs covers only any fractional remainder.
 *
 * When countInBarOnly is set (practice warmups), always count one full bar from the
 * time signature and ignore implicit pickup, even if the tune has anacrusis.
 */
export function computeMidiMetronomeCountIn(input) {
  const o = input || {}
  const beatsPerMeasure = parseFloat(o.beatsPerMeasure) || 0
  const pickupLength = parseFloat(o.pickupLength) || 0
  const beatLength = parseFloat(o.beatLength) || 0
  const tempoFactor = o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1
  const msPerMeasure = parseFloat(o.millisecondsPerMeasure) || 0
  const countInBeatsOverride = parseInt(o.countInBeats, 10)
  const countInBarOnly = !!o.countInBarOnly
  const countInBars = parseFloat(o.countInBars) > 0 ? parseFloat(o.countInBars) : 1

  if (beatsPerMeasure <= 0 || beatLength <= 0 || msPerMeasure <= 0) {
    return { metronomeBeats: 0, delayMs: 0, beatDurationMs: 0 }
  }

  const beatDurationMs = (msPerMeasure / beatsPerMeasure) / tempoFactor
  const pickupBeats = pickupLength > 0 ? pickupLength / beatLength : 0

  if (countInBarOnly || pickupBeats <= 0) {
    const metronomeBeats = countInBeatsOverride > 0
      ? countInBeatsOverride
      : countInBars * beatsPerMeasure
    return {
      metronomeBeats,
      delayMs: 0,
      beatDurationMs,
    }
  }

  const totalBeatsBeforeMusic = (countInBars * beatsPerMeasure) - pickupBeats
  const metronomeBeats = Math.max(1, Math.floor(totalBeatsBeforeMusic))
  const remainderBeats = totalBeatsBeforeMusic - metronomeBeats
  return {
    metronomeBeats,
    delayMs: remainderBeats > 0 ? remainderBeats * beatDurationMs : 0,
    beatDurationMs,
  }
}

/**
 * BPM for one abcjs meter beat at the current playback speed.
 * Matches TimingCallbacks / MIDI beat spacing (not necessarily the raw Q: field BPM).
 */
export function computePlaybackMetronomeTempo(input) {
  const o = input || {}
  const beatsPerMeasure = parseFloat(o.beatsPerMeasure) || 0
  const msPerMeasure = parseFloat(o.millisecondsPerMeasure) || 0
  const tempoFactor = o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1
  const fallback = parseFloat(o.fallbackQpm) || 120
  if (beatsPerMeasure <= 0 || msPerMeasure <= 0) {
    return fallback > 0 ? fallback : 120
  }
  const beatDurationMs = (msPerMeasure / beatsPerMeasure) / tempoFactor
  if (!(beatDurationMs > 0)) {
    return fallback > 0 ? fallback : 120
  }
  return 60000 / beatDurationMs
}

/**
 * BPM for one rhythm-preset beat (e.g. quarter in 4/4), used for metronome click
 * and drum slot spacing. Differs from abcjs beat units when L: is not a quarter.
 */
/**
 * Count-in click slots from visual timing and meter-aligned rhythm beats.
 */
export function computeCountInSlotCount(visualObj, rhythm, options) {
  const input = rhythmAlignedCountInInput(visualObj, rhythm, options)
  if (!input) return 0
  const countIn = computeMidiMetronomeCountIn(input)
  const beats = parseFloat(countIn.metronomeBeats) || 0
  if (!(beats > 0)) return 0
  return Math.floor(beats)
}

/**
 * Rhythm-grid BPM for count-in scheduling (matches slot spacing to bar duration).
 */
export function computeCountInGridTempo(visualObj, rhythm, options) {
  const o = options || {}
  const input = rhythmAlignedCountInInput(visualObj, rhythm, options)
  if (!input) return 0
  const rhythmBeatsPerBar = rhythm && rhythm.beatsPerBar > 0
    ? rhythm.beatsPerBar
    : input.beatsPerMeasure
  return computeRhythmGridTempo({
    rhythmBeatsPerBar: rhythmBeatsPerBar,
    millisecondsPerMeasure: input.millisecondsPerMeasure,
    tempoFactor: input.tempoFactor,
    fallbackQpm: parseFloat(o.fallbackQpm) || 120,
  })
}

export function computeRhythmGridTempo(input) {
  const o = input || {}
  const rhythmBeatsPerBar = parseFloat(o.rhythmBeatsPerBar) || 0
  const msPerMeasure = parseFloat(o.millisecondsPerMeasure) || 0
  const tempoFactor = o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1
  const fallback = parseFloat(o.fallbackQpm) || 120
  if (rhythmBeatsPerBar <= 0 || msPerMeasure <= 0) {
    return fallback > 0 ? fallback : 120
  }
  const beatDurationMs = (msPerMeasure / rhythmBeatsPerBar) / tempoFactor
  if (!(beatDurationMs > 0)) {
    return fallback > 0 ? fallback : 120
  }
  return 60000 / beatDurationMs
}

/**
 * abcjs TimingCallbacks extraMeasuresAtBeginning for count-in cursor alignment.
 * With anacrusis, count-in length matches 2 bars minus pickup; abcjs models that
 * as N measures at the start minus pickup length. Returns 0 when not an integer
 * (e.g. tunes without pickup use a fractional measure count-in).
 */
export const MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS = 0.05

/**
 * Map editor quarter-note beat position to wall-clock seconds using abcjs visual timing.
 * Falls back to BPM when visual timing is unavailable.
 */
export function notationBeatToAudioSeconds(startBeat, visualObj, tempoBpm) {
  const beat = parseFloat(startBeat)
  if (!(beat > 0)) return 0
  if (visualObj && typeof visualObj.getTotalBeats === 'function'
      && typeof visualObj.getTotalTime === 'function') {
    const totalBeats = parseFloat(visualObj.getTotalBeats())
    const totalTimeMs = parseFloat(visualObj.getTotalTime())
    if (totalBeats > 0 && totalTimeMs > 0) {
      return Math.min(totalTimeMs / 1000, (beat / totalBeats) * (totalTimeMs / 1000))
    }
  }
  if (visualObj && typeof visualObj.millisecondsPerMeasure === 'function'
      && typeof visualObj.getBeatsPerMeasure === 'function') {
    const msPerMeasure = parseFloat(visualObj.millisecondsPerMeasure())
    const beatsPerMeasure = parseFloat(visualObj.getBeatsPerMeasure())
    if (msPerMeasure > 0 && beatsPerMeasure > 0) {
      return beat * (msPerMeasure / beatsPerMeasure) / 1000
    }
  }
  const bpm = parseFloat(tempoBpm) > 0 ? parseFloat(tempoBpm) : 120
  return beat * 60 / bpm
}

/** Audio-buffer seek ratio (0–1) for abcjs track milliseconds. */
export function notationMsToAudioRatio(startMs, audioDurationSeconds) {
  const ms = parseFloat(startMs)
  const duration = parseFloat(audioDurationSeconds)
  if (!(ms >= 0) || !(duration > 0)) return 0
  return Math.min(1, (ms / 1000) / duration)
}

/** Audio-buffer seek ratio (0–1) for a notation editor beat position. */
export function notationBeatToAudioRatio(startBeat, visualObj, audioDurationSeconds, tempoBpm) {
  const seconds = notationBeatToAudioSeconds(startBeat, visualObj, tempoBpm)
  const duration = parseFloat(audioDurationSeconds)
  if (!(seconds > 0) || !(duration > 0)) return 0
  return Math.min(1, seconds / duration)
}

/** True when playback should be treated as at the start (not mid-song resume). */
export function isMidiStartFromBeginning(input) {
  const o = input || {}
  const tol = o.toleranceSeconds !== undefined
    ? o.toleranceSeconds
    : MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS
  const seconds = parseFloat(o.seconds)
  const ratio = parseFloat(o.ratio)
  if (!isNaN(seconds) && seconds > tol) return false
  if (!isNaN(ratio) && ratio > tol) return false
  return true
}

/** Count-in applies on fresh starts and rewind-to-start, not mid-song resume. */
export function shouldUseMidiMetronomeCountIn(input) {
  const o = input || {}
  if (!o.metronomeCountIn) return false
  if (o.forceRestart) return true
  return isMidiStartFromBeginning(o)
}

/**
 * Anchor for count-in → music handoff.
 *
 * - On time: musicSeconds=0 at the scheduled downbeat.
 * - Late, audio already pre-scheduled on that downbeat: keep the grid and
 *   advance musicSeconds so accent phase matches audible music.
 * - Late, audio starts only now: re-anchor musicSeconds=0 to now so accent
 *   stays on beat 1 (avoids hearing the accent on beat 4).
 */
export function resolveCountInHandoffAnchor(scheduledMusicStartAudioTime, audioContextCurrentTime, options) {
  const opts = options || {}
  const lead = opts.minLeadSec != null ? parseFloat(opts.minLeadSec) : 0.002
  const safeLead = Number.isFinite(lead) && lead >= 0 ? lead : 0.002
  const audioStartedAtScheduled = opts.audioStartedAtScheduled === true
  const tempoFactor = opts.tempoFactor > 0 ? parseFloat(opts.tempoFactor) : 1
  const scheduled = parseFloat(scheduledMusicStartAudioTime)
  const now = parseFloat(audioContextCurrentTime)
  if (!Number.isFinite(now)) {
    return {
      actualStartAudioTime: Number.isFinite(scheduled) ? scheduled : null,
      musicSeconds: 0,
    }
  }
  if (!Number.isFinite(scheduled)) {
    return {
      actualStartAudioTime: now + safeLead,
      musicSeconds: 0,
    }
  }
  if (now > scheduled + safeLead) {
    if (audioStartedAtScheduled) {
      return {
        actualStartAudioTime: scheduled,
        musicSeconds: Math.max(0, (now - scheduled) * tempoFactor),
      }
    }
    return {
      actualStartAudioTime: now + safeLead,
      musicSeconds: 0,
    }
  }
  return {
    actualStartAudioTime: Math.max(now + safeLead, scheduled),
    musicSeconds: 0,
  }
}

export function computeExtraMeasuresAtBeginning(input) {
  const o = input || {}
  const beatsPerMeasure = parseFloat(o.beatsPerMeasure) || 0
  const pickupLength = parseFloat(o.pickupLength) || 0
  const beatLength = parseFloat(o.beatLength) || 0
  const countInBars = parseFloat(o.countInBars) > 0 ? parseFloat(o.countInBars) : 1
  if (o.countInBarOnly || pickupLength <= 0 || beatsPerMeasure <= 0 || beatLength <= 0) {
    return 0
  }
  return Math.round(countInBars)
}

/**
 * Wall-clock ms of abcjs TimingCallbacks prep (extraMeasuresAtBeginning), matching
 * Tune.setTiming's startingDelay. Audio buffers do not include this prefix, so seeks
 * and playhead updates must map through it or the staff cursor lags the notes.
 */
export function computeTimingMusicStartMs(input) {
  const o = input || {}
  const extraMeasures = parseInt(o.extraMeasuresAtBeginning, 10) || 0
  if (extraMeasures <= 0) return 0
  const bpm = parseFloat(o.qpm) || 0
  const beatLength = parseFloat(o.beatLength) || 0
  const measureLength = parseFloat(o.barLength) || 0
  const pickupLength = parseFloat(o.pickupLength) || 0
  if (bpm <= 0 || beatLength <= 0 || measureLength <= 0) return 0
  const beatsPerSecond = bpm / 60
  let startingDelay = measureLength / beatLength * extraMeasures / beatsPerSecond
  if (startingDelay) {
    startingDelay -= pickupLength / beatLength / beatsPerSecond
  }
  return Math.max(0, startingDelay * 1000)
}

/** Map music-only audio buffer ratio (0-1) onto TimingCallbacks progress (count-in + music). */
export function audioRatioToTimingProgress(audioRatio, musicStartMs, lastMomentMs) {
  const r = Math.max(0, Math.min(1, parseFloat(audioRatio) || 0))
  const last = parseFloat(lastMomentMs)
  const start = parseFloat(musicStartMs) || 0
  if (!(last > 0)) return r
  if (!(start > 0) || start >= last) return r
  return (start + r * (last - start)) / last
}

/** Map TimingCallbacks progress (0-1 over count-in + music) to music-only audio seconds. */
export function timingProgressToAudioSeconds(timingProgress, musicStartMs, lastMomentMs, audioDurationSeconds) {
  const p = Math.max(0, Math.min(1, parseFloat(timingProgress) || 0))
  const last = parseFloat(lastMomentMs)
  const start = parseFloat(musicStartMs) || 0
  const dur = parseFloat(audioDurationSeconds)
  if (!(dur > 0)) return 0
  if (!(last > 0) || !(start > 0) || start >= last) {
    return p * dur
  }
  const currentMs = p * last
  if (currentMs <= start) return 0
  return Math.min(dur, ((currentMs - start) / (last - start)) * dur)
}

/**
 * Map music-only playback position to the metronome slot index within the bar.
 * Used to restart the click track in phase after seek or mid-song resume.
 */
export function metronomeSlotFromMusicSeconds(musicSeconds, qpm, rhythm) {
  if (!rhythm || !(rhythm.beatsPerBar > 0)) return 0
  const tempo = parseFloat(qpm) || 120
  const secPerBeat = 60 / tempo
  const totalSlots = slotsPerBar(rhythm)
  const barDur = rhythm.beatsPerBar * secPerBeat
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const posInBar = barDur > 0 ? (secs % barDur) : 0
  let elapsed = 0
  for (let slot = 0; slot < totalSlots; slot++) {
    const beatIndex = slotBeatIndex(rhythm, slot)
    const pulses = (rhythm.pulsesPerBeat && rhythm.pulsesPerBeat[beatIndex]) || 1
    const slotDur = secPerBeat / pulses
    if (posInBar < elapsed + slotDur - 0.0001) {
      return slot
    }
    elapsed += slotDur
  }
  return 0
}

/**
 * Seconds from the current music position to the next metronome slot boundary.
 */
export function timeUntilNextMetronomeSlot(musicSeconds, qpm, rhythm) {
  if (!rhythm || !(rhythm.beatsPerBar > 0)) return 0
  const tempo = parseFloat(qpm) || 120
  const secPerBeat = 60 / tempo
  const totalSlots = slotsPerBar(rhythm)
  const barDur = rhythm.beatsPerBar * secPerBeat
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const posInBar = barDur > 0 ? (secs % barDur) : 0
  let elapsed = 0
  for (let slot = 0; slot < totalSlots; slot++) {
    const beatIndex = slotBeatIndex(rhythm, slot)
    const pulses = (rhythm.pulsesPerBeat && rhythm.pulsesPerBeat[beatIndex]) || 1
    const slotDur = secPerBeat / pulses
    const slotEnd = elapsed + slotDur
    if (posInBar < slotEnd - 0.0001) {
      return Math.max(0, slotEnd - posInBar)
    }
    elapsed = slotEnd
  }
  const beatIndex = 0
  const pulses = (rhythm.pulsesPerBeat && rhythm.pulsesPerBeat[beatIndex]) || 1
  return secPerBeat / pulses
}

function slotDurationSec(rhythm, slot, secPerBeat) {
  const beatIndex = slotBeatIndex(rhythm, slot)
  const pulses = (rhythm.pulsesPerBeat && rhythm.pulsesPerBeat[beatIndex]) || 1
  return secPerBeat / pulses
}

/**
 * Where to schedule the next metronome click after a seek or count-in handoff.
 * Returns slot index and seconds from "now" before that click should fire.
 */
export function resolveMetronomeAlignTarget(musicSeconds, qpm, rhythm) {
  if (!rhythm || !(rhythm.beatsPerBar > 0)) {
    return { slot: 0, delaySec: 0.02 }
  }
  const tempo = parseFloat(qpm) || 120
  const secPerBeat = 60 / tempo
  const totalSlots = slotsPerBar(rhythm)
  const barDur = rhythm.beatsPerBar * secPerBeat
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const posInBar = barDur > 0 ? (secs % barDur) : 0
  const slot = metronomeSlotFromMusicSeconds(secs, tempo, rhythm)

  let elapsed = 0
  for (let s = 0; s < slot; s++) {
    elapsed += slotDurationSec(rhythm, s, secPerBeat)
  }
  const slotDur = slotDurationSec(rhythm, slot, secPerBeat)
  const intoSlot = posInBar - elapsed
  const delayToNext = timeUntilNextMetronomeSlot(secs, tempo, rhythm)

  if (intoSlot <= slotDur * 0.12) {
    return { slot: slot, delaySec: 0.02 }
  }
  const nextSlot = (slot + 1) % totalSlots
  return { slot: nextSlot, delaySec: Math.max(0.02, delayToNext) }
}
