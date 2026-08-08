import { createQueue } from './nowPlayingQueue'
import {
  isQueueItemPlayable,
  isQueueItemBackgroundCapable,
  advanceQueueToNextPlayable,
  findFirstPlayableQueueIndex,
  isOwnedMediaLinkLocallyAvailable,
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
})
