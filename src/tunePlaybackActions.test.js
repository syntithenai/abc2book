import {
  resolvePlaybackTarget,
  startTunePlayback,
  resumeTunePlayback,
  isQueuePlaybackEngaged,
  playTuneNow,
  resumePlaylistPlayback,
  finalizePlayNextQueue,
  startQueueItemIfPlaybackIdle,
} from './tunePlaybackActions'
import { createQueue as createQueueBase, MIDI_PREFERENCE } from './nowPlayingQueue'
import { setVoiceViewSettings } from './abcVoiceViewSettings'
import { SAMPLE_TUNE_IDS } from './devSeed/sampleTunebookAbc'

function createQueue(opts) {
  return createQueueBase(Object.assign({ midiPreference: MIDI_PREFERENCE.ALLOW }, opts || {}))
}

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
    applyPlaybackRoute: [],
    armPlaybackIntent: [],
    navigatePath: null,
  }
  const controller = Object.assign({
    tune: tune,
    mediaLinkNumber: null,
    isMidiPlaybackRoute: function() { return false },
    isMediaPlaybackRoute: function() { return false },
    setTune: function(t) { calls.setTune.push(t); controller.tune = t },
    setMediaLinkNumber: function(n) { calls.setMediaLinkNumber.push(n) },
    applyPlaybackRoute: function(state, linkParam, t, tb) {
      calls.applyPlaybackRoute.push({ state: state, linkParam: linkParam, tuneId: t && t.id })
    },
    armPlaybackIntent: function(opts) { calls.armPlaybackIntent.push(opts || {}) },
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
  test('beginPlayback requests playback before navigate for midi', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune)
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, { tunes: { [tune.id]: tune } })

    expect(mediaController._calls.setTune).toHaveLength(1)
    expect(mediaController._calls.setTune[0].id).toBe(tune.id)
    expect(mediaController._calls.applyPlaybackRoute).toHaveLength(1)
    expect(mediaController._calls.requestPlayback).toHaveLength(1)
    expect(mediaController._calls.requestPlayback[0]).toEqual(expect.objectContaining({
      tuneId: tune.id,
      playState: 'playMidi',
      fromUserGesture: true,
      fresh: true,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMidi')
    expect(mediaController._calls.armPlaybackIntent).toHaveLength(0)
    expect(mediaController._calls.playFromUserGesture).toHaveLength(0)
  })

  test('beginPlayback requests playback before navigate for media link', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'https://example.com/a.mp3' }, { link: 'https://www.youtube.com/watch?v=abc' }],
    })
    const mediaController = makeMockMediaController(tune)
    const navigate = jest.fn()
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, { tunes: { [tune.id]: tune } })

    expect(mediaController._calls.applyPlaybackRoute[0]).toEqual(expect.objectContaining({
      state: 'playMedia',
      linkParam: '0',
      tuneId: tune.id,
    }))
    expect(mediaController._calls.requestPlayback).toHaveLength(1)
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMedia/0')
  })

  test('uses playTuneId from context when page location has no tune id', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const stale = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(stale)
    const navigate = jest.fn()
    const location = { pathname: '/books' }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, {
      playTuneId: viewed.id,
      tunes: {
        [viewed.id]: viewed,
        [stale.id]: stale,
      },
    })

    expect(mediaController._calls.setTune[0].id).toBe(viewed.id)
    expect(mediaController._calls.requestPlayback).toHaveLength(1)
    expect(mediaController._calls.requestPlayback[0]).toEqual(expect.objectContaining({
      tuneId: viewed.id,
      playState: 'playMidi',
      fromUserGesture: true,
      fresh: true,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + viewed.id + '/playMidi')
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

    expect(mediaController._calls.setTune[0].id).toBe(viewed.id)
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

  test('resolvePlaybackTarget prefers live midi when voices are filtered', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
      links: [{ link: 'abcbook-recording:midi', mediaKind: 'midi' }],
      voices: {
        '1': { notes: ['C'] },
        '2': { notes: ['F'] },
      },
    })
    setVoiceViewSettings(tune.id, {
      visible: { '1': false, '2': true },
      playable: { '1': false, '2': true },
    }, ['1', '2'])
    const mediaController = makeMockMediaController(tune)
    const location = { pathname: '/tunes/' + tune.id }
    const tunebook = Object.assign({}, makeMockTunebook(), {
      hasNotesOrChords: function(t) {
        return !!(t && t.voices && Object.keys(t.voices).length > 0)
      },
    })

    expect(resolvePlaybackTarget(mediaController, tunebook, location, tune)).toEqual({
      type: 'midi',
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

  test('does not resume when controller tune is missing but viewed tune is set', function() {
    const mediaController = makeMockMediaController(null, {
      canResumePlayback: function() { return true },
    })

    expect(resumeTunePlayback(mediaController, SAMPLE_TUNE_IDS.cooleys)).toBe(false)
    expect(mediaController._calls.playFromUserGesture).toHaveLength(0)
  })

  test('does not resume paused queue item when viewing a different tune', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(viewed, {
      canResumePlayback: function() { return true },
    })
    const queue = {
      items: [{ tuneId: queueTune.id }, { tuneId: viewed.id }],
      currentIndex: 0,
    }

    expect(resumeTunePlayback(mediaController, viewed.id, { queue: queue })).toBe(false)
    expect(mediaController._calls.playFromUserGesture).toHaveLength(0)
  })
})

