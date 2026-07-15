import {
  getSavedWebshareProxyUrl,
  isWebshareProxyConfigured,
  normalizeProxyUrl,
  setSavedWebshareProxyUrl,
} from './webshareProxySettings'
import { youtubeAudioBytesAvailableSync } from './youtubeUnlock'

describe('webshareProxySettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('normalizes and round-trips proxy URL', function() {
    expect(normalizeProxyUrl('http://user:pass@proxy.webshare.io:80')).toBe(
      'http://user:pass@proxy.webshare.io:80'
    )
    expect(normalizeProxyUrl('ftp://x')).toBe('')
    setSavedWebshareProxyUrl('http://u:p@host:8080')
    expect(getSavedWebshareProxyUrl()).toBe('http://u:p@host:8080')
    expect(isWebshareProxyConfigured()).toBe(true)
  })
})

describe('youtubeUnlock', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('BYOR fat proxy unlocks without webshare', function() {
    expect(youtubeAudioBytesAvailableSync({
      resolverFeatures: { proxy: true, lightMode: false },
    })).toBe(true)
  })

  test('light mode requires webshare when egress required', function() {
    expect(youtubeAudioBytesAvailableSync({
      resolverFeatures: { proxy: true, lightMode: true, youtubeEgressRequired: true },
    })).toBe(false)
    setSavedWebshareProxyUrl('http://u:p@proxy.example:80')
    expect(youtubeAudioBytesAvailableSync({
      resolverFeatures: { proxy: true, lightMode: true, youtubeEgressRequired: true },
    })).toBe(true)
  })

  test('explicit youtubeAudio feature unlocks', function() {
    expect(youtubeAudioBytesAvailableSync({
      resolverFeatures: { proxy: false, youtubeAudio: true },
    })).toBe(true)
  })
})
