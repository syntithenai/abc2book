import {
  getSavedWebshareProxyUrl,
  isWebshareProxyConfigured,
  normalizeProxyUrl,
  setSavedWebshareProxyUrl,
} from './webshareProxySettings'
import { isYoutubeHelperDisabled, setYoutubeHelperDisabled } from './youtubeHelperSettings'
import { youtubeAudioBytesAvailableSync } from './youtubeUnlock'
import { __resetYoutubeExtensionPingCache } from './youtubeExtensionClient'

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
    __resetYoutubeExtensionPingCache()
    document.documentElement.removeAttribute('data-tunebook-yt-helper')
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

  test('extension DOM marker unlocks sync check without resolver', function() {
    expect(youtubeAudioBytesAvailableSync({ resolverFeatures: null })).toBe(false)
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.2')
    expect(youtubeAudioBytesAvailableSync({ resolverFeatures: null })).toBe(true)
  })

  test('disabled helper ignores extension DOM marker', function() {
    document.documentElement.setAttribute('data-tunebook-yt-helper', '0.1.2')
    setYoutubeHelperDisabled(true)
    expect(youtubeAudioBytesAvailableSync({ resolverFeatures: null })).toBe(false)
  })
})
