jest.mock('./linkedMediaPitchPath', function() {
  return {
    linkedMediaPitchPathAvailableSync: function(opts) {
      return !!(opts && opts.pitchPathAvailable)
    },
  }
})

jest.mock('./platformUtils', function() {
  return {
    prefersNativeMediaPlayback: function() { return true },
    isAndroidApp: function() { return false },
  }
})

import { isBackgroundCapablePlayback } from './backgroundPlaybackCapability'

describe('backgroundPlaybackCapability', function() {
  test('plain linked audio is background capable on Android', function() {
    expect(isBackgroundCapablePlayback({
      routeMode: 'media',
      srcType: 'audio',
      settings: { tempo: 1, pitch: 0, fineTune: 0, audioFilters: {} },
    })).toBe(true)
  })

  test('processed audio without native path is not background capable on web', function() {
    expect(isBackgroundCapablePlayback({
      routeMode: 'media',
      srcType: 'audio',
      settings: { tempo: 1, pitch: 2, fineTune: 0, audioFilters: {} },
      pitchPathOptions: { srcType: 'audio' },
    })).toBe(false)
  })

  test('processed audio with pitch path is background capable', function() {
    expect(isBackgroundCapablePlayback({
      routeMode: 'media',
      srcType: 'audio',
      settings: { tempo: 1, pitch: 2, fineTune: 0, audioFilters: {} },
      pitchPathOptions: { srcType: 'audio', pitchPathAvailable: true },
      androidNativeFetchAvailable: true,
    })).toBe(true)
  })

  test('processed audio with pre-rendered blob is background capable', function() {
    expect(isBackgroundCapablePlayback({
      routeMode: 'media',
      srcType: 'youtube',
      settings: { tempo: 1, pitch: 2, fineTune: 0, audioFilters: {} },
      hasPreRenderedBlob: true,
    })).toBe(true)
  })

  test('MIDI file links are not background capable without native cache', function() {
    expect(isBackgroundCapablePlayback({
      routeMode: 'media',
      srcType: 'midifile',
      settings: { tempo: 1, pitch: 0, fineTune: 0, audioFilters: {} },
    })).toBe(false)
  })
})
