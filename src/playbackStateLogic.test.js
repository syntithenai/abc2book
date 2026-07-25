import {
  YT_STATE,
  createPlaybackIntentSnapshot,
  hasActivePlaybackIntent,
  isPlaybackSupposedToBeRunning,
  captureSeekPlaybackIntent,
  isSeekGuardActive,
  beginSeekOperation,
  endSeekOperation,
  shouldSuppressSpuriousPause,
  shouldIgnoreNativePlaybackEvents,
  shouldBlockAutoplayDuringSeek,
  shouldBlockPlayDuringSeek,
  resolvePlaybackHandoffPosition,
  shouldTriggerAutoplayRecovery,
  youtubeAutoplayAppearsBlocked,
  shouldShowTapToPlayFromYoutubePoll,
  shouldDismissTapToPlayModalWithoutStop,
  canResumePlayback,
  applyPause,
  applyResumeFromPause,
  shouldConfirmPlayingStarted,
  shouldUseExistingPlayer,
  shouldHandleNativePause,
  resolveMediaSessionPlaybackState,
  shouldRecoverUnexpectedNativePause,
  shouldResumePlaybackOnVisible,
  clampSeekRatio,
  seekSecondsFromRatio,
  seekRatioFromSeconds,
  clearSeekWasPlaying,
  resolveDisplaySeconds,
  beginSeekHold,
  isStaleSeekEngineReading,
  computeMidiMetronomeCountIn,
  computeExtraMeasuresAtBeginning,
  computeTimingMusicStartMs,
  audioRatioToTimingProgress,
  timingProgressToAudioSeconds,
  isMidiStartFromBeginning,
  shouldUseMidiMetronomeCountIn,
  metronomeSlotFromMusicSeconds,
  timeUntilNextMetronomeSlot,
  computePlaybackMetronomeTempo,
  notationBeatToAudioSeconds,
  notationBeatToAudioRatio,
  notationMsToAudioRatio,
} from './playbackStateLogic'
import { rhythmFromPreset } from './metronomeRhythmPresets'

const NOW = 1_000_000

function snap(overrides) {
  return createPlaybackIntentSnapshot(overrides)
}

describe('playback handoff position', function() {
  test('resolvePlaybackHandoffPosition preserves position only for the same tune', function() {
    const base = {
      tuneId: 'a',
      playbackClockTuneId: 'a',
      queueResumePending: false,
      routeMode: 'media',
      positionSeconds: 42,
      userPaused: false,
      activePlaybackIntent: true,
      playingIntent: true,
      regionStart: 0,
    }
    expect(resolvePlaybackHandoffPosition(base)).toBe(42)
    expect(resolvePlaybackHandoffPosition(Object.assign({}, base, {
      playbackClockTuneId: 'b',
    }))).toBe(null)
    expect(resolvePlaybackHandoffPosition(Object.assign({}, base, {
      tuneId: 'b',
    }))).toBe(null)
  })

  test('resolvePlaybackHandoffPosition ignores stale intent after auto-advance', function() {
    expect(resolvePlaybackHandoffPosition({
      tuneId: 'next',
      playbackClockTuneId: 'prev',
      queueResumePending: false,
      routeMode: 'media',
      positionSeconds: 180,
      userPaused: false,
      activePlaybackIntent: true,
      playingIntent: true,
      regionStart: 0,
    })).toBe(null)
  })
})

