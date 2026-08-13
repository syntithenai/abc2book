/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import NowPlayingQueueManager from './NowPlayingQueueManager'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockNavigate = jest.fn()
const mockPlayQueueItem = jest.fn()
const mockNavigateToQueueTune = jest.fn()

jest.mock('react-router-dom', function() {
  return {
    useNavigate: function() {
      return mockNavigate
    },
  }
})

jest.mock('react-bootstrap', function() {
  const React = require('react')
  function Button(props) {
    return React.createElement('button', {
      type: 'button',
      className: props.className,
      onClick: props.onClick,
      title: props.title,
      disabled: !!props.disabled,
      'data-testid': props['data-testid'],
    }, props.children)
  }
  function ListGroup(props) {
    return React.createElement('div', null, props.children)
  }
  ListGroup.Item = function Item(props) {
    return React.createElement('div', {
      className: props.className,
      style: props.style,
    }, props.children)
  }
  return { Button: Button, ListGroup: ListGroup }
})

jest.mock('./VoiceFillInput', function() {
  return function VoiceFillInput() {
    return null
  }
})

jest.mock('../mediaLinkPlaybackButton', function() {
  return {
    resolveMediaLinkPlaybackButton: function() {
      return { variant: 'secondary', className: '', label: 'Media', iconKey: 'play' }
    },
    mediaLinkPlaybackIcon: function() {
      return 'media'
    },
  }
})

jest.mock('../lessonYoutubePlayer', function() {
  return {
    playLessonYoutube: jest.fn(),
  }
})

jest.mock('../nowPlayingQueuePlayback', function() {
  return {
    playQueueItem: function() {
      return mockPlayQueueItem.apply(null, arguments)
    },
    navigateToQueueTune: function() {
      return mockNavigateToQueueTune.apply(null, arguments)
    },
  }
})

jest.mock('../mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: false, status: { available: false } }
    }),
    getActiveResolverAccessToken: jest.fn(function() { return '' }),
    subscribeMediaResolverHealth: jest.fn(function() {
      return function() {}
    }),
  }
})

jest.mock('../playlistPlaybackResilience', function() {
  return {
    getResolverProxiedMediaPlayBlock: jest.fn(function() {
      return Promise.resolve(null)
    }),
  }
})

describe('NowPlayingQueueManager', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockNavigate.mockReset()
    mockPlayQueueItem.mockReset()
    mockNavigateToQueueTune.mockReset()
    const resilience = require('../playlistPlaybackResilience')
    resilience.getResolverProxiedMediaPlayBlock.mockReset()
    resilience.getResolverProxiedMediaPlayBlock.mockResolvedValue(null)
    const healthStore = require('../mediaResolverHealthStore')
    healthStore.getMediaResolverHealthState.mockReset()
    healthStore.getMediaResolverHealthState.mockReturnValue({
      checked: true,
      available: false,
      status: { available: false },
    })
    healthStore.getActiveResolverAccessToken.mockReset()
    healthStore.getActiveResolverAccessToken.mockReturnValue('')
    healthStore.subscribeMediaResolverHealth.mockReset()
    healthStore.subscribeMediaResolverHealth.mockImplementation(function() {
      return function() {}
    })
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('clicking a tune name jumps queue playback to that item', function() {
    const setNowPlayingQueue = jest.fn()
    const handleClose = jest.fn()
    const mediaController = {
      preparePlaybackFromUserGesture: jest.fn(),
    }
    const tunebook = {
      hasNotesOrChords: function() { return true },
      icons: {
        play: '▶',
        music: '♪',
        deletebin: '✕',
      },
      utils: {
        isYoutubeLink: function() { return false },
      },
    }
    const tunes = {
      one: {
        id: 'one',
        name: 'First Tune',
        notes: 'CDEF',
        links: [],
      },
      two: {
        id: 'two',
        name: 'Second Tune',
        notes: 'GABc',
        links: [],
      },
    }
    const queue = {
      items: [{ tuneId: 'one' }, { tuneId: 'two' }],
      currentIndex: 0,
    }

    act(function() {
      root.render(React.createElement(NowPlayingQueueManager, {
        tunebook: tunebook,
        nowPlayingQueue: queue,
        setNowPlayingQueue: setNowPlayingQueue,
        tunes: tunes,
        mediaController: mediaController,
        handleClose: handleClose,
      }))
    })

    const nameButton = Array.from(container.querySelectorAll('button')).find(function(node) {
      return (node.textContent || '').indexOf('Second Tune') >= 0
    })
    expect(nameButton).toBeTruthy()

    act(function() {
      nameButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mediaController.preparePlaybackFromUserGesture).toHaveBeenCalledTimes(1)
    expect(mockPlayQueueItem).toHaveBeenCalledTimes(1)
    expect(mockPlayQueueItem.mock.calls[0][2]).toEqual(expect.objectContaining({ id: 'two' }))
    expect(mockNavigateToQueueTune).toHaveBeenCalledTimes(1)
    expect(setNowPlayingQueue).toHaveBeenCalledTimes(1)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  test('disables media play buttons for uncached library links when logged out', async function() {
    const resilience = require('../playlistPlaybackResilience')
    resilience.getResolverProxiedMediaPlayBlock.mockImplementation(function(tune, linkIndex) {
      if (tune && tune.id === 'lib' && linkIndex === 0) {
        return Promise.resolve({
          kind: 'login',
          message: 'Log in to play this library link',
        })
      }
      return Promise.resolve(null)
    })

    const setNowPlayingQueue = jest.fn()
    const tunebook = {
      hasNotesOrChords: function() { return false },
      icons: {
        play: '▶',
        music: '♪',
        deletebin: '✕',
      },
      utils: {
        isYoutubeLink: function() { return false },
      },
    }
    const tunes = {
      lib: {
        id: 'lib',
        name: 'Library Tune',
        links: [{ link: 'https://resolver.example/music-collection/a.mp3' }],
      },
      direct: {
        id: 'direct',
        name: 'Direct Tune',
        links: [{ link: 'https://example.com/a.mp3' }],
      },
    }
    const queue = {
      items: [{ tuneId: 'lib' }, { tuneId: 'direct' }],
      currentIndex: 0,
    }

    await act(async function() {
      root.render(React.createElement(NowPlayingQueueManager, {
        tunebook: tunebook,
        nowPlayingQueue: queue,
        setNowPlayingQueue: setNowPlayingQueue,
        tunes: tunes,
      }))
    })

    await act(async function() {
      await Promise.resolve()
      await Promise.resolve()
    })

    const blocked = container.querySelector('[data-testid="playlist-media-play-0-0"]')
    const allowed = container.querySelector('[data-testid="playlist-media-play-1-0"]')
    expect(blocked).toBeTruthy()
    expect(allowed).toBeTruthy()
    expect(blocked.disabled).toBe(true)
    expect(blocked.getAttribute('title')).toBe('Log in to play this library link')
    expect(allowed.disabled).toBe(false)

    act(function() {
      blocked.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockPlayQueueItem).not.toHaveBeenCalled()
  })
})
