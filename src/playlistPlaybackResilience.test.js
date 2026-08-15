import { createQueue } from './nowPlayingQueue'
import {
  isQueueItemPlayable,
  isQueueItemFullyPlayable,
  advanceQueueToNextPlayable,
  findFirstPlayableQueueIndex,
  isOwnedMediaLinkLocallyAvailable,
  getResolverProxiedMediaPlayBlock,
  isResolverProxiedMediaPlayable,
  stopPlaylistPlayback,
} from './playlistPlaybackResilience'

jest.mock('./linkRecording', function() {
  return {
    isLinkMediaCached: jest.fn(function() { return Promise.resolve(false) }),
    isOwnedMediaLink: function(link) {
      return !!(link && (link.recordingId || (link.link && String(link.link).indexOf('abcbook-recording:') === 0)))
    },
    getRecording: jest.fn(function() { return Promise.resolve(null) }),
    parseRecordingIdFromLinkUri: function(uri) {
      if (!uri || String(uri).indexOf('abcbook-recording:') !== 0) return null
      return String(uri).slice('abcbook-recording:'.length) || null
    },
    resolveTuneLinkCacheSrc: function(tune, linkIndex) {
      if (!tune || !Array.isArray(tune.links) || !tune.links[linkIndex]) return ''
      return String(tune.links[linkIndex].link || '').trim()
    },
    isOwnedMediaLinkUri: function(uri) {
      return !!(uri && String(uri).indexOf('abcbook-recording:') === 0)
    },
    findCachedExternalMediaForLink: jest.fn(function() { return Promise.resolve(null) }),
  }
})

jest.mock('./mediaProxyClient', function() {
  return {
    requiresResolverProxiedPlayback: function(src) {
      return String(src || '').indexOf('/music-collection/') >= 0
    },
    getResolverLoginWarning: jest.fn(function() { return null }),
    getResolverProxiedPlaybackBlock: jest.fn(function() { return null }),
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: true, status: { available: true } }
    }),
    getActiveResolverAccessToken: jest.fn(function() { return '' }),
  }
})

function makeTunebook() {
  return {
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.notes)
    },
    hasLinks: function(tune) {
      return !!(tune && tune.links && tune.links.length > 0)
    },
  }
}

