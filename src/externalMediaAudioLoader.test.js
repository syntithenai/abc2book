jest.mock('audio-decode', function () {
  return jest.fn(function () {
    return Promise.resolve({
      duration: 12.5,
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 1,
    })
  })
})

jest.mock('./mediaProxyClient', function () {
  return {
    fetchDirectOrProxy: jest.fn(),
    isMediaProxyConfigured: jest.fn(function () {
      return false
    }),
  }
})

jest.mock('./youtubeExtensionClient', function () {
  return {
    isYoutubeExtensionConnected: jest.fn(),
    fetchYoutubeAudioViaExtension: jest.fn(),
  }
})

import decode from 'audio-decode'
import { fetchDirectOrProxy } from './mediaProxyClient'
import {
  fetchYoutubeAudioViaExtension,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient'
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader'

describe('fetchAndDecodeExternalMedia extension preference', function () {
  beforeEach(function () {
    jest.clearAllMocks()
    decode.mockResolvedValue({
      duration: 12.5,
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 1,
    })
  })

  test('uses extension when connected for youtube', async function () {
    isYoutubeExtensionConnected.mockResolvedValue(true)
    fetchYoutubeAudioViaExtension.mockResolvedValue({
      arrayBuffer: new ArrayBuffer(8),
      mime: 'audio/mp4',
      title: 'Song',
      via: 'extension',
    })

    const result = await fetchAndDecodeExternalMedia(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      function () {
        return 'dQw4w9WgXcQ'
      },
      null
    )

    expect(fetchYoutubeAudioViaExtension).toHaveBeenCalledWith('dQw4w9WgXcQ')
    expect(fetchDirectOrProxy).not.toHaveBeenCalled()
    expect(decode).toHaveBeenCalled()
    expect(result.sourceUrl).toBe('extension')
    expect(result.duration).toBe(12.5)
  })

  test('falls back to proxy path when extension offline', async function () {
    isYoutubeExtensionConnected.mockResolvedValue(false)
    fetchDirectOrProxy.mockResolvedValue({
      response: {
        arrayBuffer: function () {
          return Promise.resolve(new ArrayBuffer(4))
        },
      },
      viaProxy: true,
    })

    const result = await fetchAndDecodeExternalMedia(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      function () {
        return 'dQw4w9WgXcQ'
      },
      'token'
    )

    expect(fetchYoutubeAudioViaExtension).not.toHaveBeenCalled()
    expect(fetchDirectOrProxy).toHaveBeenCalled()
    expect(result.sourceUrl).toBe('proxy')
  })

  test('falls back to proxy when extension is connected but fails', async function () {
    isYoutubeExtensionConnected.mockResolvedValue(true)
    fetchYoutubeAudioViaExtension.mockRejectedValue(
      new Error('Innertube player HTTP 403 (IOS)')
    )
    fetchDirectOrProxy.mockResolvedValue({
      response: {
        arrayBuffer: function () {
          return Promise.resolve(new ArrayBuffer(4))
        },
      },
      viaProxy: true,
    })

    const result = await fetchAndDecodeExternalMedia(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      function () {
        return 'dQw4w9WgXcQ'
      },
      'token'
    )

    expect(fetchYoutubeAudioViaExtension).toHaveBeenCalled()
    expect(fetchDirectOrProxy).toHaveBeenCalled()
    expect(result.sourceUrl).toBe('proxy')
  })
})
