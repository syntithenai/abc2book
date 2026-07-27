/**
 * Backward-compatible re-exports. New code should use rhythmGrid.js and
 * rhythmPlaybackController.js directly.
 */
import {
  computeMusicLockedLookaheadSec,
  createPlayingScheduleState,
  getRhythmSwing,
  resetPlayingScheduleState,
  schedulePlayingSlots,
  slotDurationSec,
  barDurationSec,
  musicSecondsForGlobalSlot,
  globalSlotAtMusicSeconds,
  slotScheduleKey,
  DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC,
  MAX_MUSIC_LOCKED_LOOKAHEAD_SEC,
} from './rhythmGrid'

export {
  computeMusicLockedLookaheadSec,
  getRhythmSwing,
  slotDurationSec,
  barDurationSec,
  musicSecondsForGlobalSlot,
  globalSlotAtMusicSeconds,
  slotScheduleKey,
  DEFAULT_MUSIC_LOCKED_LOOKAHEAD_SEC,
  MAX_MUSIC_LOCKED_LOOKAHEAD_SEC,
}

export function createMusicLockedMetronomeState() {
  return createPlayingScheduleState()
}

export function resetMusicLockedMetronome(state) {
  resetPlayingScheduleState(state)
}

export function audioTimeForMusicSeconds(state, musicSeconds, audioContextTime) {
  if (state.anchorMusicSeconds == null || state.anchorAudioTime == null) {
    state.anchorMusicSeconds = musicSeconds
    state.anchorAudioTime = audioContextTime
  }
  return state.anchorAudioTime + (musicSeconds - state.anchorMusicSeconds)
}

export function scheduleMusicLockedSlots(state, options) {
  return schedulePlayingSlots(state, options)
}
