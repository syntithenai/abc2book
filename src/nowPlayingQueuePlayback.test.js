import { createQueue } from './nowPlayingQueue'
import {
  shouldMusicSingleOwnPlayback,
  shouldMusicSingleMountMediaEngine,
  shouldMusicSingleOwnMidiEngine,
  shouldNowPlayingHostOwnPlayback,
  parseTunePagePlaybackFromUrl,
  isViewingDifferentFromPlaying,
  playQueueItem,
  handleQueueAdvanceOnEnded,
} from './nowPlayingQueuePlayback'

describe('nowPlayingQueuePlayback', function() {
  const queue = createQueue({ tuneIds: ['playing', 'other'] })

  test('isViewingDifferentFromPlaying requires both tune ids', function() {
    expect(isViewingDifferentFromPlaying(null, queue)).toBe(false)
    expect(isViewingDifferentFromPlaying('other', queue)).toBe(true)
    expect(isViewingDifferentFromPlaying('playing', queue)).toBe(false)
  })

  test('shouldMusicSingleOwnPlayback on list or settings uses background host', function() {
    expect(shouldMusicSingleOwnPlayback(null, queue)).toBe(false)
    expect(shouldMusicSingleOwnPlayback(undefined, queue)).toBe(false)
  })

  test('shouldMusicSingleOwnPlayback keeps engine in NowPlayingHost on playing tune page', function() {
    // List↔single navigation must not hand the engine to MusicSingle.
    expect(shouldMusicSingleOwnPlayback('playing', queue)).toBe(false)
  })

  test('shouldMusicSingleOwnPlayback on different tune page uses background host', function() {
    expect(shouldMusicSingleOwnPlayback('other', queue)).toBe(false)
  })

  test('shouldMusicSingleOwnPlayback without queue also uses background host', function() {
    expect(shouldMusicSingleOwnPlayback('playing', null)).toBe(false)
    expect(shouldMusicSingleOwnPlayback(null, null)).toBe(false)
  })

  test('shouldMusicSingleOwnPlayback owns preview-once of a non-current tune', function() {
    const previewQueue = Object.assign({}, queue, {
      previewOnce: { tuneId: 'other', returnIndex: 0 },
    })
    expect(shouldMusicSingleOwnPlayback('other', previewQueue)).toBe(true)
    expect(shouldMusicSingleOwnPlayback('playing', previewQueue)).toBe(false)
  })

  test('parseTunePagePlaybackFromUrl reads play routes', function() {
    expect(parseTunePagePlaybackFromUrl('/tunes/abc/playMidi')).toEqual({
      playState: 'playMidi',
      mediaLinkNumber: '0',
    })
    expect(parseTunePagePlaybackFromUrl('/tunes/abc/playMedia/2')).toEqual({
      playState: 'playMedia',
      mediaLinkNumber: '2',
    })
    expect(parseTunePagePlaybackFromUrl('/tunes/abc')).toBe(null)
  })

  test('shouldNowPlayingHostOwnPlayback handles tune-page play URLs', function() {
    const tunes = { abc: { id: 'abc', links: [{ link: 'https://youtu.be/x' }] } }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'abc',
      queue: null,
      mediaController: {},
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/abc/playMedia/0',
      tunes: tunes,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback does not mount for idle queue', function() {
    const tunes = { playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] } }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: null,
      queue: queue,
      mediaController: {},
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes',
      tunes: tunes,
    })).toBe(false)
  })

  test('shouldNowPlayingHostOwnPlayback mounts for engaged queue playback', function() {
    const tunes = { playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] } }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: null,
      queue: queue,
      mediaController: { isPlaying: true },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes',
      tunes: tunes,
    })).toBe(true)
  })

  test('shouldMusicSingleMountMediaEngine defers to NowPlayingHost during normal playback', function() {
    const tunes = { playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] } }
    const mediaController = { playbackRouteMode: 'media', tune: tunes.playing }
    expect(shouldMusicSingleMountMediaEngine({
      viewedTuneId: 'playing',
      queue: queue,
      mediaController: mediaController,
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/playing/playMedia/0',
      tunes: tunes,
    })).toBe(false)
  })

  test('shouldMusicSingleMountMediaEngine keeps preview-once engine in MusicSingle', function() {
    const previewQueue = Object.assign({}, queue, {
      previewOnce: { tuneId: 'other', returnIndex: 0 },
    })
    expect(shouldMusicSingleMountMediaEngine({
      viewedTuneId: 'other',
      queue: previewQueue,
      mediaController: {},
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: { other: { id: 'other', links: [{ link: 'https://youtu.be/x' }] } },
    })).toBe(true)
  })

  test('shouldMusicSingleOwnMidiEngine matches preview-once ownership', function() {
    const previewQueue = Object.assign({}, queue, {
      previewOnce: { tuneId: 'other', returnIndex: 0 },
    })
    expect(shouldMusicSingleOwnMidiEngine('other', previewQueue)).toBe(true)
    expect(shouldMusicSingleOwnMidiEngine('playing', queue)).toBe(false)
  })

  test('playQueueItem can defer engine start for queue advance', function() {
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const tune = { id: 'b', links: [{ link: 'http://example.com/x' }] }
    const tunebook = {
      hasNotesOrChords: function() { return false },
      hasLinks: function() { return true },
    }
    const item = { tuneId: 'b', prefer: 'auto' }
    const ok = playQueueItem(mediaController, tunebook, tune, item, { deferPlaybackEngine: true })
    expect(ok).toBe(true)
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
    expect(mediaController.play).not.toHaveBeenCalled()
  })

  test('handleQueueAdvanceOnEnded skips unplayable tunes and stops when none remain', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      empty: { id: 'empty' },
      media: { id: 'media', links: [{ link: 'https://example.com/a.mp3' }] },
    }
    const queue = createQueue({
      tuneIds: ['empty', 'media'],
      currentIndex: 0,
      autoAdvance: true,
    })
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
      abortPlayingIntent: jest.fn(),
      pause: jest.fn(),
      setIsLoading: jest.fn(),
      setIsPlaying: jest.fn(),
      setIsReady: jest.fn(),
    }
    let failReason = null
    let updatedQueue = null
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: function(reason) { failReason = reason },
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(updatedQueue).not.toBeNull()
    expect(updatedQueue.currentIndex).toBe(1)
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
    expect(failReason).toBeNull()
  })

  test('handleQueueAdvanceOnEnded stops without arming intent when all tunes unplayable', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = { empty: { id: 'empty' } }
    const queue = createQueue({ tuneIds: ['empty'], currentIndex: 0, autoAdvance: true })
    const mediaController = {
      setTune: jest.fn(),
      armPlaybackIntent: jest.fn(),
      abortPlayingIntent: jest.fn(),
      pause: jest.fn(),
      setIsLoading: jest.fn(),
      setIsPlaying: jest.fn(),
      setIsReady: jest.fn(),
    }
    let failReason = null
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: jest.fn(),
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: function(reason) { failReason = reason },
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(mediaController.armPlaybackIntent).not.toHaveBeenCalled()
    expect(mediaController.abortPlayingIntent).toHaveBeenCalled()
    expect(failReason).toBe('end')
  })
})
