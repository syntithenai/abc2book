import {
  isNavigatorOffline,
  playbackModeFromPathname,
  isTuneOfflinePlayable,
  findNextOfflinePlayableListIndex,
  advanceQueueToOfflinePlayable,
} from './offlinePlayback'
import { createQueue } from './nowPlayingQueue'

function isYoutubeLink(url) {
  return /youtu\.?be/.test(url)
}

const tunebook = {
  hasNotesOrChords: function(tune) {
    return !!(tune && tune.hasNotes)
  },
  hasLinks: function(tune) {
    return !!(tune && Array.isArray(tune.links) && tune.links.length > 0)
  },
}

describe('offlinePlayback', function() {
  const originalOnLine = navigator.onLine

  afterEach(function() {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    })
  })

  test('playbackModeFromPathname detects media and midi routes', function() {
    expect(playbackModeFromPathname('/tunes/1/playMedia/0')).toBe('media')
    expect(playbackModeFromPathname('/tunes/1/playMidi')).toBe('midi')
    expect(playbackModeFromPathname('/tunes/1')).toBe('auto')
  })

  test('isTuneOfflinePlayable allows everything when online', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    const tune = {
      id: 't1',
      hasNotes: true,
      links: [{ link: 'https://example.com/a.mp3' }],
    }
    await expect(isTuneOfflinePlayable(tune, { type: 'media', linkNum: 0 }, tunebook, isYoutubeLink)).resolves.toBe(true)
  })

  test('isTuneOfflinePlayable rejects remote media when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const tune = {
      id: 'uncached',
      links: [{ link: 'https://example.com/a.mp3' }],
    }
    await expect(isTuneOfflinePlayable(tune, { type: 'media', linkNum: 0 }, tunebook, isYoutubeLink)).resolves.toBe(false)
  })

  test('isTuneOfflinePlayable allows inline audio when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const tune = {
      id: 't1',
      links: [{ link: 'data:audio/mp3;base64,abc' }],
    }
    await expect(isTuneOfflinePlayable(tune, { type: 'media', linkNum: 0 }, tunebook, isYoutubeLink)).resolves.toBe(true)
  })

  test('isTuneOfflinePlayable allows midi when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const tune = { id: 't1', hasNotes: true, links: [] }
    await expect(isTuneOfflinePlayable(tune, { type: 'midi' }, tunebook, isYoutubeLink, 'midi')).resolves.toBe(true)
  })

  test('isTuneOfflinePlayable rejects chords-only midi when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const chordsTunebook = {
      hasNotesOrChords: function() { return true },
      hasNotes: function() { return false },
      hasLinks: function() { return false },
    }
    const tune = { id: 't1', links: [] }
    await expect(isTuneOfflinePlayable(tune, { type: 'midi' }, chordsTunebook, isYoutubeLink, 'midi')).resolves.toBe(false)
  })

  test('findNextOfflinePlayableListIndex skips uncached remote media when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const tunes = [
      { id: 'uncached', links: [{ link: 'https://example.com/a.mp3' }] },
      { id: 'inline', links: [{ link: 'data:audio/mp3;base64,abc' }] },
    ]
    const nextIndex = await findNextOfflinePlayableListIndex(
      tunes,
      0,
      1,
      null,
      tunebook,
      isYoutubeLink,
      'media'
    )
    expect(nextIndex).toBe(1)
  })

  test('isNavigatorOffline reflects navigator.onLine', function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(isNavigatorOffline()).toBe(true)
  })

  test('advanceQueueToOfflinePlayable skips uncached remote media when offline', async function() {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const queue = createQueue({
      tuneIds: ['uncached', 'inline'],
      currentIndex: 0,
    })
    const tunes = {
      uncached: { id: 'uncached', links: [{ link: 'https://example.com/a.mp3' }] },
      inline: { id: 'inline', links: [{ link: 'data:audio/mp3;base64,abc' }] },
    }
    const result = await advanceQueueToOfflinePlayable(queue, tunes, tunebook, isYoutubeLink, 'media')
    expect(result.atEnd).toBe(false)
    expect(result.tune.id).toBe('inline')
    expect(result.queue.currentIndex).toBe(1)
  })
})
