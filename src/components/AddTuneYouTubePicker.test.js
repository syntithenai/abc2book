/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AddTuneYouTubePicker from './AddTuneYouTubePicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../mediaLinkSearchClient', function() {
  return {
    searchMediaLinks: jest.fn(),
    MAX_MEDIA_SEARCH_RESULTS: 50,
  }
})

jest.mock('../useMediaResolverHealth', function() {
  return function useMediaResolverHealth() {
    return {
      status: null,
      available: true,
      features: {},
      refreshMediaResolverHealth: jest.fn(),
    }
  }
})

jest.mock('./VoiceFillInput', function() {
  const React = require('react')
  return function VoiceFillInput(props) {
    return React.createElement('input', {
      value: props.value || '',
      'data-testid': props['data-testid'] || 'voice-fill-input',
      onChange: props.onChange,
      onBlur: props.onBlur,
      onFocus: props.onFocus,
    })
  }
})

jest.mock('../mediaSearchAccess', function() {
  return {
    __esModule: true,
    getMediaSearchAccess: function() {
      return { loginWarning: null, needsLogin: false }
    },
  }
})

const { searchMediaLinks } = require('../mediaLinkSearchClient')

describe('AddTuneYouTubePicker', function() {
  let container
  let root

  beforeEach(function() {
    jest.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  test('auto-selects the first result when enabled', async function() {
    const onChange = jest.fn()
    searchMediaLinks.mockResolvedValue({
      candidates: [
        { title: 'First', link: 'https://youtu.be/1', source: 'youtube' },
        { title: 'Second', link: 'https://resolver/music-collection/2.mp3', source: 'music-collection' },
      ],
    })

    await act(async function() {
      root.render(React.createElement(AddTuneYouTubePicker, {
        searchQuery: 'Song Writer',
        searchNonce: 1,
        autoSelectFirst: true,
        onChange: onChange,
        debounceMs: 0,
      }))
    })

    await act(async function() {
      jest.runAllTimers()
      await Promise.resolve()
    })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'First', link: 'https://youtu.be/1' })
    )
  })

  test('searches all media sources with the full result cap', async function() {
    searchMediaLinks.mockResolvedValue({ candidates: [] })

    await act(async function() {
      root.render(React.createElement(AddTuneYouTubePicker, {
        searchQuery: 'Song Writer',
        searchNonce: 1,
        debounceMs: 0,
      }))
    })

    await act(async function() {
      jest.runAllTimers()
      await Promise.resolve()
    })

    expect(searchMediaLinks).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Song Writer',
      maxResults: 50,
      maxTotalResults: 50,
    }))
  })
})