describe('playback intent', function() {
  test('active intent requires playing intent and not user paused', function() {
    expect(hasActivePlaybackIntent(snap({ playingIntent: true, userPaused: false }))).toBe(true)
    expect(hasActivePlaybackIntent(snap({ playingIntent: true, userPaused: true }))).toBe(false)
    expect(hasActivePlaybackIntent(snap({ playingIntent: false, userPaused: false }))).toBe(false)
  })

  test('pause keeps playing intent for resume but clears active intent', function() {
    let state = snap({ playingIntent: true, isPlayingUi: true })
    state = applyPause(state)
    expect(state.userPaused).toBe(true)
    expect(state.playingIntent).toBe(true)
    expect(state.isPlayingUi).toBe(false)
    expect(hasActivePlaybackIntent(state)).toBe(false)
    expect(canResumePlayback('media', state.userPaused)).toBe(true)
  })

  test('resume from pause restores active intent', function() {
    let state = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    state = applyResumeFromPause(state)
    expect(hasActivePlaybackIntent(state)).toBe(true)
    expect(state.playCancelled).toBe(false)
  })

  test('shouldConfirmPlayingStarted rejects paused and cancelled states', function() {
    expect(shouldConfirmPlayingStarted(snap({ playingIntent: true, isPlayingUi: true }))).toBe(true)
    expect(shouldConfirmPlayingStarted(applyPause(snap({ playingIntent: true, isPlayingUi: true })))).toBe(false)
    expect(shouldConfirmPlayingStarted(snap({ playingIntent: true, playCancelled: true }))).toBe(false)
    expect(shouldConfirmPlayingStarted(snap({ playingIntent: false, isPlayingUi: false }))).toBe(false)
  })
})

describe('seek while playing vs paused', function() {
  test('capture while playing sets seekWasPlaying', function() {
    const playing = snap({ playingIntent: true, isPlayingUi: true })
    const result = captureSeekPlaybackIntent(playing)
    expect(result.wasPlaying).toBe(true)
    expect(result.snapshot.seekWasPlaying).toBe(true)
  })

  test('capture while paused does not resume', function() {
    const paused = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    const result = captureSeekPlaybackIntent(paused)
    expect(result.wasPlaying).toBe(false)
    expect(result.snapshot.seekWasPlaying).toBe(false)
  })

  test('isPlayingUi alone counts as running when not paused', function() {
    const result = captureSeekPlaybackIntent(snap({ isPlayingUi: true }))
    expect(result.wasPlaying).toBe(true)
  })
})

describe('seek guard', function() {
  test('begin and end seek operation', function() {
    let state = snap({})
    state = beginSeekOperation(state, 3000, NOW)
    expect(isSeekGuardActive(state, NOW)).toBe(true)
    expect(isSeekGuardActive(state, NOW + 2999)).toBe(true)
    state = endSeekOperation(state)
    expect(state.seekInProgress).toBe(false)
    expect(isSeekGuardActive(state, NOW + 100)).toBe(true)
    expect(isSeekGuardActive(state, NOW + 3001)).toBe(false)
  })

  test('suppress spurious pause during seek', function() {
    let state = beginSeekOperation(snap({ playingIntent: true, isPlayingUi: true }), 3000, NOW)
    expect(shouldSuppressSpuriousPause(state, NOW)).toBe(true)
    expect(shouldHandleNativePause(state, {}, NOW)).toBe(false)
  })

  test('after seek with wasPlaying, suppress pause until seekWasPlaying cleared', function() {
    let state = snap({ playingIntent: true, isPlayingUi: true, seekWasPlaying: true })
    state = endSeekOperation(state)
    expect(shouldSuppressSpuriousPause(state, NOW + 5000)).toBe(true)
    state = clearSeekWasPlaying(state)
    expect(shouldSuppressSpuriousPause(state, NOW + 5000)).toBe(false)
  })
})

describe('shouldUseExistingPlayer', function() {
  test('returns true only when ready and loaded src matches active src', function() {
    expect(shouldUseExistingPlayer('https://youtu.be/a', 'https://youtu.be/a', true)).toBe(true)
    expect(shouldUseExistingPlayer('https://youtu.be/a', 'https://youtu.be/b', true)).toBe(false)
    expect(shouldUseExistingPlayer('https://youtu.be/a', 'https://youtu.be/a', false)).toBe(false)
    expect(shouldUseExistingPlayer(null, 'https://youtu.be/a', true)).toBe(false)
    expect(shouldUseExistingPlayer('https://youtu.be/a', null, true)).toBe(false)
  })
})

