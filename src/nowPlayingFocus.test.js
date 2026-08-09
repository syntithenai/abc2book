/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'
import * as playbackNavigationUtils from './playbackNavigationUtils'
import MediaPlayerOptionsModal from './components/MediaPlayerOptionsModal'
import NowPlayingTransportBar from './components/NowPlayingTransportBar'
import NowPlayingPage from './pages/NowPlayingPage'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./components/RemoteOutputButton', function() {
  return function RemoteOutputButton() {
    return null
  }
})

jest.mock('./components/MediaPlaybackSettingsTabs', function() {
  return function MediaPlaybackSettingsTabs() {
    return null
  }
})

jest.mock('./components/MediaSourcePlaybackButtons', function() {
  return function MediaSourcePlaybackButtons() {
    return null
  }
})

jest.mock('./components/PlaybackVolumeSlider', function() {
  return function PlaybackVolumeSlider() {
    return null
  }
})

jest.mock('./components/TuneArtwork', function() {
  return function TuneArtwork() {
    return null
  }
})

function makeTunebook() {
  return {
    icons: {
      dropdown: '▼',
      fullscreen: '⛶',
      play: '▶',
      pause: '⏸',
      waiting: '…',
      previous: '⏮',
      next: '⏭',
      volume: '🔊',
      close: '✕',
    },
    hasNotesOrChords: function() { return true },
    hasLinks: function() { return false },
    navigateToNextSong: jest.fn(),
    navigateToPreviousSong: jest.fn(),
  }
}

function makeMediaController(overrides) {
  return Object.assign({
    tune: { id: 'queue-tune', name: 'Queue Tune' },
    isPlaying: true,
    isLoading: false,
    mediaLinkNumber: null,
    duration: 100,
    currentTime: 10,
    getPlaybackProgress: function() {
      return { currentTime: 10, duration: 100, ratio: 0.1 }
    },
    getSrc: jest.fn(),
    getSrcType: jest.fn(),
  }, overrides || {})
}

