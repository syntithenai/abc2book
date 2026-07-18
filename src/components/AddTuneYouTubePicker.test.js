/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AddTuneYouTubePicker from './AddTuneYouTubePicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../youtubeSearchClient', function() {
  return {
    searchYouTubeVideos: jest.fn(),
  }
})

const { searchYouTubeVideos } = require('../youtubeSearchClient')

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
    searchYouTubeVideos.mockResolvedValue({
      candidates: [
        { title: 'First', link: 'https://youtu.be/1' },
        { title: 'Second', link: 'https://youtu.be/2' },
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
})
