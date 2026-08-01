import {
  getViewedTuneIdFromPath,
  shouldShowPlaylistTransportBar,
  isTuneListPath,
  isPlaybackBrowsePath,
  shouldSuppressHostAutostart,
  isQueuePlaybackEngaged,
  shouldAdvancePlaybackOnEnd,
  getSkipNavigationTuneId,
  shouldUseQueueNavigationForAdjacent,
  shouldPreservePlaylistAudioDuringSearchBrowse,
  shouldPreferQueueNavigation,
  getActivePlaybackTuneId,
  resolveNowPlayingDisplayTuneId,
  isPlaybackActivelyPlaying,
  shouldStartPlaybackWhenAdvancing,
  isMiniPlayerTransportVisible,
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

  test('isFootPedalEnabledPath', function() {
    const { isFootPedalEnabledPath, isTuneSingleViewPath } = require('./playbackNavigationUtils')
    expect(isTuneSingleViewPath('/tunes/abc')).toBe(true)
    expect(isTuneSingleViewPath('/tunes')).toBe(false)
    expect(isTuneSingleViewPath('/tunes/practice')).toBe(false)
    expect(isFootPedalEnabledPath('/tunes')).toBe(true)
    expect(isFootPedalEnabledPath('/tunes/practice')).toBe(true)
    expect(isFootPedalEnabledPath('/tunes/abc')).toBe(true)
    expect(isFootPedalEnabledPath('/tunes/abc/playMedia')).toBe(true)
    expect(isFootPedalEnabledPath('/editor/abc')).toBe(false)
    expect(isFootPedalEnabledPath('/gig/set1/tune1')).toBe(false)
    expect(isFootPedalEnabledPath('/settings')).toBe(false)
  })

  test('isPlaybackBrowsePath', function() {
    expect(isPlaybackBrowsePath('/')).toBe(true)
    expect(isPlaybackBrowsePath('/books')).toBe(true)
    expect(isPlaybackBrowsePath('/books/')).toBe(true)
    expect(isPlaybackBrowsePath('/tags')).toBe(true)
    expect(isPlaybackBrowsePath('/tunes')).toBe(false)
    expect(isPlaybackBrowsePath('/tunes/abc')).toBe(false)
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
    expect(shouldAdvancePlaybackOnEnd(Object.assign({}, queue, { repeatTrack: true, repeatMode: 'track' }), true)).toBe(true)
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
    expect(shouldShowPlaylistTransportBar('/now-playing', queue, false)).toBe(true)
    expect(shouldShowPlaylistTransportBar('/settings', null, false, { isPlaying: true })).toBe(true)
  })

  test('isMiniPlayerTransportVisible', function() {
    const queue = createQueue({ tuneIds: ['a'] })
    expect(isMiniPlayerTransportVisible('/tunes/a', queue, false)).toBe(true)
    expect(isMiniPlayerTransportVisible('/scratchpad', queue, false)).toBe(false)
    expect(isMiniPlayerTransportVisible('/tunes/a', queue, true)).toBe(false)
    expect(isMiniPlayerTransportVisible('/settings', null, false, { isPlaying: true })).toBe(true)
  })

  test('getSkipNavigationTuneId uses viewed tune only', function() {
    const queue = createQueue({ tuneIds: ['queue-tune'], currentIndex: 0 })
    expect(getSkipNavigationTuneId('/tunes/viewed', queue)).toBe('viewed')
    expect(getSkipNavigationTuneId('/tunes', queue)).toBeNull()
  })

  test('shouldUseQueueNavigationForAdjacent when playback engaged', function() {
    const queue = createQueue({ tuneIds: ['a', 'b'] })
    const mediaController = { isPlaying: true }
    expect(shouldUseQueueNavigationForAdjacent({}, mediaController, queue)).toBe(true)
    expect(shouldUseQueueNavigationForAdjacent({ forceSearchList: true }, mediaController, queue)).toBe(false)
    expect(shouldUseQueueNavigationForAdjacent({ useQueueNavigation: true }, {}, null)).toBe(true)
    expect(shouldUseQueueNavigationForAdjacent({}, {}, queue)).toBe(false)
  })

  test('shouldPreferQueueNavigation', function() {
    const queue = createQueue({ tuneIds: ['a'] })
    expect(shouldPreferQueueNavigation({ isPlaying: true }, queue)).toBe(true)
    expect(shouldPreferQueueNavigation({}, queue)).toBe(false)
  })

  test('getActivePlaybackTuneId', function() {
    const queue = createQueue({ tuneIds: ['queue-tune'], currentIndex: 0 })
    expect(getActivePlaybackTuneId({ tune: { id: 'engine-tune' } }, queue)).toBe('queue-tune')
    expect(getActivePlaybackTuneId({ tune: { id: 'engine-tune' } }, null)).toBe('engine-tune')
    const previewQueue = Object.assign({}, queue, {
      previewOnce: { tuneId: 'preview-tune', returnIndex: 0 },
    })
    expect(getActivePlaybackTuneId({ tune: { id: 'preview-tune' }, isPlaying: true }, previewQueue))
      .toBe('preview-tune')
    expect(getActivePlaybackTuneId({
      tune: { id: 'other-tune' },
      isPlaying: true,
    }, queue)).toBe('other-tune')
    expect(getActivePlaybackTuneId({
      tune: { id: 'other-tune' },
      canResumePlayback: function() { return true },
    }, queue)).toBe('queue-tune')
  })

  test('resolveNowPlayingDisplayTuneId prefers viewed tune in viewed focus', function() {
    const queue = createQueue({ tuneIds: ['queue-tune'], currentIndex: 0 })
    const mediaController = { tune: { id: 'queue-tune' }, isPlaying: true }
    expect(resolveNowPlayingDisplayTuneId({
      focus: 'viewed',
      viewedTuneId: 'viewed-tune',
      mediaController: mediaController,
      queue: queue,
    })).toBe('viewed-tune')
    expect(resolveNowPlayingDisplayTuneId({
      focus: 'playlist',
      viewedTuneId: 'viewed-tune',
      mediaController: mediaController,
      queue: queue,
    })).toBe('queue-tune')
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

  test('isPlaybackActivelyPlaying ignores paused playback', function() {
    expect(isPlaybackActivelyPlaying({ isPlaying: true })).toBe(true)
    expect(isPlaybackActivelyPlaying({ isLoading: true })).toBe(true)
    expect(isPlaybackActivelyPlaying({
      hasActivePlaybackIntent: function() { return true },
    })).toBe(true)
    expect(isPlaybackActivelyPlaying({
      canResumePlayback: function() { return true },
    })).toBe(false)
    expect(isPlaybackActivelyPlaying({
      canResumePlayback: function() { return true },
      hasActivePlaybackIntent: function() { return false },
    })).toBe(false)
  })

  test('shouldStartPlaybackWhenAdvancing stays false while paused', function() {
    const paused = {
      canResumePlayback: function() { return true },
      hasActivePlaybackIntent: function() { return false },
    }
    expect(shouldStartPlaybackWhenAdvancing(paused, false)).toBe(false)
    expect(shouldStartPlaybackWhenAdvancing({ isPlaying: true }, false)).toBe(true)
    expect(shouldStartPlaybackWhenAdvancing(paused, true)).toBe(true)
  })
})
