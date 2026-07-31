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

jest.mock('./linkRecording', function () {
  return {
    resolveRecordingLinkAudio: jest.fn(),
    isOwnedMediaLinkUri: jest.fn(function(uri) {
      return String(uri || '').indexOf('abcbook-recording:') === 0;
    }),
  }
})

import decode from 'audio-decode'
import { fetchDirectOrProxy, isMediaProxyConfigured } from './mediaProxyClient'
import {
  fetchYoutubeAudioViaExtension,
  isYoutubeExtensionConnected,
} from './youtubeExtensionClient'
import { resolveRecordingLinkAudio } from './linkRecording'
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader'

describe('fetchAndDecodeExternalMedia extension preference', function () {
  beforeEach(function () {
    jest.clearAllMocks()
    isMediaProxyConfigured.mockReturnValue(false)
    decode.mockResolvedValue({
      duration: 12.5,
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 1,
    })
  })

  test('uses extension when connected for youtube', async function () {
    const rawBytes = new ArrayBuffer(8)
    isYoutubeExtensionConnected.mockResolvedValue(true)
    fetchYoutubeAudioViaExtension.mockResolvedValue({
      arrayBuffer: rawBytes,
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
    expect(result.arrayBuffer).toBe(rawBytes)
    expect(result.mime).toBe('audio/mp4')
  })

  test('falls back to proxy path when extension offline', async function () {
    const rawBytes = new ArrayBuffer(4)
    isYoutubeExtensionConnected.mockResolvedValue(false)
    fetchDirectOrProxy.mockResolvedValue({
      response: {
        arrayBuffer: function () {
          return Promise.resolve(rawBytes)
        },
        headers: {
          get: function (name) {
            return name === 'Content-Type' ? 'audio/mpeg' : null
          },
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
    expect(result.arrayBuffer).toBe(rawBytes)
    expect(result.mime).toBe('audio/mpeg')
  })

  test('throws extension error when helper fails and no resolver is configured', async function () {
    isYoutubeExtensionConnected.mockResolvedValue(true)
    fetchYoutubeAudioViaExtension.mockRejectedValue(
      new Error('Innertube player HTTP 403 (IOS)')
    )

    await expect(
      fetchAndDecodeExternalMedia(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'youtube',
        function () {
          return 'dQw4w9WgXcQ'
        },
        null
      )
    ).rejects.toThrow(/TuneBook Helper could not download this video/i)

    expect(fetchDirectOrProxy).not.toHaveBeenCalled()
  })

  test('falls back to proxy when extension is connected but fails', async function () {
    isMediaProxyConfigured.mockReturnValue(true)
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

  test('resolves owned recording links locally without proxy', async function () {
    const rawBytes = new ArrayBuffer(8)
    const blob = {
      type: 'audio/mpeg',
      arrayBuffer: function() { return Promise.resolve(rawBytes); },
    }
    resolveRecordingLinkAudio.mockResolvedValue({
      blob: blob,
      duration: 42,
      source: 'local',
    })

    const result = await fetchAndDecodeExternalMedia(
      'abcbook-recording:rec1',
      'recording',
      null,
      'token',
      {
        tuneId: 'tune-1',
        linkIndex: 0,
        link: { link: 'abcbook-recording:rec1', recordingId: 'rec1' },
      }
    )

    expect(resolveRecordingLinkAudio).toHaveBeenCalled()
    expect(fetchDirectOrProxy).not.toHaveBeenCalled()
    expect(result.sourceUrl).toBe('local')
    expect(result.duration).toBe(42)
  })
})
