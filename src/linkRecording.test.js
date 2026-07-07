jest.mock('localforage', function() {
  const stores = {}
  function createInstance(opts) {
    const name = opts && opts.name ? opts.name : 'default'
    if (!stores[name]) stores[name] = {}
    return {
      setItem: jest.fn(function(key, value) {
        stores[name][key] = value
        return Promise.resolve(value)
      }),
      getItem: jest.fn(function(key) {
        return Promise.resolve(stores[name][key] || null)
      }),
      iterate: jest.fn(function(callback) {
        const entries = stores[name] || {}
        return Promise.all(Object.keys(entries).map(function(key) {
          return callback(entries[key], key)
        }))
      }),
      clear: jest.fn(function() {
        stores[name] = {}
        return Promise.resolve()
      }),
      _data: stores[name],
    }
  }
  return { createInstance: createInstance, __stores: stores }
})

jest.mock('audio-decode', function() {
  const decode = jest.fn(function() {
    return Promise.resolve({
      duration: 2.5,
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100,
      getChannelData: function() {
        return new Float32Array(100)
      },
    })
  })
  return { __esModule: true, default: decode }
})

jest.mock('./MP3Converter', function() {
  function MP3ConverterMock() {
    this.convertAudioBuffer = jest.fn(function() {
      if (typeof Blob !== 'undefined') {
        return Promise.resolve(new Blob(['mp3'], { type: 'audio/mpeg' }))
      }
      return Promise.resolve({ type: 'audio/mpeg', size: 4 })
    })
  }
  return MP3ConverterMock
})

jest.mock('./externalMediaAudioCache', function() {
  const cache = {}
  return {
    getExternalMediaCacheKey: function(tuneId, linkIndex, src) {
      return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src
    },
    getCachedExternalMediaBlob: jest.fn(function(key) {
      return Promise.resolve(cache[key] || null)
    }),
    putExternalMediaCache: jest.fn(function(key, blob, duration) {
      cache[key] = { blob: blob, duration: duration }
      return Promise.resolve()
    }),
    isExternalMediaCached: jest.fn(function(tuneId, linkIndex, src) {
      const key = 'extmedia:' + tuneId + ':' + linkIndex + ':' + src
      return Promise.resolve(!!(cache[key] && cache[key].blob))
    }),
    __cache: cache,
  }
})

jest.mock('./mediaProxyClient', function() {
  const actual = jest.requireActual('./mediaProxyClient')
  return Object.assign({}, actual, {
    isMediaProxyConfigured: jest.fn(function() { return false }),
    fetchViaMediaProxy: jest.fn(function() {
      return Promise.reject(new Error('Media proxy not configured'))
    }),
  })
})

import localforage from 'localforage'
import * as mediaProxyClient from './mediaProxyClient'
import useAbcTools from './useAbcTools'
import * as externalMediaAudioCache from './externalMediaAudioCache'
import {
  RECORDING_LINK_PREFIX,
  isOwnedMediaLinkUri,
  parseRecordingIdFromLinkUri,
  buildRecordingLinkUri,
  isOwnedMediaLink,
  getOwnedMediaSyncStatus,
  getTuneOwnedMediaDriveSummary,
  uploadOwnedMediaLinksForTune,
  resolveRecordingLinkAudio,
  uploadRecordingToDrive,
  patchTunesWithRecordingUpload,
} from './linkRecording'

