/**
 * Pure playback intent / seek / guard logic.
 * Used by useTuneBookMediaController and unit-tested without React or DOM.
 */

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
  return isSeekGuardActive(snapshot, now)
    && snapshot.playingIntent
    && !snapshot.userPaused
}

export function shouldTriggerAutoplayRecovery(snapshot, flags) {
  const f = flags || {}
  if (f.isSeekGuardActive) return false
  if (f.tapToPlay) return false
  if (snapshot.playCancelled) return false
  if (!snapshot.playingIntent || snapshot.userPaused) return false
  if (snapshot.isPlayingUi || f.isLoading) return false
  return true
}

export function youtubeAutoplayAppearsBlocked(snapshot, ytPlayerState) {
  if (snapshot.userPaused) return false
  return ytPlayerState === YT_STATE.PAUSED || ytPlayerState === YT_STATE.CUED
}

export function shouldShowTapToPlayFromYoutubePoll(snapshot, pollToken, activePollToken, ytPlayerState, isLastAttempt) {
  if (pollToken !== activePollToken) return false
  if (!snapshot.playingIntent || snapshot.playCancelled || snapshot.userPaused) return false
  if (ytPlayerState === YT_STATE.PLAYING) return false
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
 * Metronome count-in for MIDI playback with optional anacrusis (pickup).
 *
 * Without pickup: one full bar of clicks, then one beat of silence, then music.
 * With pickup: two bars minus the pickup length (fractional beats allowed), then
 * music — the post-count delay covers any fractional remainder after whole clicks.
 */
export function computeMidiMetronomeCountIn(input) {
  const o = input || {}
  const beatsPerMeasure = parseFloat(o.beatsPerMeasure) || 0
  const pickupLength = parseFloat(o.pickupLength) || 0
  const beatLength = parseFloat(o.beatLength) || 0
  const tempoFactor = o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1
  const msPerMeasure = parseFloat(o.millisecondsPerMeasure) || 0
  const countInBeatsOverride = parseInt(o.countInBeats, 10)

  if (beatsPerMeasure <= 0 || beatLength <= 0 || msPerMeasure <= 0) {
    return { metronomeBeats: 0, delayMs: 0, beatDurationMs: 0 }
  }

  const beatDurationMs = (msPerMeasure / beatsPerMeasure) / tempoFactor
  const pickupBeats = pickupLength > 0 ? pickupLength / beatLength : 0

  if (pickupBeats <= 0) {
    const metronomeBeats = countInBeatsOverride > 0
      ? countInBeatsOverride
      : beatsPerMeasure
    return {
      metronomeBeats,
      delayMs: beatDurationMs,
      beatDurationMs,
    }
  }

  const totalBeatsBeforeMusic = (2 * beatsPerMeasure) - pickupBeats
  const metronomeBeats = Math.max(1, Math.floor(totalBeatsBeforeMusic))
  const remainderBeats = totalBeatsBeforeMusic - metronomeBeats
  return {
    metronomeBeats,
    delayMs: remainderBeats * beatDurationMs,
    beatDurationMs,
  }
}

/**
 * abcjs TimingCallbacks extraMeasuresAtBeginning for count-in cursor alignment.
 * With anacrusis, count-in length matches 2 bars minus pickup; abcjs models that
 * as N measures at the start minus pickup length. Returns 0 when not an integer
 * (e.g. tunes without pickup use a fractional measure count-in).
 */
export const MIDI_START_FROM_BEGINNING_TOLERANCE_SECONDS = 0.05

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

export function computeExtraMeasuresAtBeginning(input) {
  const o = input || {}
  const beatsPerMeasure = parseFloat(o.beatsPerMeasure) || 0
  const pickupLength = parseFloat(o.pickupLength) || 0
  const beatLength = parseFloat(o.beatLength) || 0
  if (pickupLength <= 0 || beatsPerMeasure <= 0 || beatLength <= 0) {
    return 0
  }
  const countIn = computeMidiMetronomeCountIn(o)
  const pickupBeats = pickupLength / beatLength
  const countInBeats = countIn.metronomeBeats
    + (countIn.beatDurationMs > 0 ? countIn.delayMs / countIn.beatDurationMs : 0)
  const measures = (countInBeats + pickupBeats) / beatsPerMeasure
  const rounded = Math.round(measures)
  if (rounded <= 0 || Math.abs(measures - rounded) > 1e-6) {
    return 0
  }
  return rounded
}
