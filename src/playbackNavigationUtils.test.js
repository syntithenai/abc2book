import {
  getViewedTuneIdFromPath,
  resolveListNavigationContext,
  shouldShowPlaylistTransportBar,
} from './playbackNavigationUtils'
import { createQueue } from './nowPlayingQueue'

describe('playbackNavigationUtils', function() {
  test('getViewedTuneIdFromPath', function() {
    expect(getViewedTuneIdFromPath('/tunes/abc/playMidi')).toBe('abc')
    expect(getViewedTuneIdFromPath('/editor/xyz')).toBe('xyz')
    expect(getViewedTuneIdFromPath('/settings')).toBeNull()
  })

  test('resolveListNavigationContext hides playlist context when queue active', function() {
    const queue = createQueue({ tuneIds: ['a', 'b'] })
    expect(resolveListNavigationContext('/tunes/a', queue, null)).toBeNull()
    expect(resolveListNavigationContext('/tunes/a', null, null)).toBe('list')
    expect(resolveListNavigationContext('/tunes/a', null, { tunes: [{ id: 'x' }] })).toBe('set')
  })

  test('shouldShowPlaylistTransportBar', function() {
    const queue = createQueue({ tuneIds: ['a'] })
    expect(shouldShowPlaylistTransportBar('/tunes/a', queue, false)).toBe(true)
    expect(shouldShowPlaylistTransportBar('/gig/set-1', queue, false)).toBe(false)
    expect(shouldShowPlaylistTransportBar('/tunes/a', queue, true)).toBe(false)
    expect(shouldShowPlaylistTransportBar('/tunes/a', null, false)).toBe(false)
  })
})
