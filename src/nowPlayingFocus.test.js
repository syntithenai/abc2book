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

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./components/RemoteOutputButton', function() {
  return function RemoteOutputButton() {
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
    },
    hasNotesOrChords: function() { return true },
    hasLinks: function() { return false },
    navigateToNextSong: jest.fn(),
    navigateToPreviousSong: jest.fn(),
  }
}

function makeMediaController() {
  return {
    tune: { id: 'queue-tune', name: 'Queue Tune' },
    isPlaying: true,
    isLoading: false,
    mediaLinkNumber: null,
    getSrc: jest.fn(),
    getSrcType: jest.fn(),
  }
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
})