describe('startTunePlayback with a persisted now-playing queue', function() {
  function makeQueue(currentTuneId) {
    return {
      items: [{ tuneId: currentTuneId }],
      currentIndex: 0,
      midiPreference: MIDI_PREFERENCE.ALLOW,
    }
  }

  test('single view play with no playlist still stops after this tune', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(viewed)
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      tunes: { [viewed.id]: viewed },
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 0,
      stopAfterCurrent: true,
      items: [
        expect.objectContaining({ tuneId: viewed.id }),
      ],
    }))
    expect(mediaController._calls.requestPlayback.length).toBe(1)
  })

  test('single view play of a tune not on the playlist appends and stops after it', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune)
    const navigate = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }
    const tunebook = makeMockTunebook()

    startTunePlayback(mediaController, tunebook, navigate, location, {
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      stopAfterCurrent: true,
      items: [
        expect.objectContaining({ tuneId: queueTune.id }),
        expect.objectContaining({ tuneId: viewed.id }),
      ],
    }))
    expect(mediaController._calls.applyPlaybackRoute[0].tuneId).toBe(viewed.id)
    expect(navigate).toHaveBeenCalledWith('/tunes/' + viewed.id + '/playMidi')
  })

  test('single view play keeps the playlist when the viewed tune is already on it', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const firstTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(firstTune)
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + viewed.id }
    const tunebook = makeMockTunebook()
    const queue = {
      items: [
        { tuneId: firstTune.id },
        { tuneId: viewed.id },
      ],
      currentIndex: 0,
      midiPreference: MIDI_PREFERENCE.ALLOW,
    }

    startTunePlayback(mediaController, tunebook, jest.fn(), location, {
      tunes: { [viewed.id]: viewed, [firstTune.id]: firstTune },
      nowPlayingQueue: queue,
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setQueuePlayConfirm).not.toHaveBeenCalled()
    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      stopAfterCurrent: true,
      items: [
        expect.objectContaining({ tuneId: firstTune.id }),
        expect.objectContaining({ tuneId: viewed.id }),
      ],
    }))
    expect(mediaController._calls.requestPlayback.length).toBe(1)
  })

  test('single view play of the current queue tune still stops after this track', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune)
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes/' + tune.id }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      tunes: { [tune.id]: tune },
      nowPlayingQueue: makeQueue(tune.id),
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 0,
      stopAfterCurrent: true,
      items: [
        expect.objectContaining({ tuneId: tune.id }),
      ],
    }))
    expect(mediaController._calls.requestPlayback.length).toBe(1)
  })

  test('list play still appends to an existing playlist', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune)
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes' }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      playTuneId: viewed.id,
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      previewOnce: null,
      items: [
        expect.objectContaining({ tuneId: queueTune.id }),
        expect.objectContaining({ tuneId: viewed.id }),
      ],
    }))
    expect(mediaController._calls.playFromUserGesture).toHaveLength(1)
  })

  test('idle queue on current tune keeps playlist and starts queue playback from the list', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(tune)
    const navigate = jest.fn()
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes' }
    const tunebook = makeMockTunebook()
    const queue = {
      items: [{ tuneId: tune.id }],
      currentIndex: 0,
      midiPreference: MIDI_PREFERENCE.ALLOW,
    }

    startTunePlayback(mediaController, tunebook, navigate, location, {
      playTuneId: tune.id,
      tunes: { [tune.id]: tune },
      nowPlayingQueue: queue,
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 0,
      previewOnce: null,
    }))
    expect(setNowPlayingQueue).not.toHaveBeenCalledWith(null)
    expect(mediaController._calls.playFromUserGesture.length).toBe(1)
  })

  test('engaged queue on the list jumps to the viewed tune on the playlist', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const firstTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(firstTune, {
      isPlaying: true,
    })
    const navigate = jest.fn()
    const setQueuePlayConfirm = jest.fn()
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes' }
    const tunebook = makeMockTunebook()
    const queue = {
      items: [
        { tuneId: firstTune.id },
        { tuneId: viewed.id },
      ],
      currentIndex: 0,
      midiPreference: MIDI_PREFERENCE.ALLOW,
    }

    startTunePlayback(mediaController, tunebook, navigate, location, {
      playTuneId: viewed.id,
      tunes: { [viewed.id]: viewed, [firstTune.id]: firstTune },
      nowPlayingQueue: queue,
      setQueuePlayConfirm: setQueuePlayConfirm,
      setNowPlayingQueue: setNowPlayingQueue,
      skipQueueConfirm: true,
    })

    expect(setQueuePlayConfirm).not.toHaveBeenCalled()
    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      previewOnce: null,
    }))
    expect(mediaController._calls.playFromUserGesture.length).toBe(1)
  })

  test('actively playing queue on the list appends another tune without confirmation', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune, {
      isPlaying: true,
    })
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes' }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      playTuneId: viewed.id,
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      previewOnce: null,
      items: [
        expect.objectContaining({ tuneId: queueTune.id }),
        expect.objectContaining({ tuneId: viewed.id }),
      ],
    }))
    expect(mediaController._calls.playFromUserGesture).toHaveLength(1)
  })

  test('paused queue playback on the list appends and plays without confirmation', function() {
    const viewed = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const queueTune = makeTune(SAMPLE_TUNE_IDS.amazingGrace)
    const mediaController = makeMockMediaController(queueTune, {
      canResumePlayback: function() { return true },
    })
    const setNowPlayingQueue = jest.fn()
    const location = { pathname: '/tunes' }

    startTunePlayback(mediaController, makeMockTunebook(), jest.fn(), location, {
      playTuneId: viewed.id,
      tunes: { [viewed.id]: viewed, [queueTune.id]: queueTune },
      nowPlayingQueue: makeQueue(queueTune.id),
      setNowPlayingQueue: setNowPlayingQueue,
    })

    expect(setNowPlayingQueue).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: 1,
      previewOnce: null,
    }))
    expect(mediaController._calls.playFromUserGesture).toHaveLength(1)
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

  test('finalizePlayNextQueue starts playback when queue was idle', function() {
    const tunebook = makeMockTunebook()
    tunebook.startNowPlayingQueue = jest.fn()
    const mediaController = makeMockMediaController(null)
    const setQueue = jest.fn()
    const priorQueue = null
    const nextQueue = createQueue({ tuneIds: ['a'], currentIndex: 0 })

    finalizePlayNextQueue(mediaController, tunebook, priorQueue, nextQueue, setQueue)

    expect(setQueue).toHaveBeenCalledWith(nextQueue)
    expect(tunebook.startNowPlayingQueue).toHaveBeenCalledWith(
      nextQueue,
      null,
      expect.objectContaining({ startPlayback: true, mediaController: mediaController })
    )
  })

  test('finalizePlayNextQueue does not restart playback when already engaged', function() {
    const tunebook = makeMockTunebook()
    tunebook.startNowPlayingQueue = jest.fn()
    const mediaController = makeMockMediaController(null, { isPlaying: true })
    const setQueue = jest.fn()
    const priorQueue = createQueue({ tuneIds: ['a'], currentIndex: 0 })
    const nextQueue = createQueue({ tuneIds: ['a', 'b'], currentIndex: 0 })

    finalizePlayNextQueue(mediaController, tunebook, priorQueue, nextQueue, setQueue)

    expect(setQueue).toHaveBeenCalledWith(nextQueue)
    expect(tunebook.startNowPlayingQueue).not.toHaveBeenCalled()
  })

  test('startQueueItemIfPlaybackIdle is a no-op when playback is engaged', function() {
    const tunebook = makeMockTunebook()
    tunebook.startNowPlayingQueue = jest.fn()
    const queue = createQueue({ tuneIds: ['a'] })
    const ok = startQueueItemIfPlaybackIdle(
      makeMockMediaController(null, { isPlaying: true }),
      tunebook,
      queue
    )
    expect(ok).toBe(false)
    expect(tunebook.startNowPlayingQueue).not.toHaveBeenCalled()
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
    expect(mediaController._calls.applyPlaybackRoute[0]).toEqual(expect.objectContaining({
      state: 'playMedia',
      linkParam: '0',
      tuneId: tune.id,
    }))
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMedia/0')
  })

  test('playTuneNow falls back to midi when tune has no links', function() {
    const tune = makeTune(SAMPLE_TUNE_IDS.cooleys)
    const mediaController = makeMockMediaController(null)
    const navigate = jest.fn()

    expect(playTuneNow(mediaController, makeMockTunebook(), navigate, tune)).toBe(true)
    expect(mediaController._calls.applyPlaybackRoute[0].state).toBe('playMidi')
    expect(navigate).toHaveBeenCalledWith('/tunes/' + tune.id + '/playMidi')
  })
})