describe('autoplay and tap-to-play', function() {
  test('intentional pause is not autoplay blocked', function() {
    const paused = applyPause(snap({ playingIntent: true }))
    expect(youtubeAutoplayAppearsBlocked(paused, YT_STATE.PAUSED)).toBe(false)
    expect(shouldShowTapToPlayFromYoutubePoll(paused, 1, 1, YT_STATE.PAUSED, true)).toBe(false)
  })

  test('youtube poll shows tap to play only when playing intent and not paused', function() {
    const playing = snap({ playingIntent: true, isPlayingUi: true })
    expect(shouldShowTapToPlayFromYoutubePoll(playing, 1, 1, YT_STATE.PAUSED, true)).toBe(true)
    expect(shouldShowTapToPlayFromYoutubePoll(playing, 1, 2, YT_STATE.PAUSED, true)).toBe(false)
  })

  test('blocked cold-start autoplay (unstarted player) is treated as blocked', function() {
    const playing = snap({ playingIntent: true, isPlayingUi: true })
    // A cold-start autoplay that the browser refuses leaves the player unstarted.
    expect(youtubeAutoplayAppearsBlocked(playing, YT_STATE.UNSTARTED)).toBe(true)
    expect(shouldShowTapToPlayFromYoutubePoll(playing, 1, 1, YT_STATE.UNSTARTED, true)).toBe(true)
    // Still buffering is not treated as blocked (playback may yet start).
    expect(shouldShowTapToPlayFromYoutubePoll(playing, 1, 1, YT_STATE.BUFFERING, true)).toBe(false)
    // Not the last attempt: keep waiting, don't prompt yet.
    expect(shouldShowTapToPlayFromYoutubePoll(playing, 1, 1, YT_STATE.UNSTARTED, false)).toBe(false)
  })

  test('autoplay recovery does not run while paused or during seek guard', function() {
    const paused = applyPause(snap({ playingIntent: true }))
    expect(shouldTriggerAutoplayRecovery(paused, {})).toBe(false)

    const seeking = beginSeekOperation(snap({ playingIntent: true, isPlayingUi: false }), 3000, NOW)
    expect(shouldTriggerAutoplayRecovery(seeking, { isSeekGuardActive: true })).toBe(false)
  })

  test('autoplay recovery runs when intent set but UI not playing', function() {
    const state = snap({ playingIntent: true, isPlayingUi: false })
    expect(shouldTriggerAutoplayRecovery(state, {})).toBe(true)
  })

  test('autoplay recovery suppressed when queue item has no playback target', function() {
    const state = snap({ playingIntent: true, isPlayingUi: false })
    expect(shouldTriggerAutoplayRecovery(state, { queueItemUnplayable: true })).toBe(false)
  })

  test('block play during a playing seek unless restart', function() {
    const captured = captureSeekPlaybackIntent(snap({ playingIntent: true, isPlayingUi: true }))
    const seeking = beginSeekOperation(captured.snapshot, 3000, NOW)
    expect(shouldBlockPlayDuringSeek(seeking, {}, NOW)).toBe(true)
    expect(shouldBlockPlayDuringSeek(seeking, { restart: true }, NOW)).toBe(false)
  })

  test('paused seek does not block a subsequent play request', function() {
    // pause -> rewind/seek -> play: requestPlayback flips playingIntent on and
    // userPaused off before play(); the lingering guard must not swallow it.
    let state = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    const captured = captureSeekPlaybackIntent(state)
    expect(captured.wasPlaying).toBe(false)
    state = beginSeekOperation(captured.snapshot, 3000, NOW)
    state = applyResumeFromPause(state)
    expect(shouldBlockPlayDuringSeek(state, {}, NOW)).toBe(false)
  })

  test('user resume bypasses seek autoplay block', function() {
    const seeking = beginSeekOperation(snap({ playingIntent: true, isPlayingUi: true }), 3000, NOW)
    expect(shouldBlockAutoplayDuringSeek(seeking, { userResume: true }, NOW)).toBe(false)
    expect(shouldBlockAutoplayDuringSeek(seeking, {}, NOW)).toBe(true)
  })
})

describe('tap-to-play modal dismiss', function() {
  test('dismiss without stop when user paused', function() {
    expect(shouldDismissTapToPlayModalWithoutStop('media', true)).toBe(true)
    expect(shouldDismissTapToPlayModalWithoutStop('media', false)).toBe(false)
    expect(shouldDismissTapToPlayModalWithoutStop('none', true)).toBe(false)
  })
})

