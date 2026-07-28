import {
  resolveHostPlaybackTarget,
  shouldSkipHostMidiRouteApply,
} from './playbackHostTarget'
import { setVoiceViewSettings } from './abcVoiceViewSettings'
import { SAMPLE_TUNE_IDS } from './devSeed/sampleTunebookAbc'

function makeTune(id, overrides) {
  return Object.assign({
    id: id,
    name: 'Test',
    links: [],
    notes: 'CDEF',
  }, overrides || {})
}

function makeTunebook() {
  return {
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.notes)
    },
  }
}

describe('resolveHostPlaybackTarget', function() {
  const tunebook = makeTunebook()
  const tune = makeTune(SAMPLE_TUNE_IDS.amazingGrace, {
    links: [
      { link: 'https://www.youtube.com/watch?v=abc' },
      { link: 'https://example.com/a.mp3' },
    ],
  })

  test('prefers playMedia URL over stale midi route state', function() {
    const mediaController = {
      requestedPlayState: 'playMidi',
      playbackRouteMode: 'midi',
      mediaLinkNumber: null,
      isMidiPlaybackRoute: function() { return true },
      isMediaPlaybackRoute: function() { return false },
    }
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      null,
      null,
      { playState: 'playMedia', mediaLinkNumber: '1' }
    )
    expect(target).toEqual({ type: 'media', linkNum: 1 })
  })

  test('prefers requested playMedia over stale midi playbackRouteMode', function() {
    const mediaController = {
      requestedPlayState: 'playMedia',
      playbackRouteMode: 'midi',
      mediaLinkNumber: 0,
      isMidiPlaybackRoute: function() { return false },
      isMediaPlaybackRoute: function() { return true },
    }
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      null,
      null,
      null
    )
    expect(target).toEqual({ type: 'media', linkNum: 0 })
  })

  test('prefers media ref route over stale midi playbackRouteMode', function() {
    const mediaController = {
      requestedPlayState: null,
      playbackRouteMode: 'midi',
      mediaLinkNumber: 0,
      isMidiPlaybackRoute: function() { return false },
      isMediaPlaybackRoute: function() { return true },
    }
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      null,
      null,
      null
    )
    expect(target).toEqual({ type: 'media', linkNum: 0 })
  })

  test('active playback intent prefers media when tune has links', function() {
    const mediaController = {
      requestedPlayState: null,
      playbackRouteMode: 'none',
      mediaLinkNumber: null,
      isMidiPlaybackRoute: function() { return false },
      isMediaPlaybackRoute: function() { return false },
      hasActivePlaybackIntent: function() { return true },
    }
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      null,
      null,
      null
    )
    expect(target).toEqual({ type: 'media', linkNum: 0 })
  })

  test('ignores queue item when playing tune differs from current queue item', function() {
    const mediaController = {
      requestedPlayState: 'playMidi',
      playbackRouteMode: 'midi',
      mediaLinkNumber: null,
      isMidiPlaybackRoute: function() { return true },
      isMediaPlaybackRoute: function() { return false },
    }
    const queue = { items: [{ tuneId: 'other', prefer: 'auto' }], currentIndex: 0 }
    const otherTune = makeTune('other', { notes: 'CDEF' })
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      queue,
      queue.items[0],
      { playState: 'playMidi', mediaLinkNumber: '0' },
      {
        isQueueActive: function() { return true },
        resolvePlaybackForItem: function() { return { type: 'media', linkNum: 0 } },
      }
    )
    expect(target).toEqual({ type: 'midi' })
  })

  test('prefers explicit midi route over queue item on same tune', function() {
    const mediaController = {
      requestedPlayState: 'playMidi',
      playbackRouteMode: 'midi',
      mediaLinkNumber: null,
      isMidiPlaybackRoute: function() { return true },
      isMediaPlaybackRoute: function() { return false },
    }
    const queueItem = { tuneId: tune.id, prefer: 'auto' }
    const queue = { items: [queueItem], currentIndex: 0 }
    const target = resolveHostPlaybackTarget(
      mediaController,
      tune,
      tunebook,
      queue,
      queueItem,
      null,
      {
        isQueueActive: function() { return true },
        resolvePlaybackForItem: function() { return { type: 'media', linkNum: 0 } },
      }
    )
    expect(target).toEqual({ type: 'midi' })
  })
})

describe('shouldSkipHostMidiRouteApply', function() {
  test('skips when user requested media', function() {
    expect(shouldSkipHostMidiRouteApply({
      requestedPlayState: 'playMedia',
      isMediaPlaybackRoute: function() { return false },
    })).toBe(true)
  })

  test('skips when media route ref is active', function() {
    expect(shouldSkipHostMidiRouteApply({
      requestedPlayState: null,
      isMediaPlaybackRoute: function() { return true },
    })).toBe(true)
  })

  test('does not skip for midi-only route', function() {
    expect(shouldSkipHostMidiRouteApply({
      requestedPlayState: 'playMidi',
      isMediaPlaybackRoute: function() { return false },
    })).toBe(false)
  })

  test('skips when notation editor owns midi', function() {
    expect(shouldSkipHostMidiRouteApply({
      notationMidiOwner: true,
      requestedPlayState: 'playMidi',
      isMediaPlaybackRoute: function() { return false },
    })).toBe(true)
  })
})
