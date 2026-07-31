import { linkedMediaPitchPathAvailableSync } from './linkedMediaPitchPath'
import {
  __resetYoutubeExtensionPingCache,
  __setCachedPingForTests,
} from './youtubeExtensionClient'

describe('linkedMediaPitchPath', function() {
  beforeEach(function() {
    __resetYoutubeExtensionPingCache()
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
  })

  test('extension unlocks youtube without resolver health', function() {
    __setCachedPingForTests({ ok: true, version: '0.1.2', via: 'ping' })
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(true)
  })

  test('blocked when shared resolver needs login and no extension', function() {
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: { proxy: true, youtubeAudio: true },
      resolverStatus: {
        available: false,
        candidates: [{
          base: 'https://resolver.example',
          reachable: true,
          requireAuth: true,
          available: false,
          authReason: 'login_required',
        }],
      },
      accessToken: null,
    })).toBe(false)
  })

  test('recording links are always available locally', function() {
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'recording',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(true)
  })

  test('audio files need reachable resolver proxy', function() {
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'audio',
      resolverFeatures: { proxy: true },
      resolverStatus: { available: true },
    })).toBe(true)
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'audio',
      resolverFeatures: { proxy: true },
      resolverStatus: { available: false },
    })).toBe(false)
  })

  test('sync helper requires successful extension ping, not DOM marker alone', function() {
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.2')
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(false)
    __setCachedPingForTests({ ok: true, version: '0.1.2', via: 'ping' })
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(true)
  })
})