describe('media session and background recovery', function() {
  test('media session stays playing while active intent even if UI not playing', function() {
    expect(resolveMediaSessionPlaybackState(snap({
      playingIntent: true,
      userPaused: false,
      isPlayingUi: false,
    }))).toBe('playing')
    expect(resolveMediaSessionPlaybackState(snap({
      playingIntent: false,
      userPaused: false,
      isPlayingUi: false,
    }))).toBe('paused')
    expect(resolveMediaSessionPlaybackState(applyPause(snap({
      playingIntent: true,
      isPlayingUi: true,
    })))).toBe('paused')
  })

  test('unexpected native pause recovers only with active intent', function() {
    expect(shouldRecoverUnexpectedNativePause(snap({
      playingIntent: true,
      userPaused: false,
    }), {}, NOW)).toBe(true)
    expect(shouldRecoverUnexpectedNativePause(applyPause(snap({
      playingIntent: true,
      isPlayingUi: true,
    })), {}, NOW)).toBe(false)
    expect(shouldRecoverUnexpectedNativePause(snap({
      playingIntent: true,
      userPaused: false,
    }), { externalMediaActive: true }, NOW)).toBe(false)
  })

  test('resume on visible requires active intent', function() {
    expect(shouldResumePlaybackOnVisible(snap({
      playingIntent: true,
      userPaused: false,
    }))).toBe(true)
    expect(shouldResumePlaybackOnVisible(applyPause(snap({
      playingIntent: true,
      isPlayingUi: true,
    })))).toBe(false)
  })
})

describe('native event ignoring', function() {
  test('ignore native events when external media active', function() {
    const state = snap({ playingIntent: true, isPlayingUi: true })
    expect(shouldIgnoreNativePlaybackEvents(state, { externalMediaActive: true }, NOW)).toBe(true)
  })
})

describe('seek math', function() {
  test('clamp and convert seek positions', function() {
    expect(clampSeekRatio(0.5)).toBe(0.5)
    expect(clampSeekRatio(1.5)).toBe(1)
    expect(clampSeekRatio(-1)).toBe(0)
    expect(clampSeekRatio('bad')).toBe(null)
    expect(seekSecondsFromRatio(0.25, 120)).toBe(30)
    expect(seekRatioFromSeconds(30, 120)).toBe(0.25)
    expect(seekSecondsFromRatio(0.5, 0)).toBe(null)
  })
})

describe('regression scenarios', function() {
  test('play → seek: was playing, guard suppresses pause', function() {
    let state = snap({ playingIntent: true, isPlayingUi: true })
    const captured = captureSeekPlaybackIntent(state)
    state = captured.snapshot
    state = beginSeekOperation(state, 3000, NOW)
    expect(captured.wasPlaying).toBe(true)
    expect(shouldSuppressSpuriousPause(state, NOW)).toBe(true)
    expect(shouldBlockPlayDuringSeek(state, {}, NOW)).toBe(true)
  })

  test('pause → seek: move only, no resume', function() {
    let state = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    const captured = captureSeekPlaybackIntent(state)
    expect(captured.wasPlaying).toBe(false)
  })

  test('pause → delayed youtube poll must not show tap to play', function() {
    const state = applyPause(snap({ playingIntent: true }))
    expect(shouldShowTapToPlayFromYoutubePoll(state, 5, 5, YT_STATE.PAUSED, true)).toBe(false)
  })

  test('pause → dismiss modal should not require stop', function() {
    const state = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    expect(shouldDismissTapToPlayModalWithoutStop('media', state.userPaused)).toBe(true)
  })

  test('pause → play → seek: playing again', function() {
    let state = applyPause(snap({ playingIntent: true, isPlayingUi: true }))
    state = applyResumeFromPause(state)
    const captured = captureSeekPlaybackIntent(state)
    state = captured.snapshot
    state = beginSeekOperation(state, 3000, NOW)
    expect(captured.wasPlaying).toBe(true)
    expect(shouldSuppressSpuriousPause(state, NOW)).toBe(true)
  })
})

