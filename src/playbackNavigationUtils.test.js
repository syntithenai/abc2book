import {
  getViewedTuneIdFromPath,
  shouldShowPlaylistTransportBar,
  isTuneListPath,
  shouldSuppressHostAutostart,
  isQueuePlaybackEngaged,
} from './playbackNavigationUtils'
import { createQueue } from './nowPlayingQueue'

describe('playbackNavigationUtils', function() {
  test('isTuneListPath', function() {
    expect(isTuneListPath('/tunes')).toBe(true)
    expect(isTuneListPath('/tunes/check')).toBe(true)
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

  test('isQueuePlaybackEngaged', function() {
    expect(isQueuePlaybackEngaged(null)).toBe(false)
    expect(isQueuePlaybackEngaged({ isPlaying: true })).toBe(true)
    expect(isQueuePlaybackEngaged({
      canResumePlayback: function() { return true },
    })).toBe(true)
    expect(isQueuePlaybackEngaged({})).toBe(false)
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
})
