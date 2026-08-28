/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LyricsSearchButton from './LyricsSearchButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockStartLyrics = jest.fn()
const mockStartChords = jest.fn()
const mockDismiss = jest.fn()
let lyricsHandlers = {}
let chordsHandlers = {}

jest.mock('../useMediaQuery', function() {
  return { useIsNarrowViewport: function() { return false } }
})

jest.mock('../useAbcjsParser', function() {
  return function useAbcjsParser() {
    return { renderChords: function() { return '' } }
  }
})

jest.mock('../fieldLookupResolverAccess', function() {
  return {
    useFieldLookupResolverAccess: function() {
      return {
        needsLogin: false,
        needsNetwork: false,
        automaticLookupFor: function() { return true },
      }
    },
  }
})

jest.mock('../resolverAccessToken', function() {
  return {
    resolveResolverAccessToken: function(token) { return token || '' },
  }
})

jest.mock('../mediaResolverHealthStore', function() {
  return {
    getActiveResolverAccessToken: function() { return '' },
  }
})

jest.mock('../tuneFieldLookupQueue', function() {
  return {
    applyFieldLookupChoice: jest.fn(),
    buildSearchModeOptions: function(mode, extra) {
      return Object.assign({ searchMode: mode }, extra || {})
    },
    dismissFieldLookup: function() { return mockDismiss.apply(null, arguments) },
    getAwaitingJob: jest.fn(),
    getActiveJob: jest.fn(),
    offerSideFieldSuggestion: jest.fn(function() { return { seeded: 'side-1' } }),
  }
})

jest.mock('../lyricsSideSuggestions', function() {
  return {
    maybeOfferLyricsFromSearchResult: jest.fn(),
  }
})

jest.mock('../genreSideSuggestions', function() {
  return {
    maybeOfferGenreFromSearchResult: jest.fn(),
  }
})

jest.mock('../addTuneAutoEnrich', function() {
  return {
    offerAddTuneAutoEnrichChordPaste: jest.fn(),
  }
})

jest.mock('../useFieldSearchResults', function() {
  return {
    useFieldSearchResults: function() { return [] },
  }
})

jest.mock('../fieldSearchResultCache', function() {
  return {
    setFieldSearchResults: jest.fn(),
    targetKeyForFieldSearch: function(tuneId, candidateId) {
      if (tuneId) return 'tune:' + tuneId
      if (candidateId) return 'candidate:' + candidateId
      return ''
    },
  }
})

jest.mock('../useFieldLookupSearchJob', function() {
  return {
    buildFieldLookupTargetKey: function(tuneId, candidateId) {
      if (tuneId) return 'tune:' + tuneId
      if (candidateId) return 'candidate:' + candidateId
      return ''
    },
    useFieldLookupSearchJob: function(options) {
      if (options.kind === 'chords') {
        chordsHandlers = options
        return {
          busy: false,
          progressPercent: 0,
          progressMessage: '',
          activeJob: null,
          startSearch: mockStartChords,
          cancel: jest.fn(),
        }
      }
      lyricsHandlers = options
      return {
        busy: false,
        progressPercent: 0,
        progressMessage: '',
        activeJob: null,
        startSearch: mockStartLyrics,
        cancel: jest.fn(),
      }
    },
  }
})

jest.mock('./FieldLookupButtonGroup', function() {
  const React = require('react')
  return {
    FieldLookupButtonGroup: function(props) {
      return React.createElement('button', {
        type: 'button',
        'data-testid': 'lyrics-search',
        onClick: function() { props.onSearch('review') },
      }, 'Search')
    },
  }
})

describe('LyricsSearchButton import chords fallback', function() {
  let container
  let root

  beforeEach(function() {
    mockStartLyrics.mockClear()
    mockStartChords.mockClear()
    mockDismiss.mockClear()
    lyricsHandlers = {}
    chordsHandlers = {}
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  function renderButton(extraProps) {
    act(function() {
      root.render(
        React.createElement(LyricsSearchButton, Object.assign({
          candidateId: 'cand-1',
          title: 'Am I Ever Going to See Your Face Again',
          artist: 'The Angels',
          onChords: jest.fn(),
          leaveAwaiting: true,
          forceReview: true,
        }, extraProps || {}))
      )
    })
  }

  test('chords miss falls back to lyrics search without chords error', function() {
    renderButton()

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    expect(mockStartChords).toHaveBeenCalledTimes(1)
    expect(mockStartLyrics).not.toHaveBeenCalled()

    act(function() {
      chordsHandlers.onError({ error: 'No chords found for this song' })
    })

    expect(container.textContent).not.toContain('No chords found')
    expect(mockStartLyrics).toHaveBeenCalledTimes(1)
    expect(mockStartLyrics.mock.calls[0][0].title).toBe('Am I Ever Going to See Your Face Again')
  })

  test('chord-only FolkTuneFinder hit falls back to lyrics search', function() {
    renderButton()

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    act(function() {
      chordsHandlers.onAwaiting({
        id: 'j1',
        status: 'awaiting',
        candidates: [{
          chordText: 'D G Bm A|',
          lyricText: '',
          lyricLines: [],
          sheetLines: ['D G Bm A', 'G D D A G'],
          source: 'FolkTuneFinder',
        }],
      })
    })

    expect(document.body.textContent).not.toContain('Choose chord sheet')
    expect(mockStartLyrics).toHaveBeenCalledTimes(1)
  })

  test('successful chords do not start lyrics fallback', function() {
    renderButton()

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    act(function() {
      chordsHandlers.onAwaiting({
        id: 'j1',
        status: 'awaiting',
        candidates: [{ chordText: 'E A', lyricText: 'line' }],
      })
    })

    expect(mockStartLyrics).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('No chords found')
  })

  test('empty lyrics opens chord picker and does not auto-apply', function() {
    const onChords = jest.fn()
    renderButton({
      existingLyrics: '',
      presentChoicesInDialog: false,
      onChords: onChords,
      forceReview: false,
    })

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    act(function() {
      chordsHandlers.onAwaiting({
        id: 'j1',
        status: 'awaiting',
        candidates: [
          { chordText: 'E A', lyricText: 'first', source: 'ultimate-guitar.com' },
          { chordText: 'G C', lyricText: 'second', source: 'e-chords.com' },
        ],
      })
    })

    expect(onChords).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Choose chord sheet')
  })

  test('existing lyrics without dialog still open chord picker', function() {
    const onChords = jest.fn()
    renderButton({
      existingLyrics: 'Who knows how long I have been waiting',
      presentChoicesInDialog: false,
      onChords: onChords,
      forceReview: false,
    })

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    act(function() {
      chordsHandlers.onAwaiting({
        id: 'j1',
        status: 'awaiting',
        candidates: [{ chordText: 'E A', lyricText: 'line', source: 'ultimate-guitar.com' }],
      })
    })

    expect(onChords).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Choose chord sheet')
  })

  test('presentChoicesInDialog opens chord picker when lyrics exist', function() {
    renderButton({
      existingLyrics: 'existing',
      presentChoicesInDialog: true,
      forceReview: false,
    })

    act(function() {
      container.querySelector('[data-testid="lyrics-search"]').click()
    })
    act(function() {
      chordsHandlers.onAwaiting({
        id: 'j1',
        status: 'awaiting',
        candidates: [{ chordText: 'E A', lyricText: 'line', source: 'ultimate-guitar.com' }],
      })
    })

    expect(document.body.textContent).toContain('Choose chord sheet')
  })
})