describe('linkRecording helpers', function() {
  test('detects owned media URIs', function() {
    expect(isOwnedMediaLinkUri('abcbook-recording:abc123')).toBe(true)
    expect(isOwnedMediaLinkUri('https://example.com/a.mp3')).toBe(false)
    expect(parseRecordingIdFromLinkUri('abcbook-recording:abc123')).toBe('abc123')
    expect(buildRecordingLinkUri('abc123')).toBe(RECORDING_LINK_PREFIX + 'abc123')
  })

  test('reports sync status from link metadata', function() {
    const owned = { link: 'abcbook-recording:x' }
    expect(getOwnedMediaSyncStatus(Object.assign({}, owned, { googleId: 'g1' }))).toBe('synced')
    expect(getOwnedMediaSyncStatus(Object.assign({}, owned, { uploadPending: true }))).toBe('pending')
    expect(getOwnedMediaSyncStatus(owned)).toBe('local')
    expect(isOwnedMediaLink({ link: 'abcbook-recording:x' })).toBe(true)
  })

  test('summarizes owned media drive status for a tune', function() {
    expect(getTuneOwnedMediaDriveSummary(null)).toBeNull()
    expect(getTuneOwnedMediaDriveSummary({ links: [{ link: 'https://example.com/a.mp3' }] })).toBeNull()

    const synced = getTuneOwnedMediaDriveSummary({
      links: [{ link: 'abcbook-recording:a', googleId: 'g1' }],
    })
    expect(synced.status).toBe('synced')
    expect(synced.uploadable).toBe(0)

    const mixed = getTuneOwnedMediaDriveSummary({
      links: [
        { link: 'abcbook-recording:a', googleId: 'g1' },
        { link: 'abcbook-recording:b' },
      ],
    })
    expect(mixed.status).toBe('partial')
    expect(mixed.uploadable).toBe(1)
  })

  test('uploadOwnedMediaLinksForTune requires login', async function() {
    const result = await uploadOwnedMediaLinksForTune({
      id: 't1',
      links: [{ link: 'abcbook-recording:r1', recordingId: 'r1' }],
    }, {})
    expect(result.uploaded).toBe(0)
    expect(result.errors[0]).toMatch(/log in/i)
  })

  test('patchTunesWithRecordingUpload updates matching links', function() {
    const tunes = {
      t1: {
        id: 't1',
        links: [{ link: 'abcbook-recording:r1', recordingId: 'r1', title: 'Rec' }],
      },
      t2: {
        id: 't2',
        links: [{ link: 'https://example.com/a.mp3', title: 'Other' }],
      },
    }
    const updated = patchTunesWithRecordingUpload(tunes, 'r1', 'drive-file-1')
    expect(updated).toHaveLength(1)
    expect(updated[0].links[0].googleId).toBe('drive-file-1')
    expect(updated[0].links[0].uploadPending).toBe(false)
  })
})

describe('linkRecording ABC round-trip', function() {
  test('serializes recordingId and googleId on links', function() {
    const abcTools = useAbcTools()
    const tune = {
      id: 't1',
      name: 'Test Tune',
      links: [{
        title: 'My Recording',
        link: 'abcbook-recording:rec1',
        recordingId: 'rec1',
        googleId: 'gid123',
        startAt: '1',
        endAt: '30',
      }],
    }
    const abc = abcTools.json2abc(tune)
    expect(abc).toContain('% abcbook-link-recording-id-0 rec1')
    expect(abc).toContain('% abcbook-link-google-id-0 gid123')
    expect(abc).toContain('% abcbook-link-0 abcbook-recording:rec1')

    const parsed = abcTools.abc2json(abc)
    expect(parsed.links[0].recordingId).toBe('rec1')
    expect(parsed.links[0].googleId).toBe('gid123')
    expect(parsed.links[0].link).toBe('abcbook-recording:rec1')
  })
})

