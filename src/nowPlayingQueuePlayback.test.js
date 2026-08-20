import { createQueue, setFollowTune, setRepeatMode } from './nowPlayingQueue'
import {
  shouldMusicSingleOwnPlayback,
  shouldMusicSingleMountMediaEngine,
  shouldMusicSingleOwnMidiEngine,
  shouldNowPlayingHostOwnPlayback,
  parseTunePagePlaybackFromUrl,
  isViewingDifferentFromPlaying,
  resolveHostPlayingTune,
  resolveHostPlayingTuneId,
  playQueueItem,
  handleQueueAdvanceOnEnded,
  resolveQueueTune,
  resolveQueueTunesMap,
} from './nowPlayingQueuePlayback'

describe('nowPlayingQueuePlayback', function() {
  const queue = createQueue({ tuneIds: ['playing', 'other'] })

  test('isViewingDifferentFromPlaying requires both tune ids', function() {
    expect(isViewingDifferentFromPlaying(null, queue)).toBe(false)
    expect(isViewingDifferentFromPlaying('other', queue)).toBe(true)
    expect(isViewingDifferentFromPlaying('playing', queue)).toBe(false)
  })

  test('resolveHostPlayingTuneId prefers viewed tune on playMidi URL', function() {
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: { tune: { id: 'playing' }, canResumePlayback: function() { return true } },
      viewedTuneId: 'other',
      pathname: '/tunes/other/playMidi',
    })).toBe('other')
  })

  test('resolveHostPlayingTune prefers mediaController tune when ids match', function() {
    const storeTune = {
      id: 't1',
      links: [],
    }
    const controllerTune = {
      id: 't1',
      links: [{ link: 'abcbook-recording:new', mediaKind: 'midi' }],
    }
    expect(resolveHostPlayingTune('t1', { t1: storeTune }, { tune: controllerTune })).toBe(controllerTune)
    expect(resolveHostPlayingTune('t1', { t1: storeTune }, {})).toBe(storeTune)
  })

  test('resolveHostPlayingTuneId prefers viewed tune when queue paused on different tune', function() {
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: { canResumePlayback: function() { return true } },
      viewedTuneId: 'other',
      pathname: '/tunes/other',
    })).toBe('other')
  })

  test('resolveHostPlayingTuneId keeps queue tune while actively playing', function() {
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: { isPlaying: true },
      viewedTuneId: 'other',
      pathname: '/tunes/other',
    })).toBe('playing')
  })

  test('resolveHostPlayingTuneId keeps queue tune when controller matches queue during stall', function() {
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: {
        tune: { id: 'playing' },
        isPlaying: false,
        isLoading: false,
        hasActivePlaybackIntent: function() { return false },
      },
      viewedTuneId: 'other',
      pathname: '/tunes/other',
    })).toBe('playing')
  })

  test('resolveHostPlayingTuneId prefers viewed tune when starting playback on different queue item', function() {
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: {
        tune: { id: 'other' },
        hasActivePlaybackIntent: function() { return true },
      },
      viewedTuneId: 'other',
      pathname: '/tunes/other/playMedia/0',
    })).toBe('other')
  })

  test('shouldNowPlayingHostOwnPlayback mounts for playMidi on different tune while queue paused', function() {
    const tunes = {
      playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] },
      other: { id: 'other', notes: 'CDEF' },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: queue,
      mediaController: { canResumePlayback: function() { return true } },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other/playMidi',
      tunes: tunes,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback does not mount for idle paused queue on different tune page', function() {
    const tunes = {
      playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] },
      other: { id: 'other', notes: 'CDEF' },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: queue,
      mediaController: { canResumePlayback: function() { return true } },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: tunes,
    })).toBe(false)
  })

  test('shouldNowPlayingHostOwnPlayback mounts for midi start on viewed tune page without playMidi URL', function() {
    const tunes = {
      playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] },
      other: { id: 'other', notes: 'CDEF', links: [{ link: 'https://youtu.be/y' }] },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: queue,
      mediaController: {
        isLoading: true,
        tune: tunes.other,
        hasActivePlaybackIntent: function() { return true },
        playbackRouteMode: 'midi',
        requestedPlayState: 'playMidi',
        isMidiPlaybackRoute: function() { return true },
        isMediaPlaybackRoute: function() { return false },
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: tunes,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback mounts for expanded mini player on idle tune page', function() {
    const tunes = {
      other: { id: 'other', notes: 'CDEF', links: [{ link: 'https://youtu.be/y' }] },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: null,
      mediaController: { tune: tunes.other },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: tunes,
      nowPlayingExpanded: true,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback stays mounted for active midi on expanded tune page', function() {
    const tunes = {
      other: { id: 'other', notes: 'CDEF', links: [{ link: 'https://youtu.be/y' }] },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: null,
      mediaController: {
        tune: tunes.other,
        isPlaying: true,
        requestedPlayState: 'playMidi',
        playbackRouteMode: 'midi',
        isMidiPlaybackRoute: function() { return true },
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: tunes,
      nowPlayingExpanded: true,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback stays mounted when controller tune not in store yet', function() {
    const controllerTune = { id: 'other', notes: 'CDEF', links: [] }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'other',
      queue: null,
      mediaController: {
        tune: controllerTune,
        isPlaying: true,
        requestedPlayState: 'playMidi',
        playbackRouteMode: 'midi',
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/other',
      tunes: {},
      nowPlayingExpanded: true,
    })).toBe(true)
  })

  test('shouldNowPlayingHostOwnPlayback does not mount on books page for idle route mode only', function() {
    const tunes = {
      playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] },
    }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: null,
      queue: null,
      mediaController: {
        tune: tunes.playing,
        playbackRouteMode: 'media',
        hasActivePlaybackIntent: function() { return false },
        canResumePlayback: function() { return false },
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/books',
      tunes: tunes,
    })).toBe(false)
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

  test('shouldNowPlayingHostOwnPlayback mounts from controller tune when not in tunes store', function() {
    const controllerTune = { id: 'abc', notes: ['C'], links: [] }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'abc',
      queue: null,
      mediaController: { tune: controllerTune },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/abc/playMidi',
      tunes: {},
    })).toBe(true)
  })

  test('resolveHostPlayingTuneId reads tune id from pathname when viewedTuneId missing', function() {
    expect(resolveHostPlayingTuneId({
      queue: null,
      mediaController: {},
      viewedTuneId: null,
      pathname: '/tunes/abc/playMidi',
    })).toBe('abc')
  })

  test('resolveHostPlayingTuneId follows queue item on playMedia URL during playlist', function() {
    const queue = createQueue({ tuneIds: ['first', 'second'], currentIndex: 1 })
    expect(resolveHostPlayingTuneId({
      queue: queue,
      mediaController: { isLoading: true, hasActivePlaybackIntent: function() { return true } },
      viewedTuneId: 'first',
      pathname: '/tunes/first/playMedia/0',
    })).toBe('second')
  })

  test('resolveHostPlayingTuneId still uses playMedia URL when no queue is active', function() {
    expect(resolveHostPlayingTuneId({
      queue: null,
      mediaController: { isPlaying: true },
      viewedTuneId: 'abc',
      pathname: '/tunes/abc/playMedia/0',
    })).toBe('abc')
  })

  test('shouldMusicSingleOwnMidiEngine only for preview-once', function() {
    expect(shouldMusicSingleOwnMidiEngine('abc', null)).toBe(false)
    expect(shouldMusicSingleOwnMidiEngine('abc', null, { hostOwnsPlayback: false })).toBe(false)
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

  test('shouldNowPlayingHostOwnPlayback yields to notation editor midi owner when idle', function() {
    const tunes = { playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] } }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'playing',
      queue: queue,
      mediaController: {
        isPlaying: false,
        isLoading: false,
        notationMidiOwner: true,
        tune: tunes.playing,
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/playing/playMidi',
      tunes: tunes,
    })).toBe(false)
  })

  test('shouldNowPlayingHostOwnPlayback stays mounted when notation preview and playlist both active', function() {
    const tunes = { playing: { id: 'playing', links: [{ link: 'https://youtu.be/x' }] } }
    expect(shouldNowPlayingHostOwnPlayback({
      viewedTuneId: 'playing',
      queue: queue,
      mediaController: {
        isPlaying: true,
        notationMidiOwner: true,
        tune: tunes.playing,
        requestedPlayState: 'playMedia',
      },
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/playing/playMedia/0',
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

  test('shouldMusicSingleMountMediaEngine does not mount an idle single-view engine', function() {
    const tunes = { t1: { id: 't1', links: [{ link: 'https://artist.bandcamp.com/track/foo' }] } }
    expect(shouldMusicSingleMountMediaEngine({
      viewedTuneId: 't1',
      queue: { items: [] },
      mediaController: {},
      practiceSessionActive: false,
      gigModeActive: false,
      pathname: '/tunes/t1',
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

  test('resolveQueueTunesMap prefers explicit tunes over tunebook entries', function() {
    const merged = resolveQueueTunesMap(
      { a: { id: 'a', name: 'Explicit' } },
      { tunes: { a: { id: 'a', name: 'Book' }, b: { id: 'b' } } }
    )
    expect(merged.a.name).toBe('Explicit')
    expect(merged.b.id).toBe('b')
  })

  test('resolveQueueTune finds freshly materialized mymedia tunes', function() {
    const tune = resolveQueueTune({}, { tunes: { c: { id: 'c', links: [{ link: '/music-collection/c.mp3' }] } } }, 'c')
    expect(tune && tune.id).toBe('c')
  })

  test('playQueueItem defers midi engine start and commits playMidi', function() {
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const tune = { id: 'midi-tune', notes: 'CDEF' }
    const tunebook = {
      hasNotesOrChords: function() { return true },
      hasLinks: function() { return false },
    }
    const ok = playQueueItem(mediaController, tunebook, tune, { tuneId: 'midi-tune' }, {
      deferPlaybackEngine: true,
    })
    expect(ok).toBe(true)
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
    expect(mediaController.setMediaLinkNumber).toHaveBeenCalledWith(null)
    expect(mediaController.applyPlaybackRoute).toHaveBeenCalledWith(
      'playMidi',
      null,
      tune,
      tunebook
    )
    expect(mediaController.play).not.toHaveBeenCalled()
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

  test('playQueueItem arms playback intent before committing the next tune', function() {
    const callOrder = []
    const mediaController = {
      setTune: jest.fn(function() { callOrder.push('setTune') }),
      setMediaLinkNumber: jest.fn(function() { callOrder.push('setMediaLinkNumber') }),
      applyPlaybackRoute: jest.fn(function() { callOrder.push('applyPlaybackRoute') }),
      armPlaybackIntent: jest.fn(function() { callOrder.push('armPlaybackIntent') }),
      play: jest.fn(),
    }
    const tune = { id: 'b', links: [{ link: '/music-collection/b.mp3' }] }
    const tunebook = {
      hasNotesOrChords: function() { return false },
      hasLinks: function() { return true },
    }
    playQueueItem(mediaController, tunebook, tune, { tuneId: 'b', prefer: 'auto' }, {
      deferPlaybackEngine: true,
      fromUserGesture: true,
    })
    expect(callOrder[0]).toBe('armPlaybackIntent')
    expect(callOrder.indexOf('setTune')).toBeGreaterThan(0)
    expect(mediaController.armPlaybackIntent).toHaveBeenCalledWith({
      fresh: true,
      fromUserGesture: true,
    })
  })

  test('handleQueueAdvanceOnEnded starts midi after a media track', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      media: { id: 'media', links: [{ link: 'https://youtu.be/abc' }] },
      midi: { id: 'midi', notes: 'CDEF' },
    }
    const queue = createQueue({
      tuneIds: ['media', 'midi'],
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
    let updatedQueue = null
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: jest.fn(),
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(updatedQueue.currentIndex).toBe(1)
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.midi)
    expect(mediaController.setMediaLinkNumber).toHaveBeenCalledWith(null)
    expect(mediaController.applyPlaybackRoute).toHaveBeenCalledWith(
      'playMidi',
      null,
      tunes.midi,
      tunebook
    )
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
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

  test('handleQueueAdvanceOnEnded plays one later media link when the first is empty', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      first: { id: 'first', notes: 'CDEF' },
      mixed: {
        id: 'mixed',
        links: [
          { link: '' },
          { link: 'https://example.com/b.mp3' },
        ],
      },
    }
    const queue = createQueue({
      tuneIds: ['first', 'mixed'],
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
    let updatedQueue = null
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: jest.fn(),
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(updatedQueue.currentIndex).toBe(1)
    expect(updatedQueue.items[1].linkIndex).toBeUndefined()
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.mixed)
    expect(mediaController.setMediaLinkNumber).toHaveBeenCalledWith(1)
    expect(mediaController.applyPlaybackRoute).toHaveBeenCalledWith(
      'playMedia',
      '1',
      tunes.mixed,
      tunebook
    )
    expect(mediaController.armPlaybackIntent).toHaveBeenCalledTimes(1)
  })

  test('handleQueueAdvanceOnEnded replays current track in repeat-track mode', function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const queue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      repeatMode: 'track',
      autoAdvance: false,
    })
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
      playFromUserGesture: jest.fn(),
    }
    let updatedQueue = null
    const ok = handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: jest.fn(),
    })
    expect(ok).toBe(true)
    expect(updatedQueue.currentIndex).toBe(0)
    expect(mediaController.setTune).toHaveBeenCalledWith(tunes.a)
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
  })

  test('handleQueueAdvanceOnEnded stops after current when stopAfterCurrent is set', function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const queue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      autoAdvance: true,
    })
    queue.stopAfterCurrent = true
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const failCallback = jest.fn()
    let updatedQueue = null
    const ok = handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: failCallback,
    })
    expect(ok).toBe(false)
    expect(updatedQueue.items).toHaveLength(2)
    expect(updatedQueue.currentIndex).toBe(0)
    expect(updatedQueue.stopAfterCurrent).toBe(false)
    expect(failCallback).toHaveBeenCalled()
    expect(mediaController.armPlaybackIntent).not.toHaveBeenCalled()
  })

  test('handleQueueAdvanceOnEnded does not repeat when repeat was turned off before track end', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const staleQueue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      repeatMode: 'track',
      autoAdvance: true,
    })
    const liveQueue = setRepeatMode(staleQueue, 'off')
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
    let updatedQueue = null
    const ok = handleQueueAdvanceOnEnded({
      queue: staleQueue,
      getLatestQueue: function() { return liveQueue },
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      failCallback: jest.fn(),
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(ok).toBe(true)
    expect(updatedQueue).not.toBeNull()
    expect(updatedQueue.currentIndex).toBe(1)
    expect(updatedQueue.repeatMode).toBe('off')
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
  })

  test('handleQueueAdvanceOnEnded does not navigate when follow is off', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const queue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      followTune: false,
      autoAdvance: true,
    })
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const navigate = jest.fn()
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: jest.fn(),
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      navigate: navigate,
      location: { pathname: '/tunes/a/playMedia/0' },
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(mediaController.armPlaybackIntent).toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('handleQueueAdvanceOnEnded navigates when follow is on', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const queue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      followTune: true,
      autoAdvance: true,
    })
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const navigate = jest.fn()
    handleQueueAdvanceOnEnded({
      queue: queue,
      setQueue: jest.fn(),
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      navigate: navigate,
      location: { pathname: '/tunes/a/playMedia/0' },
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(navigate).toHaveBeenCalledWith('/tunes/b/playMedia/0')
  })

  test('handleQueueAdvanceOnEnded keeps the page when follow was turned off before track end', async function() {
    const tunebook = {
      hasNotesOrChords: function(tune) { return !!(tune && tune.notes) },
      hasLinks: function(tune) { return !!(tune && tune.links && tune.links.length > 0) },
    }
    const tunes = {
      a: { id: 'a', notes: 'CDEF', links: [{ link: 'https://example.com/a.mp3' }] },
      b: { id: 'b', notes: 'GABc', links: [{ link: 'https://example.com/b.mp3' }] },
    }
    const staleQueue = createQueue({
      tuneIds: ['a', 'b'],
      currentIndex: 0,
      followTune: true,
      autoAdvance: true,
    })
    const liveQueue = setFollowTune(staleQueue, false)
    const mediaController = {
      setTune: jest.fn(),
      setMediaLinkNumber: jest.fn(),
      applyPlaybackRoute: jest.fn(),
      armPlaybackIntent: jest.fn(),
      play: jest.fn(),
    }
    const navigate = jest.fn()
    let updatedQueue = null
    handleQueueAdvanceOnEnded({
      queue: staleQueue,
      getLatestQueue: function() { return liveQueue },
      setQueue: function(q) { updatedQueue = q },
      tunes: tunes,
      tunebook: tunebook,
      mediaController: mediaController,
      navigate: navigate,
      location: { pathname: '/tunes/a/playMedia/0' },
    })
    await new Promise(function(resolve) { setTimeout(resolve, 50) })
    expect(updatedQueue).not.toBeNull()
    expect(updatedQueue.followTune).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
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
