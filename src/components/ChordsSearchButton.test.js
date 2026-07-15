/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ChordsSearchButton from './ChordsSearchButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockStartSearch = jest.fn()

jest.mock('../useMediaResolverHealth', function() {
  return function useMediaResolverHealth() {
    return { available: true }
  }
})

jest.mock('../useAbcjsParser', function() {
  return function useAbcjsParser() {
    return { renderChords: function() { return '' } }
  }
})

jest.mock('../useFieldLookupSearchJob', function() {
  return {
    useFieldLookupSearchJob: function() {
      return {
        busy: false,
        progressPercent: 0,
        progressMessage: '',
        activeJob: null,
        startSearch: mockStartSearch,
        cancel: jest.fn(),
      }
    },
  }
})

jest.mock('./FieldLookupButtonGroup', function() {
  const React = require('react')
  return {
    FieldLookupButtonGroup: function(props) {
      return React.createElement('div', null,
        React.createElement('button', {
          type: 'button',
          'data-testid': 'search-auto',
          onClick: function() { props.onSearch('auto') },
        }, 'Auto'),
        React.createElement('button', {
          type: 'button',
          'data-testid': 'search-review',
          onClick: function() { props.onSearch('review') },
        }, 'Review')
      )
    },
  }
})

describe('ChordsSearchButton overwrite confirm', function() {
  let container
  let root

  beforeEach(function() {
    mockStartSearch.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('Review search skips overwrite confirm and starts immediately', function() {
    act(function() {
      root.render(
        React.createElement(ChordsSearchButton, {
          tuneId: 't1',
          title: 'Song',
          artist: 'Artist',
          confirmOverwrite: true,
          forceUpdateLyrics: true,
          showLyricsCheckbox: false,
        })
      )
    })

    act(function() {
      container.querySelector('[data-testid="search-review"]').click()
    })

    expect(container.textContent).not.toContain('overwrite all existing notation')
    expect(mockStartSearch).toHaveBeenCalledTimes(1)
    expect(mockStartSearch.mock.calls[0][0].options.searchMode).toBe('review')
  })

  test('Auto search shows overwrite confirm before starting', function() {
    act(function() {
      root.render(
        React.createElement(ChordsSearchButton, {
          tuneId: 't1',
          title: 'Song',
          artist: 'Artist',
          confirmOverwrite: true,
          forceUpdateLyrics: true,
          showLyricsCheckbox: false,
        })
      )
    })

    act(function() {
      container.querySelector('[data-testid="search-auto"]').click()
    })

    expect(mockStartSearch).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Replace chords from search')
    expect(document.body.textContent).toContain('overwrite all existing notation')
  })
})
