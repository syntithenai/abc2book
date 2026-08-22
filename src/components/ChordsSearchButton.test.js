/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import ChordsSearchButton from './ChordsSearchButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockStartSearch = jest.fn()
const mockChordsSearchJob = {
  failWithNetworkError: false,
  onError: null,
}

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
    useFieldLookupSearchJob: function(opts) {
      mockChordsSearchJob.onError = opts && opts.onError
      return {
        busy: false,
        progressPercent: 0,
        progressMessage: '',
        activeJob: null,
        startSearch: function() {
          mockStartSearch.apply(null, arguments)
          if (mockChordsSearchJob.failWithNetworkError && typeof mockChordsSearchJob.onError === 'function') {
            mockChordsSearchJob.onError({ error: 'Network Error' })
          }
        },
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

describe('ChordsSearchButton search', function() {
  let container
  let root

  beforeEach(function() {
    mockStartSearch.mockClear()
    mockChordsSearchJob.failWithNetworkError = false
    mockChordsSearchJob.onError = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('Auto search starts immediately without overwrite confirm', function() {
    act(function() {
      root.render(
        React.createElement(ChordsSearchButton, {
          tuneId: 't1',
          title: 'Song',
          artist: 'Artist',
          confirmOverwrite: true,
        })
      )
    })

    act(function() {
      container.querySelector('[data-testid="search-auto"]').click()
    })

    expect(document.body.textContent).not.toContain('Replace chords from search')
    expect(mockStartSearch).toHaveBeenCalledTimes(1)
    expect(mockStartSearch.mock.calls[0][0].options.searchMode).toBe('auto')
  })

  test('Review search starts immediately', function() {
    act(function() {
      root.render(
        React.createElement(ChordsSearchButton, {
          tuneId: 't1',
          title: 'Song',
          artist: 'Artist',
          confirmOverwrite: true,
        })
      )
    })

    act(function() {
      container.querySelector('[data-testid="search-review"]').click()
    })

    expect(mockStartSearch).toHaveBeenCalledTimes(1)
    expect(mockStartSearch.mock.calls[0][0].options.searchMode).toBe('review')
  })

  test('network errors show needs-internet copy while offline, not start-the-resolver', function() {
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    mockChordsSearchJob.failWithNetworkError = true
    try {
      act(function() {
        root.render(
          React.createElement(ChordsSearchButton, {
            tuneId: 't1',
            title: 'Song',
            artist: 'Artist',
            resolverAvailable: false,
          })
        )
      })
      act(function() {
        container.querySelector('[data-testid="search-auto"]').click()
      })
      expect(container.textContent).toContain('This needs an internet connection.')
      expect(container.textContent).not.toContain('start the local resolver')
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine })
    }
  })
})
