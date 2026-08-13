import { queueResolvedCandidates } from './artistDiscographyQueue'
import { createQueue } from './nowPlayingQueue'
import { playQueueItem, navigateToQueueTune } from './nowPlayingQueuePlayback'

jest.mock('./nowPlayingQueuePlayback', function() {
  return {
    playQueueItem: jest.fn(function() { return true }),
    navigateToQueueTune: jest.fn(),
  }
})

describe('artistDiscographyQueue', function() {
  beforeEach(function() {
    playQueueItem.mockReset()
    playQueueItem.mockReturnValue(true)
    navigateToQueueTune.mockReset()
  })

  function buildTunebook(tunes) {
    return {
      tunes: tunes,
      createTune: jest.fn(function(tune) {
        return Object.assign({}, tune, { id: tune.id || 'generated-' + Object.keys(tunes).length })
      }),
      saveTune: jest.fn(function(tune, skipTimestampUpdate, options) {
        const saved = Object.assign({}, tune)
        tunes[saved.id] = saved
        return saved
      }),
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
    }
  }

  test('queueResolvedCandidates dedupes candidates and materializes all tunes', async function() {
    const tunes = {}
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    const duplicate = {
      source: 'music-collection',
      id: '1',
      title: 'Track 1',
      artist: 'Altan',
      path: 'a.mp3',
      link: '/music-collection/a.mp3',
    }
    await queueResolvedCandidates([duplicate, duplicate, {
      source: 'music-collection',
      id: '2',
      title: 'Track 2',
      artist: 'Altan',
      path: 'b.mp3',
      link: '/music-collection/b.mp3',
    }], {
      tunebook: tunebook,
      tunes: tunes,
      setNowPlayingQueue: setNowPlayingQueue,
      nowPlayingQueue: null,
      materializeOptions: { tunes: tunes },
    }, { mode: 'append' })

    expect(tunebook.saveTune).toHaveBeenCalledTimes(2)
    expect(tunebook.commitTunesBatch).toHaveBeenCalledTimes(1)
    expect(Object.keys(tunes).length).toBe(2)
    expect(setNowPlayingQueue).toHaveBeenCalled()
    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items).toHaveLength(2)
  })

  test('queueResolvedCandidates play mode creates fresh queue and starts playback', async function() {
    const tunes = {}
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    const setCurrentTune = jest.fn()
    const mediaController = {}
    const navigate = jest.fn()
    await queueResolvedCandidates([{
      source: 'music-collection',
      id: '1',
      title: 'Track 1',
      artist: 'Altan',
      path: 'a.mp3',
      link: '/music-collection/a.mp3',
    }], {
      tunebook: tunebook,
      tunes: tunes,
      mediaController: mediaController,
      setNowPlayingQueue: setNowPlayingQueue,
      setCurrentTune: setCurrentTune,
      nowPlayingQueue: createQueue({ tuneIds: ['old'], source: 'manual' }),
      navigate: navigate,
      location: { pathname: '/tunes' },
      materializeOptions: { tunes: tunes },
    }, { mode: 'play' })

    expect(setNowPlayingQueue).toHaveBeenCalled()
    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items).toHaveLength(1)
    expect(playQueueItem).toHaveBeenCalledWith(
      mediaController,
      tunebook,
      expect.objectContaining({ id: queue.items[0].tuneId }),
      queue.items[0],
      { deferPlaybackEngine: true }
    )
    expect(navigateToQueueTune).toHaveBeenCalledWith(
      navigate,
      queue.items[0].tuneId,
      queue.items[0],
      tunebook,
      expect.any(Object)
    )
    expect(setCurrentTune).toHaveBeenCalledWith(queue.items[0].tuneId)
  })

  test('queueResolvedCandidates reuses existing tunes via lookup', async function() {
    const tunes = {
      t1: {
        id: 't1',
        name: 'Track 1',
        links: [{ link: '/music-collection/a.mp3', collectionEntryId: '1' }],
      },
    }
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    await queueResolvedCandidates([{
      source: 'music-collection',
      id: '1',
      title: 'Track 1',
      artist: 'Altan',
      path: 'a.mp3',
      link: '/music-collection/a.mp3',
    }], {
      tunebook: tunebook,
      tunes: tunes,
      setNowPlayingQueue: setNowPlayingQueue,
      nowPlayingQueue: null,
      materializeOptions: { tunes: tunes },
    }, { mode: 'append' })

    expect(tunebook.saveTune).not.toHaveBeenCalled()
    expect(tunebook.commitTunesBatch).not.toHaveBeenCalled()
    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items[0].tuneId).toBe('t1')
  })

  test('queueResolvedCandidates dedupes same file with different collection ids', async function() {
    const tunes = {}
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    await queueResolvedCandidates([
      {
        source: 'music-collection',
        id: '1',
        title: 'Track 1',
        artist: 'Metallica',
        path: 'Metallica/song.mp3',
        link: '/music-collection/Metallica/song.mp3',
      },
      {
        source: 'music-collection',
        id: '2',
        title: 'Track 1',
        artist: 'Metallica',
        path: 'Metallica/song.mp3',
        link: 'http://localhost/music-collection/Metallica/song.mp3',
      },
    ], {
      tunebook: tunebook,
      tunes: tunes,
      setNowPlayingQueue: setNowPlayingQueue,
      nowPlayingQueue: null,
      materializeOptions: { tunes: tunes },
    }, { mode: 'append' })

    expect(tunebook.saveTune).toHaveBeenCalledTimes(1)
    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items).toHaveLength(1)
  })

  test('queueResolvedCandidates dedupes same artist/title on different paths', async function() {
    const tunes = {}
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    await queueResolvedCandidates([
      {
        source: 'music-collection',
        id: '1',
        title: 'Enter Sandman',
        artist: 'Metallica',
        path: 'Metallica/black/enter.mp3',
        link: '/music-collection/Metallica/black/enter.mp3',
      },
      {
        source: 'music-collection',
        id: '2',
        title: 'Enter Sandman (Live)',
        artist: 'Metallica',
        path: 'Metallica/live/enter.mp3',
        link: '/music-collection/Metallica/live/enter.mp3',
      },
    ], {
      tunebook: tunebook,
      tunes: tunes,
      setNowPlayingQueue: setNowPlayingQueue,
      nowPlayingQueue: null,
      materializeOptions: { tunes: tunes },
    }, { mode: 'append' })

    expect(tunebook.saveTune).toHaveBeenCalledTimes(1)
    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items).toHaveLength(1)
  })

  test('queueResolvedCandidates dedupes when library has separate tunes for same song', async function() {
    const tunes = {
      t1: {
        id: 't1',
        name: 'Enter Sandman',
        composer: 'Metallica',
        links: [{ link: '/music-collection/Metallica/black/enter.mp3', collectionPath: 'Metallica/black/enter.mp3' }],
      },
      t2: {
        id: 't2',
        name: 'Enter Sandman (Live)',
        composer: 'Metallica',
        links: [{ link: '/music-collection/Metallica/live/enter.mp3', collectionPath: 'Metallica/live/enter.mp3' }],
      },
    }
    const tunebook = buildTunebook(tunes)
    const setNowPlayingQueue = jest.fn()
    await queueResolvedCandidates([
      {
        source: 'music-collection',
        id: '1',
        title: 'Enter Sandman',
        artist: 'Metallica',
        path: 'Metallica/black/enter.mp3',
        link: '/music-collection/Metallica/black/enter.mp3',
      },
      {
        source: 'music-collection',
        id: '2',
        title: 'Enter Sandman (Live)',
        artist: 'Metallica',
        path: 'Metallica/live/enter.mp3',
        link: '/music-collection/Metallica/live/enter.mp3',
      },
    ], {
      tunebook: tunebook,
      tunes: tunes,
      setNowPlayingQueue: setNowPlayingQueue,
      nowPlayingQueue: null,
      materializeOptions: { tunes: tunes },
    }, { mode: 'append' })

    const queue = setNowPlayingQueue.mock.calls[0][0]
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].tuneId).toBe('t1')
  })
})