describe('now playing focus entry points', function() {
  let container
  let root
  let miniPlayerSpy

  beforeEach(function() {
    miniPlayerSpy = jest.spyOn(playbackNavigationUtils, 'isMiniPlayerTransportVisible')
      .mockReturnValue(true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    miniPlayerSpy.mockRestore()
    act(function() { root.unmount() })
    container.remove()
  })

  test('navbar dropdown opens viewed-focus fullscreen on a tune page', function() {
    const onOpenNowPlaying = jest.fn()
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/tunes/viewed-tune'] },
          React.createElement(MediaPlayerOptionsModal, {
            mediaController: makeMediaController(),
            tunebook: makeTunebook(),
            tunes: {
              'viewed-tune': { id: 'viewed-tune', name: 'Viewed Tune', notes: 'CDEF' },
            },
            nowPlayingQueue: { items: [{ tuneId: 'queue-tune' }], currentIndex: 0 },
            onOpenNowPlaying: onOpenNowPlaying,
          })
        )
      )
    })

    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    act(function() {
      button.click()
    })
    expect(onOpenNowPlaying).toHaveBeenCalledWith('viewed')
  })

  test('navbar dropdown opens playlist focus when no viewed tune is available', function() {
    const onOpenNowPlaying = jest.fn()
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/books'] },
          React.createElement(MediaPlayerOptionsModal, {
            mediaController: makeMediaController(),
            tunebook: makeTunebook(),
            tunes: {},
            nowPlayingQueue: { items: [{ tuneId: 'queue-tune' }], currentIndex: 0 },
            onOpenNowPlaying: onOpenNowPlaying,
          })
        )
      )
    })

    const button = container.querySelector('button')
    act(function() {
      button.click()
    })
    expect(onOpenNowPlaying).toHaveBeenCalledWith('playlist')
  })

  test('miniplayer fullscreen opens playlist focus', function() {
    const onOpenNowPlaying = jest.fn()
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/tunes/queue-tune'] },
          React.createElement(NowPlayingTransportBar, {
            nowPlayingQueue: { items: [{ tuneId: 'queue-tune' }], currentIndex: 0 },
            setNowPlayingQueue: jest.fn(),
            tunebook: makeTunebook(),
            tunes: {
              'queue-tune': { id: 'queue-tune', name: 'Queue Tune' },
            },
            mediaController: makeMediaController(),
            gigModeActive: false,
            setQueuePlayConfirm: jest.fn(),
            nowPlayingExpanded: false,
            onNowPlayingExpandedChange: jest.fn(),
            onOpenNowPlaying: onOpenNowPlaying,
          })
        )
      )
    })

    const fullscreenButton = container.querySelector('[data-testid="now-playing-expand-button"]')
    expect(fullscreenButton).toBeTruthy()
    act(function() {
      fullscreenButton.click()
    })
    expect(onOpenNowPlaying).toHaveBeenCalledWith('playlist')
  })

  test('viewed-focus fullscreen keeps playlist prev/next beside play', function() {
    const tunebook = makeTunebook()
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/tunes/viewed-tune'] },
          React.createElement(NowPlayingPage, {
            mediaController: makeMediaController(),
            tunebook: tunebook,
            tunes: {
              'viewed-tune': { id: 'viewed-tune', name: 'Viewed Tune', notes: 'CDEF' },
              'queue-tune': { id: 'queue-tune', name: 'Queue Tune', notes: 'GABc' },
            },
            nowPlayingQueue: {
              items: [{ tuneId: 'queue-tune' }, { tuneId: 'viewed-tune' }],
              currentIndex: 0,
            },
            setNowPlayingQueue: jest.fn(),
            setQueuePlayConfirm: jest.fn(),
            returnPath: '/tunes/viewed-tune',
            nowPlayingFocus: 'viewed',
            viewedTuneId: 'viewed-tune',
            onClose: jest.fn(),
          })
        )
      )
    })

    expect(container.querySelector('[data-testid="now-playing-previous-button"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="now-playing-next-button"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="now-playing-previous-button"]').className).toMatch(/btn-primary/)
    expect(container.querySelector('[data-testid="now-playing-next-button"]').className).toMatch(/btn-primary/)

    act(function() {
      container.querySelector('[data-testid="now-playing-next-button"]').click()
    })

    expect(tunebook.navigateToNextSong).toHaveBeenCalledWith(
      'queue-tune',
      null,
      expect.any(Function),
      '/tunes/viewed-tune',
      expect.objectContaining({ useQueueNavigation: true, startPlayback: true })
    )
  })

  test('playlist-focus fullscreen play button shows pause while playing', function() {
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/books'] },
          React.createElement(NowPlayingPage, {
            mediaController: makeMediaController(),
            tunebook: makeTunebook(),
            tunes: {
              'queue-tune': { id: 'queue-tune', name: 'Queue Tune', notes: 'CDEF' },
            },
            nowPlayingQueue: {
              items: [{ tuneId: 'queue-tune' }],
              currentIndex: 0,
            },
            setNowPlayingQueue: jest.fn(),
            setQueuePlayConfirm: jest.fn(),
            returnPath: '/books',
            nowPlayingFocus: 'playlist',
            onClose: jest.fn(),
          })
        )
      )
    })

    expect(container.querySelector('[data-testid="now-playing-pause-button"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="now-playing-play-button"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="media-seek-slider"]')).toBeTruthy()
  })

  test('playlist-focus fullscreen play button shows waiting while loading', function() {
    const mediaController = makeMediaController({ isPlaying: false, isLoading: true })
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/books'] },
          React.createElement(NowPlayingPage, {
            mediaController: mediaController,
            tunebook: makeTunebook(),
            tunes: {
              'queue-tune': { id: 'queue-tune', name: 'Queue Tune', notes: 'CDEF' },
            },
            nowPlayingQueue: {
              items: [{ tuneId: 'queue-tune' }],
              currentIndex: 0,
            },
            setNowPlayingQueue: jest.fn(),
            setQueuePlayConfirm: jest.fn(),
            returnPath: '/books',
            nowPlayingFocus: 'playlist',
            onClose: jest.fn(),
          })
        )
      )
    })

    expect(container.querySelector('[data-testid="now-playing-waiting-button"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="now-playing-play-button"]')).toBeFalsy()
  })

  test('playlist-focus fullscreen play button reflects playback without engine tune id', function() {
    const mediaController = makeMediaController({
      tune: null,
      isPlaying: true,
      isLoading: false,
    })
    act(function() {
      root.render(
        React.createElement(MemoryRouter, { initialEntries: ['/books'] },
          React.createElement(NowPlayingPage, {
            mediaController: mediaController,
            tunebook: makeTunebook(),
            tunes: {
              'queue-tune': { id: 'queue-tune', name: 'Queue Tune', notes: 'CDEF' },
            },
            nowPlayingQueue: {
              items: [{ tuneId: 'queue-tune' }],
              currentIndex: 0,
            },
            setNowPlayingQueue: jest.fn(),
            setQueuePlayConfirm: jest.fn(),
            returnPath: '/books',
            nowPlayingFocus: 'playlist',
            onClose: jest.fn(),
          })
        )
      )
    })

    expect(container.querySelector('[data-testid="now-playing-pause-button"]')).toBeTruthy()
  })
})
