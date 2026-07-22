import {
  resolvePlaybackTarget,
  startTunePlayback,
  resumeTunePlayback,
  isQueuePlaybackEngaged,
  playTuneNow,
} from './tunePlaybackActions'
import { SAMPLE_TUNE_IDS } from './devSeed/sampleTunebookAbc'

function makeTune(id, overrides) {
  return Object.assign({
    id: id,
    name: 'Test Tune',
    links: [],
    notes: 'CDEF',
  }, overrides || {})
}

function makeMockMediaController(tune, overrides) {
  const calls = {
    requestPlayback: [],
    playFromUserGesture: [],
    setMediaLinkNumber: [],
    setTune: [],
    navigatePath: null,
  }
  const controller = Object.assign({
    tune: tune,
    mediaLinkNumber: null,
    isMidiPlaybackRoute: function() { return false },
    isMediaPlaybackRoute: function() { return false },
    setTune: function(t) { calls.setTune.push(t); controller.tune = t },
    setMediaLinkNumber: function(n) { calls.setMediaLinkNumber.push(n) },
    requestPlayback: function(opts) {
      calls.requestPlayback.push(opts)
      return true
    },
    playFromUserGesture: function(opts) {
      calls.playFromUserGesture.push(opts || {})
    },
    play: function() {},
    canResumePlayback: function() { return false },
    hasActivePlaybackIntent: function() { return false },
  }, overrides || {})
  controller._calls = calls
  return controller
}

function makeMockTunebook() {
  return {
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.notes)
    },
    hasLinks: function(tune) {
      return !!(tune && tune.links && tune.links.length > 0)
    },
  }
}

describe('tunePlaybackActions navigate-then-play', function() {
  test('beginPlayback arms requestPlayback before navigate for midi', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune)
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, { tunes: { [tune.id]: tune } })

    expect(mediaController._calls.setTune).toHaveLength(1)
    expect(mediaController._calls.setTune[0].id).toBe(tune.id)
    expect(mediaController._calls.requestPlayback).toHaveLength(1)
    expect(mediaController._calls.requestPlayback[0]).toEqual(expect.objectContaining({
      tuneId: tune.id,
      playState: 'playMidi',
      fromUserGesture: true,
      fresh: true,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMidi')
    expect(mediaController._calls.playFromUserGesture).toHaveLength(0)
  })

  test('beginPlayback arms requestPlayback for media link before navigate', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'https://example.com/a.mp3' }, { link: 'https://www.youtube.com/watch?v=abc' }],
    })
    const mediaController = makeMockMediaController(tune)
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, { tunes: { [tune.id]: tune } })

    expect(mediaController._calls.requestPlayback[0]).toEqual(expect.objectContaining({
      tuneId: tune.id,
      playState: 'playMedia',
      linkNum: 0,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMedia/0')
  })

  test('uses viewed tune from location + tunes map instead of stale controller tune', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const stale = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(stale)
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, {
      tunes: {
        [viewed.id]: viewed,
        [stale.id]: stale,
      },
    })

    expect(mediaController._calls.requestPlayback[0].tuneId).toBe(viewed.id)
    expect(navigate).toHaveBeenCalledWith('/tunes/' + viewed.id + '/playMidi')
  })

  test('does not navigate when already on play route', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune, {
      isMidiPlaybackRoute: function() { return true },
    })
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + tune.id + '/playMidi' }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, { tunes: { [tune.id]: tune } })

    expect(mediaController._calls.requestPlayback).toHaveLength(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('resolvePlaybackTarget prefers URL playMidi route', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys, {
      links: [{ link: 'https://example.com/a.mp3' }],
    })
    const mediaController = makeMockMediaController(tune)
    const location = { pathname: '/tunes/' + tune.id + '/playMidi' }
    const tunebook = makeMockTunebook()

    expect(resolvePlaybackTarget(mediaController, tunebook, location, tune)).toEqual({ type: 'midi' })
  })

  test('resolvePlaybackTarget prefers URL playMedia over stale midi route', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'https://example.com/a.mp3' }, { link: 'https://www.youtube.com/watch?v=abc' }],
    })
    const mediaController = makeMockMediaController(tune, {
      isMidiPlaybackRoute: function() { return true },
    })
    const location = { pathname: '/tunes/' + tune.id + '/playMedia/1' }
    const tunebook = makeMockTunebook()

    expect(resolvePlaybackTarget(mediaController, tunebook, location, tune)).toEqual({
      type: 'media',
      linkNum: 1,
    })
  })

  test('resolvePlaybackTarget defaults to first media link when tune has links', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'https://example.com/a.mp3' }],
      notes: 'CDEF',
    })
    const mediaController = makeMockMediaController(tune, {
      isMidiPlaybackRoute: function() { return true },
    })
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = makeMockTunebook()

    expect(resolvePlaybackTarget(mediaController, tunebook, location, tune)).toEqual({
      type: 'media',
      linkNum: 0,
    })
  })
})