describe('resolveDisplaySeconds (single position source of truth)', function() {
  const base = {
    now: NOW,
    seekHoldUntil: 0,
    seekTargetSeconds: 0,
    userPaused: false,
    playingIntent: true,
    storedSeconds: 10,
    engineSeconds: 42,
  }

  test('seek hold pins the target regardless of engine', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW + 500,
      seekTargetSeconds: 55,
      engineSeconds: 0,
    }))
    expect(r).toBe(55)
  })

  test('after hold expires, the engine clock wins', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW - 1,
      seekGuardUntil: NOW - 1,
      seekTargetSeconds: 55,
      engineSeconds: 60,
    }))
    expect(r).toBe(60)
  })

  test('paused returns stored, never the engine', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      userPaused: true,
      engineSeconds: 0,
    }))
    expect(r).toBe(10)
  })

  test('no playing intent returns stored', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      playingIntent: false,
      engineSeconds: 99,
    }))
    expect(r).toBe(10)
  })

  test('a muted/inactive engine reporting null falls back to stored', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      engineSeconds: null,
    }))
    expect(r).toBe(10)
  })

  test('a garbage engine reading (NaN/negative) falls back to stored', function() {
    expect(resolveDisplaySeconds(Object.assign({}, base, { engineSeconds: NaN }))).toBe(10)
    expect(resolveDisplaySeconds(Object.assign({}, base, { engineSeconds: -5 }))).toBe(10)
    expect(resolveDisplaySeconds(Object.assign({}, base, { engineSeconds: Infinity }))).toBe(10)
  })

  test('engine value of 0 while playing (genuine start) is honored', function() {
    const r = resolveDisplaySeconds(Object.assign({}, base, {
      storedSeconds: 0,
      engineSeconds: 0,
    }))
    expect(r).toBe(0)
  })

  test('regression: click-seek then muted element reports 0 must not reset bar', function() {
    // Immediately after a click-seek to 55s, the muted native element fires
    // timeupdate with 0. With the hold active, the bar stays at the target.
    const duringHold = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW + 700,
      seekTargetSeconds: 55,
      storedSeconds: 55,
      engineSeconds: 0,
    }))
    expect(duringHold).toBe(55)
    // After the hold, the real engine (external shifter) reports ~55 and advances.
    const afterHold = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW - 1,
      seekTargetSeconds: 55,
      storedSeconds: 55,
      engineSeconds: 55.4,
    }))
    expect(afterHold).toBeCloseTo(55.4)
  })

  test('regression: midi click-seek hold expired but stale beat still left of target', function() {
    const duringGuard = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW - 1,
      seekGuardUntil: NOW + 2000,
      seekTargetSeconds: 19.3,
      seekFromSeconds: 6.5,
      storedSeconds: 19.3,
      engineSeconds: 12.0,
    }))
    expect(duringGuard).toBeCloseTo(19.3)
    const settled = resolveDisplaySeconds(Object.assign({}, base, {
      seekHoldUntil: NOW - 1,
      seekGuardUntil: NOW + 2000,
      seekTargetSeconds: 19.3,
      seekFromSeconds: 6.5,
      storedSeconds: 19.3,
      engineSeconds: 19.9,
    }))
    expect(settled).toBeCloseTo(19.9)
  })

  test('beginSeekHold returns now + ms', function() {
    expect(beginSeekHold(NOW, 800)).toBe(NOW + 800)
    expect(beginSeekHold(NOW)).toBe(NOW + 800)
  })
})

describe('isStaleSeekEngineReading', function() {
  test('forward seek: engine left of target is stale', function() {
    expect(isStaleSeekEngineReading(12, {
      seekTargetSeconds: 19.3,
      seekFromSeconds: 6.5,
    })).toBe(true)
  })

  test('forward seek: engine at target is not stale', function() {
    expect(isStaleSeekEngineReading(19.9, {
      seekTargetSeconds: 19.3,
      seekFromSeconds: 6.5,
    })).toBe(false)
  })

  test('backward seek: engine right of old position is stale', function() {
    expect(isStaleSeekEngineReading(28, {
      seekTargetSeconds: 10,
      seekFromSeconds: 25,
    })).toBe(true)
  })
})

