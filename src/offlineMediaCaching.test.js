import {
  loadOfflineMediaSettings,
  saveOfflineMediaSettings,
  DEFAULT_OFFLINE_MEDIA_SETTINGS,
} from './offlineMediaSettings'
import {
  getLinkSrcType,
  resolveActiveLinkForTune,
  countCacheableLinks,
} from './mediaLinkResolve'
import { trimAudioBuffer } from './mediaAudioTrim'

function isYoutubeLink(url) {
  return /youtu\.?be/.test(url)
}

describe('offlineMediaSettings', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('loads defaults when unset', function() {
    expect(loadOfflineMediaSettings()).toEqual(DEFAULT_OFFLINE_MEDIA_SETTINGS)
  })

  test('persists toggles and ties prefetch to autocache', function() {
    saveOfflineMediaSettings({ autocacheOnPlay: true })
    expect(loadOfflineMediaSettings()).toEqual({
      autocacheOnPlay: true,
      prefetchNextTrack: true,
    })
    saveOfflineMediaSettings({ autocacheOnPlay: false })
    expect(loadOfflineMediaSettings()).toEqual({
      autocacheOnPlay: false,
      prefetchNextTrack: false,
    })
  })
})

describe('mediaLinkResolve', function() {
  test('classifies youtube, audio, inline, and recording links', function() {
    expect(getLinkSrcType('https://example.com/a.mp3', isYoutubeLink)).toBe('audio')
    expect(getLinkSrcType('https://www.youtube.com/watch?v=abcdefghijk', isYoutubeLink)).toBe('youtube')
    expect(getLinkSrcType('data:audio/mp3;base64,abc', isYoutubeLink)).toBe('inline')
    expect(getLinkSrcType('abcbook-recording:rec1', isYoutubeLink)).toBe('recording')
  })

  test('resolveActiveLinkForTune prefers route link when cacheable', function() {
    const tune = {
      id: 't1',
      links: [
        { link: 'https://example.com/a.mp3', title: 'A' },
        { link: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'B' },
      ],
    }
    const resolved = resolveActiveLinkForTune(tune, 1, isYoutubeLink)
    expect(resolved).toEqual({
      linkIndex: 1,
      src: 'https://www.youtube.com/watch?v=abcdefghijk',
      srcType: 'youtube',
      linkTitle: 'B',
    })
  })

  test('resolveActiveLinkForTune falls back to first audio then youtube', function() {
    const tune = {
      id: 't1',
      links: [
        { link: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Y' },
        { link: 'https://example.com/a.mp3', title: 'A' },
      ],
    }
    expect(resolveActiveLinkForTune(tune, null, isYoutubeLink).linkIndex).toBe(1)
    const youtubeOnly = {
      id: 't2',
      links: [{ link: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Y' }],
    }
    expect(resolveActiveLinkForTune(youtubeOnly, null, isYoutubeLink).srcType).toBe('youtube')
  })

  test('countCacheableLinks counts tunes with at least one cacheable link', function() {
    const tunes = [
      { id: '1', links: [{ link: 'https://example.com/a.mp3' }] },
      { id: '2', links: [{ link: '' }] },
    ]
    expect(countCacheableLinks(tunes, isYoutubeLink)).toBe(1)
  })
})

describe('trimAudioBuffer', function() {
  beforeAll(function() {
    if (typeof global.AudioBuffer === 'undefined') {
      global.AudioBuffer = class MockAudioBuffer {
        constructor(opts) {
          this.length = opts.length
          this.numberOfChannels = opts.numberOfChannels
          this.sampleRate = opts.sampleRate
          this._channels = []
          for (let i = 0; i < opts.numberOfChannels; i += 1) {
            this._channels.push(new Float32Array(opts.length))
          }
        }
        getChannelData(ch) {
          return this._channels[ch]
        }
      }
    }
  })

  test('trims to start and end seconds', function() {
    const buffer = {
      sampleRate: 10,
      duration: 2,
      length: 20,
      numberOfChannels: 1,
      getChannelData: function() {
        return new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
      },
    }
    const trimmed = trimAudioBuffer(buffer, 0.5, 1.5)
    expect(trimmed.length).toBe(10)
    expect(trimmed.getChannelData(0)[0]).toBe(5)
    expect(trimmed.getChannelData(0)[9]).toBe(14)
  })
})
