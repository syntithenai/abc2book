jest.mock('./mediaAudioTrim', function() {
  return {
    getLinkTrimBounds: jest.fn(function() { return { startSec: 0, endSec: 0 } }),
    trimAudioBuffer: jest.fn(function(buffer) { return buffer }),
  }
})

jest.mock('./externalMediaAudioCache', function() {
  return {
    getExternalMediaMp3Blob: jest.fn(),
  }
})

jest.mock('./nativeFilteredMedia', function() {
  return {
    loadStemBuffersForSource: jest.fn(),
    mixStemBuffersOffline: jest.fn(),
  }
})

jest.mock('./offerBlobDownload', function() {
  return {
    offerBlobDownload: jest.fn(function() { return Promise.resolve({ delivered: false, method: 'toast' }) }),
  }
})

jest.mock('./processedMediaExport', function() {
  return {
    applyPlaybackSettingsOffline: jest.fn(function(buffer) { return Promise.resolve(buffer) }),
  }
})

jest.mock('./tuneDownloadActions', function() {
  return {
    downloadBlob: jest.fn(function() { return Promise.resolve() }),
    sanitizeDownloadFilename: jest.fn(function(name, fallback) { return name || fallback }),
  }
})

jest.mock('./audioCompressEncode', function() {
  return {
    encodeAudioBuffer: jest.fn(function(buffer, format) {
      return Promise.resolve({
        blob: new Blob(['encoded'], { type: 'audio/mpeg' }),
        format: format || 'aac',
      })
    }),
  }
})

jest.mock('./audioDecodeBytes', function() {
  return {
    decodeAudioBytes: jest.fn(),
  }
})

import { getExternalMediaMp3Blob } from './externalMediaAudioCache'
import { loadStemBuffersForSource, mixStemBuffersOffline } from './nativeFilteredMedia'
import { offerBlobDownload } from './offerBlobDownload'
import { buildTuneMediaExportBlob, downloadTuneMediaExport } from './mediaExportUtils'

function makeTune() {
  return {
    id: 't1',
    name: 'Test Tune',
    links: [{ link: 'https://youtube.com/watch?v=abcdefghijk', title: 'YouTube' }],
    playbackTempo: 1,
    playbackPitch: 0,
    playbackFineTune: 0,
    playbackAudioFilters: {
      percussion: 1,
      vocals: 1,
      bass: 1,
      guitar: 1,
      piano: 1,
      other: 1,
    },
  }
}

function makeBuffer() {
  return {
    duration: 12,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: 44100,
    getChannelData: function() { return new Float32Array(44100) },
  }
}

describe('mediaExportUtils', function() {
  beforeEach(function() {
    getExternalMediaMp3Blob.mockReset()
    loadStemBuffersForSource.mockReset()
    mixStemBuffersOffline.mockReset()
    offerBlobDownload.mockReset()
    offerBlobDownload.mockResolvedValue({ delivered: false, method: 'toast' })
    const { encodeAudioBuffer } = require('./audioCompressEncode')
    encodeAudioBuffer.mockResolvedValue({
      blob: new Blob(['encoded'], { type: 'audio/mpeg' }),
      format: 'aac',
    })
    const { applyPlaybackSettingsOffline } = require('./processedMediaExport')
    applyPlaybackSettingsOffline.mockImplementation(function(buffer) {
      return Promise.resolve(buffer)
    })
  })

  test('preferStemMix uses cached stems without fetching linked audio', async function() {
    const mixed = makeBuffer()
    loadStemBuffersForSource.mockResolvedValue({
      stemBuffers: { drums: mixed },
      fromCache: true,
    })
    mixStemBuffersOffline.mockReturnValue(mixed)

    const result = await buildTuneMediaExportBlob({
      tune: makeTune(),
      linkIndex: 0,
      srcType: 'youtube',
      preferStemMix: true,
      trim: false,
      allowNetworkSeparation: true,
      audioFormat: 'aac',
      youtubeGetId: function() { return 'abcdefghijk' },
      accessToken: 'token',
      settings: {
        tempo: 1,
        pitch: 0,
        fineTune: 0,
        audioFilters: {
          percussion: 1,
          vocals: 0.5,
          bass: 1,
          guitar: 1,
          piano: 1,
          other: 1,
        },
      },
    })

    expect(loadStemBuffersForSource).toHaveBeenCalledWith(
      expect.objectContaining({ tuneId: 't1', srcType: 'youtube' }),
      expect.objectContaining({ allowNetworkSeparation: true })
    )
    expect(getExternalMediaMp3Blob).not.toHaveBeenCalled()
    expect(result.blob).toBeInstanceOf(Blob)
  })

  test('downloadTuneMediaExport awaits blob download', async function() {
    getExternalMediaMp3Blob.mockResolvedValue({
      blob: new Blob(['cached'], { type: 'audio/mpeg' }),
      duration: 10,
      audioFormat: 'aac',
      cached: true,
    })

    await downloadTuneMediaExport({
      tune: makeTune(),
      linkIndex: 0,
      srcType: 'youtube',
      filename: 'test.m4a',
      trim: false,
      youtubeGetId: function() { return 'abcdefghijk' },
      settings: {
        tempo: 1,
        pitch: 0,
        fineTune: 0,
        audioFilters: {
          percussion: 1,
          vocals: 1,
          bass: 1,
          guitar: 1,
          piano: 1,
          other: 1,
        },
      },
    })

    expect(offerBlobDownload).toHaveBeenCalledWith(expect.any(Blob), 'test.m4a', { tryImmediate: false })
  })
})
