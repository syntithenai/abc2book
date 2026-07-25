import {
  getViewedTuneIdFromPath,
  shouldShowPlaylistTransportBar,
  isTuneListPath,
  shouldSuppressHostAutostart,
  isQueuePlaybackEngaged,
  shouldAdvancePlaybackOnEnd,
  getSkipNavigationTuneId,
  shouldUseQueueNavigationForAdjacent,
  shouldPreservePlaylistAudioDuringSearchBrowse,
} from './playbackNavigationUtils'
import { createQueue } from './nowPlayingQueue'

describe('playbackNavigationUtils', function() {
  test('isTuneListPath', function() {
    expect(isTuneListPath('/tunes')).toBe(true)
    expect(isTuneListPath('/tunes/')).toBe(true)
    expect(isTuneListPath('/tunes/practice')).toBe(true)
    expect(isTuneListPath('/tunes/abc')).toBe(false)
    expect(isTuneListPath('/tunes/abc/playMedia')).toBe(false)
  })

  test('shouldSuppressHostAutostart on list unless already playing', function() {
    expect(shouldSuppressHostAutostart('/tunes', { isPlaying: false }, true, null)).toBe(true)
    expect(shouldSuppressHostAutostart('/tunes', { isPlaying: true }, true, null)).toBe(false)
    expect(shouldSuppressHostAutostart('/tunes/abc/playMedia', {}, false, { playState: 'playMedia' })).toBe(false)
    expect(shouldSuppressHostAutostart('/tunes/abc', {}, true, null)).toBe(false)
  })

  test('shouldAdvancePlaybackOnEnd only for active queue auto-advance', function() {
    const queue = createQueue({ tuneIds: ['a', 'b'] })
    expect(shouldAdvancePlaybackOnEnd(queue, true)).toBe(true)
    expect(shouldAdvancePlaybackOnEnd(Object.assign({}, queue, { autoAdvance: false }), true)).toBe(false)
    expect(shouldAdvancePlaybackOnEnd(queue, false)).toBe(false)
    expect(shouldAdvancePlaybackOnEnd(null, true)).toBe(false)
  })

  test('isQueuePlaybackEngaged', function() {
    expect(isQueuePlaybackEngaged(null)).toBe(false)
    expect(isQueuePlaybackEngaged({ isPlaying: true })).toBe(true)
    expect(isQueuePlaybackEngaged({
      canResumePlayback: function() { return true },
    })).toBe(true)
    expect(isQueuePlaybackEngaged({})).toBe(false)
  })

  test('isQueuePlaybackEngaged ignores paused queue when browsing a different tune', function() {
    const queue = createQueue({ tuneIds: ['playing', 'other'], currentIndex: 0 })
    expect(isQueuePlaybackEngaged({
      canResumePlayback: function() { return true },
    }, {
      queue: queue,
      viewedTuneId: 'other',
    })).toBe(false)
    expect(isQueuePlaybackEngaged({
      canResumePlayback: function() { return true },
    }, {
      queue: queue,
      viewedTuneId: 'playing',
    })).toBe(true)
  })

  test('getViewedTuneIdFromPath', function() {
    expect(getViewedTuneIdFromPath('/tunes/abc/playMidi')).toBe('abc')
    expect(getViewedTuneIdFromPath('/editor/xyz')).toBe('xyz')
    expect(getViewedTuneIdFromPath('/settings')).toBeNull()
  })

  test('shouldShowPlaylistTransportBar', function() {
    const queue = createQueue({ tuneIds: ['a'] })
    expect(shouldShowPlaylistTransportBar('/tunes/a', queue, false)).toBe(true)
    expect(shouldShowPlaylistTransportBar('/gig/set-1', queue, false)).toBe(false)
    expect(shouldShowPlaylistTransportBar('/tunes/a', queue, true)).toBe(false)
    expect(shouldShowPlaylistTransportBar('/tunes/a', null, false)).toBe(false)
  })

  test('getSkipNavigationTuneId uses viewed tune only', function() {
    const queue = createQueue({ tuneIds: ['queue-tune'], currentIndex: 0 })
    expect(getSkipNavigationTuneId('/tunes/viewed', queue)).toBe('viewed')
    expect(getSkipNavigationTuneId('/tunes', queue)).toBeNull()
  })

  test('shouldUseQueueNavigationForAdjacent only when transport opts in', function() {
    expect(shouldUseQueueNavigationForAdjacent({})).toBe(false)
    expect(shouldUseQueueNavigationForAdjacent({ forceSearchList: true })).toBe(false)
    expect(shouldUseQueueNavigationForAdjacent({ useQueueNavigation: true })).toBe(true)
  })

  test('shouldPreservePlaylistAudioDuringSearchBrowse keeps queue audio during header browse', function() {
    const queue = createQueue({ tuneIds: ['a', 'b'] })
    const mediaController = { isPlaying: true }
    expect(shouldPreservePlaylistAudioDuringSearchBrowse({}, queue, mediaController)).toBe(true)
    expect(shouldPreservePlaylistAudioDuringSearchBrowse(
      { useQueueNavigation: true },
      queue,
      mediaController
    )).toBe(false)
  })
})