describe('resumeTunePlayback tune identity guard', function() {
  test('does not resume when controller holds a different tune than viewed', function() {
    const stale = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(stale, {
      canResumePlayback: function() { return true },
    })

    expect(resumeTunePlayback(mediaController, SAMPLE_TUNE_IDS.cooleys)).toBe(false)
    expect(mediaController._calls.playFromUserGesture).toHaveLength(0)
  })

  test('resumes when controller tune matches viewed tune', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune, {
      canResumePlayback: function() { return true },
    })

    expect(resumeTunePlayback(mediaController, tune.id)).toBe(true)
    expect(mediaController._calls.playFromUserGesture).toHaveLength(1)
  })
})

describe('startTunePlayback with a persisted now-playing queue', function() {
  function makeQueue(currentTuneId) {
    return {
      items: [{ tuneId: currentTuneId }],
      currentIndex: 0,
    }
  }

  test('idle queue on another tune is discarded and playback starts', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune)
    const navigate = jest.fn()
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, {
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setQueuePlayConfirm).not.toHaveBeenCalled()
    expect(setNowPlayingQueue).toHaveBeenCalledWith(null)
    expect(mediaController._calls.requestPlayback[0].tuneId).toBe(viewed.id)
    expect(navigate).toHaveBeenCalledWith('/tunes/' + viewed.id + '/playMidi')
  })

  test('actively playing queue on another tune asks for confirmation', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune, {
      isPlaying: true,
    })
    const navigate = jest.fn()
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, {
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setQueuePlayConfirm).toHaveBeenCalledTimes(1)
    expect(setNowPlayingQueue).not.toHaveBeenCalled()
    expect(mediaController._calls.requestPlayback).toHaveLength(0)
  })

  test('paused queue playback on another tune also asks for confirmation', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune, {
      canResumePlayback: function() { return true },
    })
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setQueuePlayConfirm).toHaveBeenCalledTimes(1)
    expect(setNowPlayingQueue).not.toHaveBeenCalled()
  })

  test('isQueuePlaybackEngaged reflects playing/loading/intent/paused states', function() {
    expect(isQueuePlaybackEngaged(makeMockMediaController(null))).toBe(false)
    expect(isQueuePlaybackEngaged(makeMockMediaController(null, { isPlaying: true }))).toBe(true)
    expect(isQueuePlaybackEngaged(makeMockMediaController(null, { isLoading: true }))).toBe(true)
    expect(isQueuePlaybackEngaged(makeMockMediaController(null, {
      hasActivePlaybackIntent: function() { return true },
    }))).toBe(true)
    expect(isQueuePlaybackEngaged(makeMockMediaController(null, {
      canResumePlayback: function() { return true },
    }))).toBe(true)
  })

  test('playTuneNow prefers media links and starts playback', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'https://example.com/a.mp3' }],
      notes: 'CDEF',
    })
    const mediaController = makeMockMediaController(null)
    const navigate = jest.fn()
    const tunebook = makeMockTunebook()

    expect(playTuneNow(mediaController, tunebook, navigate, tune)).toBe(true)
    expect(mediaController._calls.requestPlayback[0]).toEqual(expect.objectContaining({
      tuneId: tune.id,
      playState: 'playMedia',
      linkNum: 0,
      fresh: true,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMedia/0')
  })

  test('playTuneNow falls back to midi when tune has no links', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(null)
    const navigate = jest.fn()

    expect(playTuneNow(mediaController, makeMockTunebook(), navigate, tune)).toBe(true)
    expect(mediaController._calls.requestPlayback[0].playState).toBe('playMidi')
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMidi')
  })
})
