import { createQueue } from './nowPlayingQueue'
import {
  enqueueManualPlaylistSkip,
  consumeManualPlaylistSkipStep,
  hasPendingManualPlaylistSkip,
  isManualPlaylistSkipActive,
  shouldIgnorePlaybackEndForManualSkip,
  shouldIgnorePlaybackFailureForManualSkip,
  finishManualPlaylistSkip,
  resetManualPlaylistSkipForTests,
  runPlaylistQueueSkip,
  getManualPlaylistSkipSession,
  noteManualPlaylistSkipPlaybackStarted,
  KEEP_PLAYING_ENDED_IGNORE_MS,
  SKIP_STARTED_ENDED_TAIL_MS,
} from './playlistManualSkip'

function midiTune(id) {
  return { id: id, notes: 'CDEF' }
}

function makeTunebook() {
  return {
    hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
    hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
  }
}

function makeController() {
  return {
    unlockAudioFromUserGesture: jest.fn(),
    preparePlaybackFromUserGesture: jest.fn(),
    armPlaybackIntent: jest.fn(),
    silencePlaybackOutputs: jest.fn(),
    setTune: jest.fn(),
    setMediaLinkNumber: jest.fn(),
    applyPlaybackRoute: jest.fn(),
    play: jest.fn(),
    playFromUserGesture: jest.fn(),
    abortPlayingIntent: jest.fn(),
    pause: jest.fn(),
    setIsLoading: jest.fn(),
    setIsPlaying: jest.fn(),
    setIsReady: jest.fn(),
  }
}