describe('linkRecording create and resolve', function() {
  beforeEach(function() {
    mediaProxyClient.isMediaProxyConfigured.mockReturnValue(false)
    mediaProxyClient.fetchViaMediaProxy.mockReset()
    mediaProxyClient.fetchViaMediaProxy.mockRejectedValue(new Error('Media proxy not configured'))
    Object.keys(externalMediaAudioCache.__cache).forEach(function(key) {
      delete externalMediaAudioCache.__cache[key]
    })
    const stores = localforage.__stores || {}
    Object.keys(stores).forEach(function(name) {
      stores[name] = {}
    })
  })

  test('resolveRecordingLinkAudio falls back to Drive', async function() {
    const tuneId = 't1'
    const linkIndex = 0
    const link = {
      link: 'abcbook-recording:rec-drive',
      recordingId: 'rec-drive',
      googleId: 'drive123',
      title: 'Remote',
    }
    const mp3 = { type: 'audio/mpeg' }
    const driveApi = {
      getDocumentBlob: jest.fn(function() {
        return Promise.resolve(mp3)
      }),
      getPublicDocumentBlob: jest.fn(function() {
        return Promise.resolve({ error: 'not needed' })
      }),
    }

    const resolved = await resolveRecordingLinkAudio(link, tuneId, linkIndex, {
      accessToken: 'token',
      driveApi: driveApi,
      forPlayback: true,
    })
    expect(driveApi.getDocumentBlob).toHaveBeenCalledWith('drive123', 'token')
    expect(resolved.source).toBe('drive')
    expect(resolved.blob).toBe(mp3)
  })

  test('resolveRecordingLinkAudio falls back to public Drive blob', async function() {
    const mp3 = { type: 'audio/mpeg' }
    const driveApi = {
      getDocumentBlob: jest.fn(function() {
        return Promise.resolve({ error: 'denied' })
      }),
      getPublicDocumentBlob: jest.fn(function() {
        return Promise.resolve(mp3)
      }),
    }

    const resolved = await resolveRecordingLinkAudio({
      link: 'abcbook-recording:rec-public',
      recordingId: 'rec-public',
      googleId: 'drive-public',
      title: 'Shared',
    }, 't1', 0, {
      driveApi: driveApi,
      forPlayback: true,
    })
    expect(driveApi.getPublicDocumentBlob).toHaveBeenCalledWith('drive-public')
    expect(resolved.source).toBe('public')
    expect(resolved.blob).toBe(mp3)
  })

  test('resolveRecordingLinkAudio falls back to local resolver proxy', async function() {
    const mp3 = { type: 'audio/mpeg' }
    const driveApi = {
      getDocumentBlob: jest.fn(function() {
        return Promise.resolve({ error: 'denied' })
      }),
      getPublicDocumentBlob: jest.fn(function() {
        return Promise.resolve({ error: 'cors blocked' })
      }),
    }
    mediaProxyClient.isMediaProxyConfigured.mockReturnValue(true)
    mediaProxyClient.fetchViaMediaProxy.mockResolvedValue({
      blob: jest.fn(function() { return Promise.resolve(mp3) }),
    })

    const resolved = await resolveRecordingLinkAudio({
      link: 'abcbook-recording:rec-proxy',
      recordingId: 'rec-proxy',
      googleId: 'drive-proxy',
      title: 'Shared via proxy',
    }, 't1', 0, {
      accessToken: 'token',
      driveApi: driveApi,
      forPlayback: true,
    })

    expect(mediaProxyClient.fetchViaMediaProxy).toHaveBeenCalledWith(
      '/proxy-audio?url=' + encodeURIComponent('https://drive.google.com/u/0/uc?id=drive-proxy&export=download'),
      'token'
    )
    expect(resolved.source).toBe('proxy')
    expect(resolved.blob).toBe(mp3)
  })

  test('uploadRecordingToDrive uploads mp3 blob', async function() {
    const driveApi = {
      findTuneBookFolderInDrive: jest.fn(function() { return Promise.resolve('folder1') }),
      findOrCreateRecordingsFolderInDrive: jest.fn(function() { return Promise.resolve('rec-folder') }),
      createDocument: jest.fn(function() { return Promise.resolve('new-drive-id') }),
      getDocumentMeta: jest.fn(function() { return Promise.resolve({ modifiedTime: '2020-01-01' }) }),
    }
    const result = await uploadRecordingToDrive({
      recording: {
        id: 'r1',
        tuneName: 'Tune',
        name: 'Rec',
        mp3Blob: { type: 'audio/mpeg', size: 4 },
      },
      token: { access_token: 'tok' },
      driveApi: driveApi,
    })
    expect(result.googleId).toBe('new-drive-id')
    expect(driveApi.createDocument).toHaveBeenCalled()
  })
})
