import { linkedMediaPitchPathAvailableSync } from './linkedMediaPitchPath'
import { youtubeAudioBytesAvailableSync } from './youtubeUnlock'

describe('linkedMediaPitchPath', function() {
  beforeEach(function() {
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
  })

  test('extension unlocks youtube without resolver health', function() {
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.2')
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(true)
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
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

  test('sync helper matches extension marker', function() {
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.2')
    expect(linkedMediaPitchPathAvailableSync({
      srcType: 'youtube',
      resolverFeatures: null,
      resolverStatus: null,
    })).toBe(true)
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
  })
})