describe('notationBeatToAudioSeconds', function() {
  test('uses abcjs total time proportion when available', function() {
    const visualObj = {
      getTotalBeats: function() { return 8 },
      getTotalTime: function() { return 4000 },
    }
    expect(notationBeatToAudioSeconds(4, visualObj, 120)).toBe(2)
  })

  test('uses abcjs visual timing when available', function() {
    const visualObj = {
      millisecondsPerMeasure: function() { return 2000 },
      getBeatsPerMeasure: function() { return 4 },
    }
    expect(notationBeatToAudioSeconds(4, visualObj, 120)).toBe(2)
    expect(notationBeatToAudioSeconds(8, visualObj, 120)).toBe(4)
  })

  test('falls back to BPM without visual object', function() {
    expect(notationBeatToAudioSeconds(4, null, 120)).toBe(2)
  })
})

describe('notationBeatToAudioRatio', function() {
  test('maps beat position to buffer ratio', function() {
    const visualObj = {
      millisecondsPerMeasure: function() { return 2000 },
      getBeatsPerMeasure: function() { return 4 },
    }
    expect(notationBeatToAudioRatio(4, visualObj, 8, 120)).toBe(0.25)
  })
})

describe('notationMsToAudioRatio', function() {
  test('maps abcjs ms to buffer ratio', function() {
    expect(notationMsToAudioRatio(2000, 8)).toBe(0.25);
  });
})

describe('isMidiStartFromBeginning', function() {
  test('zero seconds and ratio are treated as the start', function() {
    expect(isMidiStartFromBeginning({ seconds: 0, ratio: 0 })).toBe(true)
  })

  test('mid-song position is not the start', function() {
    expect(isMidiStartFromBeginning({ seconds: 12.5, ratio: 0.5 })).toBe(false)
  })

  test('tiny float noise near zero still counts as the start', function() {
    expect(isMidiStartFromBeginning({ seconds: 0.01, ratio: 0.001 })).toBe(true)
  })
})

describe('shouldUseMidiMetronomeCountIn', function() {
  test('disabled when metronome count-in is off', function() {
    expect(shouldUseMidiMetronomeCountIn({
      metronomeCountIn: false,
      seconds: 0,
      ratio: 0,
    })).toBe(false)
  })

  test('forced restart always uses count-in', function() {
    expect(shouldUseMidiMetronomeCountIn({
      metronomeCountIn: true,
      forceRestart: true,
      seconds: 30,
      ratio: 0.75,
    })).toBe(true)
  })

  test('mid-song resume skips count-in', function() {
    expect(shouldUseMidiMetronomeCountIn({
      metronomeCountIn: true,
      seconds: 8,
      ratio: 0.4,
    })).toBe(false)
  })
})