describe('resumePlaylistPlayback', function() {
  test('advances to next playable tune when current queue item is unplayable', async function() {
    const tunebook = makeMockTunebook()
    const tunes = {
      empty: makeTune('empty', { notes: '', links: [] }),
      playable: makeTune('playable', { notes: '', links: [{ link: 'https://example.com/a.mp3' }] }),
    }
    const queue = createQueue({ tuneIds: ['empty', 'playable'], currentIndex: 0, followTune: true })
    const mediaController = makeMockMediaController(tunes.empty, {
      applyPlaybackRoute: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      playFromUserGesture: jest.fn(),
    })
    const navigate = jest.fn()
    let updatedQueue = null

    expect(resumePlaylistPlayback(
      mediaController,
      tunebook,
      navigate,
      queue,
      tunes,
      function(q) { updatedQueue = q },
      { pathname: '/tunes/empty' }
    )).toBe(true)

    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    expect(updatedQueue).not.toBeNull()
    expect(updatedQueue.currentIndex).toBe(1)
    expect(navigate).toHaveBeenCalledWith('/tunes/playable/playMedia/0')
    expect(mediaController.playFromUserGesture).toHaveBeenCalled()
  })

  test('does not navigate when follow tune is off', async function() {
    const tunebook = makeMockTunebook()
    const tunes = {
      empty: makeTune('empty', { notes: '', links: [] }),
      playable: makeTune('playable', { notes: '', links: [{ link: 'https://example.com/a.mp3' }] }),
    }
    const queue = Object.assign(
      createQueue({ tuneIds: ['empty', 'playable'], currentIndex: 0 }),
      { followTune: false }
    )
    const mediaController = makeMockMediaController(tunes.empty, {
      applyPlaybackRoute: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      playFromUserGesture: jest.fn(),
    })
    const navigate = jest.fn()

    resumePlaylistPlayback(
      mediaController,
      tunebook,
      navigate,
      queue,
      tunes,
      jest.fn(),
      { pathname: '/tunes' }
    )

    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    expect(navigate).not.toHaveBeenCalled()
  })

  test('resumePlaylistPlayback clears stopAfterCurrent so the playlist can advance', async function() {
    const tunebook = makeMockTunebook()
    const tunes = {
      a: makeTune('a'),
      b: makeTune('b'),
    }
    const queue = Object.assign(
      createQueue({ tuneIds: ['a', 'b'], currentIndex: 0 }),
      { stopAfterCurrent: true }
    )
    const mediaController = makeMockMediaController(tunes.a, {
      canResumePlayback: function() { return true },
      playFromUserGesture: jest.fn(),
    })
    let updatedQueue = null

    resumePlaylistPlayback(
      mediaController,
      tunebook,
      jest.fn(),
      queue,
      tunes,
      function(q) { updatedQueue = q },
      { pathname: '/tunes/a' }
    )

    expect(updatedQueue).toEqual(expect.objectContaining({
      currentIndex: 0,
      stopAfterCurrent: false,
      items: [
        expect.objectContaining({ tuneId: 'a' }),
        expect.objectContaining({ tuneId: 'b' }),
      ],
    }))
    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    expect(mediaController.playFromUserGesture).toHaveBeenCalled()
  })

  test('stops playlist when no playable tunes remain', async function() {
    const tunebook = makeMockTunebook()
    const tunes = { empty: makeTune('empty', { notes: '', links: [] }) }
    const queue = createQueue({ tuneIds: ['empty'], currentIndex: 0 })
    const calls = []
    const mediaController = {
      canResumePlayback: function() { return false },
      abortPlayingIntent: function() { calls.push('abort') },
      pause: function() { calls.push('pause') },
      setIsLoading: function(v) { calls.push('loading:' + v) },
      setIsPlaying: function(v) { calls.push('playing:' + v) },
      setIsReady: function(v) { calls.push('ready:' + v) },
    }

    resumePlaylistPlayback(mediaController, tunebook, null, queue, tunes, jest.fn())
    await new Promise(function(resolve) { setTimeout(resolve, 0) })
    expect(calls).toEqual(['abort', 'pause', 'loading:false', 'playing:false', 'ready:false'])
  })
})