describe('playlistPlaybackResilience', function() {
  const tunebook = makeTunebook()
  const tunes = {
    midi: { id: 'midi', notes: 'CDEF' },
    media: { id: 'media', links: [{ link: 'https://example.com/a.mp3' }] },
    empty: { id: 'empty' },
  }

  beforeEach(function() {
    const linkRecording = require('./linkRecording')
    const mediaProxyClient = require('./mediaProxyClient')
    const healthStore = require('./mediaResolverHealthStore')
    linkRecording.isLinkMediaCached.mockReset()
    linkRecording.isLinkMediaCached.mockResolvedValue(false)
    linkRecording.getRecording.mockReset()
    linkRecording.getRecording.mockResolvedValue(null)
    mediaProxyClient.getResolverLoginWarning.mockReset()
    mediaProxyClient.getResolverLoginWarning.mockReturnValue(null)
    mediaProxyClient.getResolverProxiedPlaybackBlock.mockReset()
    mediaProxyClient.getResolverProxiedPlaybackBlock.mockReturnValue(null)
    healthStore.getMediaResolverHealthState.mockReset()
    healthStore.getMediaResolverHealthState.mockReturnValue({
      checked: true,
      available: true,
      status: { available: true },
    })
    healthStore.getActiveResolverAccessToken.mockReset()
    healthStore.getActiveResolverAccessToken.mockReturnValue('')
  })

  test('isQueueItemPlayable reflects resolvePlaybackForItem', function() {
    expect(isQueueItemPlayable(tunes.midi, { tuneId: 'midi' }, tunebook)).toBe(true)
    expect(isQueueItemPlayable(tunes.media, { tuneId: 'media' }, tunebook)).toBe(true)
    expect(isQueueItemPlayable(tunes.empty, { tuneId: 'empty' }, tunebook)).toBe(false)
  })

  test('findFirstPlayableQueueIndex skips empty tunes', function() {
    const queue = createQueue({ tuneIds: ['empty', 'midi', 'media'] })
    expect(findFirstPlayableQueueIndex(queue, tunes, tunebook)).toBe(1)
  })

  test('advanceQueueToNextPlayable skips unplayable items online', async function() {
    const queue = createQueue({
      tuneIds: ['midi', 'empty', 'media'],
      currentIndex: 0,
    })
    const result = await advanceQueueToNextPlayable(queue, tunes, tunebook, { direction: 1 })
    expect(result.atEnd).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.tune.id).toBe('media')
    expect(result.queue.currentIndex).toBe(2)
  })

  test('advanceQueueToNextPlayable skips owned media with missing local recording', async function() {
    const linkRecording = require('./linkRecording')
    linkRecording.getRecording.mockResolvedValueOnce(null)
    const owned = {
      id: 'owned',
      links: [{ link: 'abcbook-recording:missing', recordingId: 'missing' }],
    }
    const playable = {
      id: 'playable',
      links: [{ link: 'https://example.com/a.mp3' }],
    }
    const ownedTunes = { owned: owned, playable: playable }
    const queue = createQueue({
      tuneIds: ['owned', 'playable'],
      currentIndex: 0,
    })
    const result = await advanceQueueToNextPlayable(queue, ownedTunes, tunebook, {
      direction: 1,
      advanceFirst: false,
    })
    expect(result.atEnd).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.tune.id).toBe('playable')
  })

  test('isOwnedMediaLinkLocallyAvailable allows drive-backed links without local data', async function() {
    const tune = {
      id: 'owned',
      links: [{ link: 'abcbook-recording:missing', recordingId: 'missing', googleId: 'drive123' }],
    }
    await expect(isOwnedMediaLinkLocallyAvailable(tune, 0)).resolves.toBe(true)
  })

  test('advanceQueueToNextPlayable can validate current item without advancing', async function() {
    const queue = createQueue({ tuneIds: ['midi', 'empty'], currentIndex: 0 })
    const result = await advanceQueueToNextPlayable(queue, tunes, tunebook, {
      direction: 1,
      advanceFirst: false,
    })
    expect(result.atEnd).toBe(false)
    expect(result.tune.id).toBe('midi')
  })

  test('advanceQueueToNextPlayable returns atEnd when nothing playable', async function() {
    const queue = createQueue({ tuneIds: ['empty'], currentIndex: 0 })
    const result = await advanceQueueToNextPlayable(queue, tunes, tunebook, { direction: 1 })
    expect(result.atEnd).toBe(true)
    expect(result.tune).toBeNull()
  })

  test('isResolverProxiedMediaPlayable allows cached library links without login', async function() {
    const linkRecording = require('./linkRecording')
    const mediaProxyClient = require('./mediaProxyClient')
    linkRecording.isLinkMediaCached.mockResolvedValue(true)
    mediaProxyClient.getResolverLoginWarning.mockReturnValue({
      message: 'need login',
      showLoginButton: true,
    })
    const tune = {
      id: 'lib',
      links: [{ link: 'https://resolver.example/music-collection/a.mp3' }],
    }
    await expect(isResolverProxiedMediaPlayable(tune, 0)).resolves.toBe(true)
    await expect(getResolverProxiedMediaPlayBlock(tune, 0)).resolves.toBeNull()
  })

  test('isResolverProxiedMediaPlayable blocks uncached library links when login required', async function() {
    const mediaProxyClient = require('./mediaProxyClient')
    mediaProxyClient.getResolverLoginWarning.mockReturnValue({
      message: 'need login',
      showLoginButton: true,
    })
    const tune = {
      id: 'lib',
      links: [{ link: 'https://resolver.example/music-collection/a.mp3' }],
    }
    await expect(isResolverProxiedMediaPlayable(tune, 0, {
      resolverStatus: { available: false },
      accessToken: null,
    })).resolves.toBe(false)
    const block = await getResolverProxiedMediaPlayBlock(tune, 0, {
      resolverStatus: { available: false },
      accessToken: null,
    })
    expect(block).toEqual(expect.objectContaining({
      kind: 'login',
      message: 'need login',
    }))
  })

  test('advanceQueueToNextPlayable skips uncached library links when logged out', async function() {
    const mediaProxyClient = require('./mediaProxyClient')
    mediaProxyClient.getResolverLoginWarning.mockReturnValue({
      message: 'Shared resolver providers need a Google login.',
      showLoginButton: true,
    })
    const library = {
      id: 'library',
      links: [{ link: 'https://resolver.example/music-collection/uncached.mp3' }],
    }
    const cachedDirect = {
      id: 'cached',
      links: [{ link: 'https://example.com/cached.mp3' }],
    }
    const mix = { library: library, cached: cachedDirect }
    const queue = createQueue({
      tuneIds: ['library', 'cached'],
      currentIndex: 0,
    })
    const result = await advanceQueueToNextPlayable(queue, mix, tunebook, {
      direction: 1,
      advanceFirst: false,
      resolverStatus: { available: false },
      accessToken: null,
    })
    expect(result.atEnd).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.tune.id).toBe('cached')
  })

  test('advanceQueueToNextPlayable skips uncached when logged out before health probe settles', async function() {
    const linkRecording = require('./linkRecording')
    const healthStore = require('./mediaResolverHealthStore')
    healthStore.getMediaResolverHealthState.mockReturnValue({
      checked: false,
      available: false,
      status: null,
    })
    healthStore.getActiveResolverAccessToken.mockReturnValue('stale-token')
    linkRecording.isLinkMediaCached.mockImplementation(function(tune) {
      return Promise.resolve(!!(tune && tune.id === 'cached'))
    })
    const uncached = {
      id: 'uncached',
      links: [{ link: 'https://resolver.example/music-collection/uncached.mp3' }],
    }
    const cached = {
      id: 'cached',
      links: [{ link: 'https://resolver.example/music-collection/cached.mp3' }],
    }
    const mix = { uncached: uncached, cached: cached }
    const queue = createQueue({
      tuneIds: ['uncached', 'cached'],
      currentIndex: 0,
    })
    const result = await advanceQueueToNextPlayable(queue, mix, tunebook, {
      direction: 1,
      advanceFirst: false,
      // Explicit null must win over the stale health-store token.
      accessToken: null,
    })
    expect(result.atEnd).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.tune.id).toBe('cached')
  })

  test('stopPlaylistPlayback clears controller playback state', function() {
    const calls = []
    const mediaController = {
      abortPlayingIntent: function() { calls.push('abort') },
      pause: function() { calls.push('pause') },
      setIsLoading: function(v) { calls.push('loading:' + v) },
      setIsPlaying: function(v) { calls.push('playing:' + v) },
      setIsReady: function(v) { calls.push('ready:' + v) },
    }
    stopPlaylistPlayback(mediaController)
    expect(calls).toEqual(['abort', 'pause', 'loading:false', 'playing:false', 'ready:false'])
  })

  test('advanceQueueToNextPlayable skips uncached external items when offline', async function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      const queue = {
        id: 'q',
        items: [
          { externalMedia: { youtubeId: 'abc123' } },
          { tuneId: 'midi' },
        ],
        currentIndex: 0,
      }
      const result = await advanceQueueToNextPlayable(queue, tunes, tunebook, {
        direction: 1,
        advanceFirst: false,
      })
      expect(result.atEnd).toBe(false)
      expect(result.tune.id).toBe('midi')
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })

  test('isQueueItemFullyPlayable allows owned recording when cache reports ready offline', async function() {
    const originalOnLine = navigator.onLine
    const linkRecording = require('./linkRecording')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    linkRecording.isLinkMediaCached.mockResolvedValue(true)
    try {
      const owned = {
        id: 'owned',
        links: [{ link: 'abcbook-recording:rec1', recordingId: 'rec1' }],
      }
      await expect(isQueueItemFullyPlayable(owned, { tuneId: 'owned' }, tunebook, {})).resolves.toBe(true)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