describe('computeMidiMetronomeCountIn', function() {
  const beatDurationMs = 500 // 120bpm quarter in 4/4

  test('no pickup: one bar of clicks then music', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })
    expect(r.metronomeBeats).toBe(4)
    expect(r.delayMs).toBe(0)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(4 * beatDurationMs)
  })

  test('count-in beats override for practice warmups', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBeats: 8,
    })
    expect(r.metronomeBeats).toBe(8)
    expect(r.delayMs).toBe(0)
  })

  test('countInBarOnly: one bar in 3/4 regardless of implicit pickup', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 3,
      pickupLength: 0.5,
      beatLength: 0.25,
      millisecondsPerMeasure: 1500,
      tempoFactor: 1,
      countInBarOnly: true,
    })
    expect(r.metronomeBeats).toBe(3)
    expect(r.delayMs).toBe(0)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(3 * beatDurationMs)
  })

  test('countInBarOnly: implicit pickup would otherwise lengthen count-in', function() {
    const withPickup = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.5,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBars: 2,
    })
    expect(withPickup.metronomeBeats).toBe(6)

    const barOnly = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.5,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBarOnly: true,
    })
    expect(barOnly.metronomeBeats).toBe(4)
    expect(barOnly.delayMs).toBe(0)
  })

  test('one-beat anacrusis in 4/4: three beats of count-in (default one bar)', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.25,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })
    expect(r.metronomeBeats).toBe(3)
    expect(r.delayMs).toBe(0)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(3 * beatDurationMs)
  })

  test('one-beat anacrusis in 4/4 with two count-in bars: seven beats of count-in', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.25,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBars: 2,
    })
    expect(r.metronomeBeats).toBe(7)
    expect(r.delayMs).toBe(0)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(7 * beatDurationMs)
  })

  test('one-beat anacrusis in 3/4: two beats of count-in', function() {
    const beatDurationMs34 = 600
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 3,
      pickupLength: 0.25,
      beatLength: 0.25,
      millisecondsPerMeasure: 1800,
      tempoFactor: 1,
    })
    expect(r.metronomeBeats).toBe(2)
    expect(r.delayMs).toBe(0)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(2 * beatDurationMs34)
  })

  test('dotted pickup (1.5 beats): two clicks plus half-beat delay (one bar)', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.375,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })
    expect(r.metronomeBeats).toBe(2)
    expect(r.delayMs).toBeCloseTo(0.5 * beatDurationMs)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(2.5 * beatDurationMs)
  })

  test('half-beat anacrusis: three clicks plus half-beat delay (one bar)', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.125,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })
    expect(r.metronomeBeats).toBe(3)
    expect(r.delayMs).toBeCloseTo(0.5 * beatDurationMs)
    expect(r.metronomeBeats * r.beatDurationMs + r.delayMs).toBeCloseTo(3.5 * beatDurationMs)
  })

  test('tempo factor scales beat duration and delay', function() {
    const r = computeMidiMetronomeCountIn({
      beatsPerMeasure: 4,
      pickupLength: 0.375,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 2,
    })
    expect(r.beatDurationMs).toBeCloseTo(beatDurationMs / 2)
    expect(r.delayMs).toBeCloseTo(0.5 * beatDurationMs / 2)
  })
})

describe('computeExtraMeasuresAtBeginning', function() {
  test('no pickup: not representable as whole measures', function() {
    expect(computeExtraMeasuresAtBeginning({
      beatsPerMeasure: 4,
      pickupLength: 0,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })).toBe(0)
  })

  test('one-beat anacrusis in 4/4: one measure by default', function() {
    expect(computeExtraMeasuresAtBeginning({
      beatsPerMeasure: 4,
      pickupLength: 0.25,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })).toBe(1)
  })

  test('one-beat anacrusis in 4/4: two measures when count-in bars is 2', function() {
    expect(computeExtraMeasuresAtBeginning({
      beatsPerMeasure: 4,
      pickupLength: 0.25,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBars: 2,
    })).toBe(2)
  })

  test('dotted pickup: one measure by default', function() {
    expect(computeExtraMeasuresAtBeginning({
      beatsPerMeasure: 4,
      pickupLength: 0.375,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })).toBe(1)
  })

  test('countInBarOnly: no extra measures even with pickup', function() {
    expect(computeExtraMeasuresAtBeginning({
      beatsPerMeasure: 4,
      pickupLength: 0.5,
      beatLength: 0.25,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
      countInBarOnly: true,
    })).toBe(0)
  })
})

