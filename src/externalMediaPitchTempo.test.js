jest.mock('./pitchTempoShifter', function () {
  return jest.fn(function () {
    this.isConnected = function () { return false }
    this.destroy = function () {}
  })
})

jest.mock('./externalMediaAudioLoader', function () {
  return { fetchAndDecodeExternalMedia: jest.fn() }
})

jest.mock('./audioDecodeBytes', function () {
  return { decodeAudioBytes: jest.fn() }
})

jest.mock('./externalMediaAudioCache', function () {
  return {
    getCachedExternalMediaBlob: jest.fn(),
    getExternalMediaCacheKey: jest.fn(),
    putExternalMediaCache: jest.fn(),
  }
})

jest.mock('./mediaStemClient', function () {
  return { fetchStemBuffers: jest.fn(), separateStemsFromSource: jest.fn() }
})

jest.mock('./audioStemCache', function () {
  return {
    getCachedStemSet: jest.fn(),
    getStemSourceCacheKey: jest.fn(),
    saveCachedStemSet: jest.fn(),
  }
})

import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader'
import { decodeAudioBytes } from './audioDecodeBytes'
import {
  getCachedExternalMediaBlob,
  getExternalMediaCacheKey,
  putExternalMediaCache,
} from './externalMediaAudioCache'
import ExternalMediaPitchTempo from './externalMediaPitchTempo'

function makeFakeContext() {
  return { sampleRate: 44100, state: 'running' }
}

function makeFakeAudioBuffer() {
  return { duration: 12.5, sampleRate: 44100, numberOfChannels: 2, length: 551250 }
}

describe('ExternalMediaPitchTempo.load caching', function () {
  beforeEach(function () {
    // CRA jest config resets mock implementations before each test,
    // so implementations are (re)assigned here.
    getExternalMediaCacheKey.mockImplementation(function (tuneId, linkIndex, src) {
      return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src
    })
    putExternalMediaCache.mockResolvedValue(undefined)
  })

  test('network fetch writes original bytes through to the cache', async function () {
    const rawBytes = new ArrayBuffer(16)
    getCachedExternalMediaBlob.mockResolvedValue(null)
    fetchAndDecodeExternalMedia.mockResolvedValue({
      audioBuffer: makeFakeAudioBuffer(),
      duration: 12.5,
      mime: 'audio/mp4',
      arrayBuffer: rawBytes,
    })

    const processor = new ExternalMediaPitchTempo(null, null, makeFakeContext())
    const duration = await processor.load('https://youtu.be/x', 'youtube', function () { return 'x' }, {
      tuneId: 'tune-1',
      linkIndex: 0,
    })

    expect(duration).toBe(12.5)
    expect(putExternalMediaCache).toHaveBeenCalledTimes(1)
    const call = putExternalMediaCache.mock.calls[0]
    expect(call[0]).toBe('extmedia:tune-1:0:https://youtu.be/x')
    expect(call[1]).toBeInstanceOf(Blob)
    expect(call[1].type).toBe('audio/mp4')
    expect(call[2]).toBe(12.5)
    expect(call[3]).toBe('source')
  })

  test('cache hit decodes cached blob and does not rewrite the cache', async function () {
    const cachedBytes = new ArrayBuffer(8)
    getCachedExternalMediaBlob.mockResolvedValue({
      blob: {
        arrayBuffer: function () { return Promise.resolve(cachedBytes) },
      },
      duration: 12.5,
    })
    decodeAudioBytes.mockResolvedValue(makeFakeAudioBuffer())

    const ctx = makeFakeContext()
    const processor = new ExternalMediaPitchTempo(null, null, ctx)
    const duration = await processor.load('https://youtu.be/x', 'youtube', function () { return 'x' }, {
      tuneId: 'tune-1',
      linkIndex: 0,
    })

    expect(duration).toBe(12.5)
    expect(fetchAndDecodeExternalMedia).not.toHaveBeenCalled()
    expect(decodeAudioBytes).toHaveBeenCalledWith(cachedBytes, ctx)
    expect(putExternalMediaCache).not.toHaveBeenCalled()
  })

  test('no cache options skips both cache read and write', async function () {
    fetchAndDecodeExternalMedia.mockResolvedValue({
      audioBuffer: makeFakeAudioBuffer(),
      duration: 12.5,
      mime: 'audio/mp4',
      arrayBuffer: new ArrayBuffer(16),
    })

    const processor = new ExternalMediaPitchTempo(null, null, makeFakeContext())
    const duration = await processor.load('https://youtu.be/x', 'youtube', function () { return 'x' }, null)

    expect(duration).toBe(12.5)
    expect(getCachedExternalMediaBlob).not.toHaveBeenCalled()
    expect(putExternalMediaCache).not.toHaveBeenCalled()
  })
})