describe('playlistManualSkip', function() {
  beforeEach(function() {
    resetManualPlaylistSkipForTests()
    jest.useRealTimers()
  })

  afterEach(function() {
    resetManualPlaylistSkipForTests()
    jest.useRealTimers()
  })

  test('coalesces rapid next clicks into pending steps', function() {
    enqueueManualPlaylistSkip(1, true)
    enqueueManualPlaylistSkip(1, true)
    enqueueManualPlaylistSkip(1, true)
    expect(isManualPlaylistSkipActive()).toBe(true)
    expect(hasPendingManualPlaylistSkip()).toBe(true)
    expect(consumeManualPlaylistSkipStep()).toBe(1)
    expect(consumeManualPlaylistSkipStep()).toBe(1)
    expect(consumeManualPlaylistSkipStep()).toBe(1)
    expect(consumeManualPlaylistSkipStep()).toBe(0)
    expect(hasPendingManualPlaylistSkip()).toBe(false)
  })

  test('keeps keepPlaying once a skip session is already playing', function() {
    enqueueManualPlaylistSkip(1, true)
    enqueueManualPlaylistSkip(1, false)
    expect(getManualPlaylistSkipSession().keepPlaying).toBe(true)
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(true)
    expect(shouldIgnorePlaybackFailureForManualSkip()).toBe(false)
  })

  test('ignores leftover ended events during skip and shortly after', function() {
    jest.useFakeTimers()
    enqueueManualPlaylistSkip(1, true)
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(true)
    finishManualPlaylistSkip()
    expect(isManualPlaylistSkipActive()).toBe(false)
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(true)
    jest.advanceTimersByTime(KEEP_PLAYING_ENDED_IGNORE_MS + 20)
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(false)
  })

  test('stops ignoring ended events shortly after the next track starts', function() {
    jest.useFakeTimers()
    enqueueManualPlaylistSkip(1, true)
    finishManualPlaylistSkip()
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(true)
    noteManualPlaylistSkipPlaybackStarted()
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(true)
    jest.advanceTimersByTime(SKIP_STARTED_ENDED_TAIL_MS + 20)
    expect(shouldIgnorePlaybackEndForManualSkip()).toBe(false)
  })

  test('rapid next while playing lands on the final track and keeps playback armed', async function() {
    const tunes = {
      a: midiTune('a'),
      b: midiTune('b'),
      c: midiTune('c'),
      d: midiTune('d'),
    }
    let queue = createQueue({ tuneIds: ['a', 'b', 'c', 'd'], currentIndex: 0, autoAdvance: true })
    const mediaController = makeController()
    const stopPlayback = jest.fn()
    const deps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: makeTunebook(),
      mediaController: mediaController,
      stopPlayback: stopPlayback,
      forceNavigate: true,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
    }

    enqueueManualPlaylistSkip(1, true)
    enqueueManualPlaylistSkip(1, true)
    enqueueManualPlaylistSkip(1, true)
    const ok = await runPlaylistQueueSkip(deps)

    expect(ok).toBe(true)
    expect(stopPlayback).not.toHaveBeenCalled()
    expect(mediaController.silencePlaybackOutputs).not.toHaveBeenCalled()
    expect(queue.currentIndex).toBe(3)
    expect(mediaController.unlockAudioFromUserGesture).toHaveBeenCalled()
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.d)
    expect(mediaController.playFromUserGesture).toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalled()
    expect(isManualPlaylistSkipActive()).toBe(false)
  })

  test('does not stop the playlist when overlapping skip calls share one session', async function() {
    const tunes = { a: midiTune('a'), b: midiTune('b'), c: midiTune('c') }
    let queue = createQueue({ tuneIds: ['a', 'b', 'c'], currentIndex: 0, autoAdvance: true })
    const mediaController = makeController()
    const stopPlayback = jest.fn()
    const deps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: makeTunebook(),
      mediaController: mediaController,
      stopPlayback: stopPlayback,
      forceNavigate: true,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
    }

    enqueueManualPlaylistSkip(1, true)
    const first = runPlaylistQueueSkip(deps)
    enqueueManualPlaylistSkip(1, true)
    const second = runPlaylistQueueSkip(deps)
    await Promise.all([first, second])

    expect(stopPlayback).not.toHaveBeenCalled()
    expect(queue.currentIndex).toBe(2)
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.c)
    expect(mediaController.abortPlayingIntent).not.toHaveBeenCalled()
  })

  test('skips unplayable tunes and wraps to keep playing', async function() {
    const tunes = {
      a: midiTune('a'),
      empty: { id: 'empty' },
      c: midiTune('c'),
    }
    const tunebook = makeTunebook()
    const mediaController = makeController()

    let queue = createQueue({
      tuneIds: ['a', 'empty', 'c'],
      currentIndex: 0,
      autoAdvance: true,
    })
    const skipDeps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      stopPlayback: jest.fn(),
      forceNavigate: true,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
    }
    enqueueManualPlaylistSkip(1, true)
    expect(await runPlaylistQueueSkip(skipDeps)).toBe(true)
    expect(queue.items[queue.currentIndex].tuneId).toBe('c')

    resetManualPlaylistSkipForTests()
    queue = createQueue({
      tuneIds: ['a', 'empty', 'c'],
      currentIndex: 2,
      autoAdvance: true,
    })
    skipDeps.stopPlayback = jest.fn()
    mediaController.setTune.mockClear()
    enqueueManualPlaylistSkip(1, true)
    expect(await runPlaylistQueueSkip(skipDeps)).toBe(true)
    expect(queue.items[queue.currentIndex].tuneId).toBe('a')
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.a)
    expect(skipDeps.stopPlayback).not.toHaveBeenCalled()
  })

  test('keep-playing skip uses a later media link when the first is empty', async function() {
    const tunes = {
      a: midiTune('a'),
      mixed: {
        id: 'mixed',
        links: [
          { link: '' },
          { link: 'https://example.com/b.mp3' },
        ],
      },
    }
    let queue = createQueue({
      tuneIds: ['a', 'mixed'],
      currentIndex: 0,
      autoAdvance: true,
    })
    const mediaController = makeController()
    const deps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: makeTunebook(),
      mediaController: mediaController,
      stopPlayback: jest.fn(),
      forceNavigate: true,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
    }
    enqueueManualPlaylistSkip(1, true)
    expect(await runPlaylistQueueSkip(deps)).toBe(true)
    expect(queue.currentIndex).toBe(1)
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.mixed)
    expect(mediaController.setMediaLinkNumber).toHaveBeenCalledWith(1)
    expect(mediaController.applyPlaybackRoute).toHaveBeenCalledWith(
      'playMedia',
      '1',
      tunes.mixed,
      deps.tunebook
    )
    expect(mediaController.playFromUserGesture).toHaveBeenCalledTimes(1)
  })

  test('paused skip moves the queue without restarting playback', async function() {
    const tunes = { a: midiTune('a'), b: midiTune('b') }
    let queue = createQueue({ tuneIds: ['a', 'b'], currentIndex: 0 })
    const mediaController = makeController()
    const stopPlayback = jest.fn()
    const deps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: makeTunebook(),
      mediaController: mediaController,
      stopPlayback: stopPlayback,
      forceNavigate: true,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
    }

    enqueueManualPlaylistSkip(1, false)
    const ok = await runPlaylistQueueSkip(deps)
    expect(ok).toBe(true)
    expect(queue.currentIndex).toBe(1)
    expect(stopPlayback).toHaveBeenCalled()
    expect(mediaController.setTune).not.toHaveBeenCalled()
    expect(deps.navigate).toHaveBeenCalledWith('/tunes/b')
  })

  test('playlist skip does not change the page when follow is off', async function() {
    const tunes = { a: midiTune('a'), b: midiTune('b') }
    let queue = createQueue({ tuneIds: ['a', 'b'], currentIndex: 0, followTune: false })
    const mediaController = makeController()
    const deps = {
      getQueue: function() { return queue },
      setQueue: function(next) { queue = next },
      tunes: tunes,
      tunebook: makeTunebook(),
      mediaController: mediaController,
      stopPlayback: jest.fn(),
      forceNavigate: false,
      navigate: jest.fn(),
      setCurrentTune: jest.fn(),
      locationPathname: '/tunes/a',
    }

    enqueueManualPlaylistSkip(1, true)
    const ok = await runPlaylistQueueSkip(deps)
    expect(ok).toBe(true)
    expect(queue.currentIndex).toBe(1)
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.b)
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.setCurrentTune).not.toHaveBeenCalled()
  })
})