describe('timing progress audio mapping', function() {
  // 4/4, one-beat pickup, two count-in bars at qpm 120:
  // startingDelay = 2 bars - 1 beat = 7 beats at 0.5s = 3500ms
  const musicStartMsTwoBars = computeTimingMusicStartMs({
    extraMeasuresAtBeginning: 2,
    qpm: 120,
    beatLength: 0.25,
    barLength: 1,
    pickupLength: 0.25,
  })
  const musicStartMsOneBar = computeTimingMusicStartMs({
    extraMeasuresAtBeginning: 1,
    qpm: 120,
    beatLength: 0.25,
    barLength: 1,
    pickupLength: 0.25,
  })
  const lastMomentMs = musicStartMsTwoBars + 10000

  test('computeTimingMusicStartMs mirrors abcjs setTiming delay (two count-in bars)', function() {
    expect(musicStartMsTwoBars).toBeCloseTo(3500)
  })

  test('computeTimingMusicStartMs with one count-in bar', function() {
    expect(musicStartMsOneBar).toBeCloseTo(1500)
  })

  test('computeTimingMusicStartMs is 0 without extra measures', function() {
    expect(computeTimingMusicStartMs({
      extraMeasuresAtBeginning: 0,
      qpm: 120,
      beatLength: 0.25,
      barLength: 1,
      pickupLength: 0,
    })).toBe(0)
  })

  test('audio ratio 0 maps to start of music, not count-in', function() {
    expect(audioRatioToTimingProgress(0, musicStartMsTwoBars, lastMomentMs))
      .toBeCloseTo(musicStartMsTwoBars / lastMomentMs)
  })

  test('audio ratio 1 maps to end of timing timeline', function() {
    expect(audioRatioToTimingProgress(1, musicStartMsTwoBars, lastMomentMs)).toBeCloseTo(1)
  })

  test('mid-song audio ratio accounts for count-in prefix', function() {
    const progress = audioRatioToTimingProgress(0.5, musicStartMsTwoBars, lastMomentMs)
    expect(progress).toBeCloseTo((musicStartMsTwoBars + 5000) / lastMomentMs)
    expect(timingProgressToAudioSeconds(progress, musicStartMsTwoBars, lastMomentMs, 20))
      .toBeCloseTo(10)
  })

  test('timing progress during count-in reports audio at 0', function() {
    expect(timingProgressToAudioSeconds(
      (musicStartMsTwoBars * 0.5) / lastMomentMs,
      musicStartMsTwoBars,
      lastMomentMs,
      20
    )).toBe(0)
  })

  test('mapping is identity when there is no count-in prefix', function() {
    expect(audioRatioToTimingProgress(0.25, 0, 8000)).toBeCloseTo(0.25)
    expect(timingProgressToAudioSeconds(0.25, 0, 8000, 40)).toBeCloseTo(10)
  })
})

describe('computePlaybackMetronomeTempo', function() {
  test('derives meter-beat BPM from abcjs timing (4/4 at 120)', function() {
    expect(computePlaybackMetronomeTempo({
      beatsPerMeasure: 4,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })).toBeCloseTo(120)
  })

  test('applies playback tempo factor', function() {
    expect(computePlaybackMetronomeTempo({
      beatsPerMeasure: 4,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1.5,
    })).toBeCloseTo(180)
  })

  test('matches compound meter beat spacing (6/8)', function() {
    expect(computePlaybackMetronomeTempo({
      beatsPerMeasure: 2,
      millisecondsPerMeasure: 2000,
      tempoFactor: 1,
    })).toBeCloseTo(60)
  })

  test('falls back when timing data is missing', function() {
    expect(computePlaybackMetronomeTempo({ fallbackQpm: 96 })).toBe(96)
  })
})

describe('metronomeSlotFromMusicSeconds', function() {
  const rhythm44 = rhythmFromPreset('4-4')

  test('returns slot 0 at music start', function() {
    expect(metronomeSlotFromMusicSeconds(0, 120, rhythm44)).toBe(0)
  })

  test('returns slot 1 after one beat at 120 bpm', function() {
    expect(metronomeSlotFromMusicSeconds(0.5, 120, rhythm44)).toBe(1)
  })

  test('wraps within the bar', function() {
    expect(metronomeSlotFromMusicSeconds(2.0, 120, rhythm44)).toBe(0)
  })
})

describe('timeUntilNextMetronomeSlot', function() {
  const rhythm44 = rhythmFromPreset('4-4')

  test('returns one beat at 120 bpm from bar start', function() {
    expect(timeUntilNextMetronomeSlot(0, 120, rhythm44)).toBeCloseTo(0.5)
  })

  test('returns remaining beat time mid-bar', function() {
    expect(timeUntilNextMetronomeSlot(0.25, 120, rhythm44)).toBeCloseTo(0.25)
  })
})
