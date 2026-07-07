import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import LyricsPage from './LyricsPage'

jest.mock('../useMediaResolverHealth', function() {
  return function() {
    return {
      available: true,
      checked: true,
      status: {},
      features: {},
      refreshMediaResolverHealth: jest.fn(),
    }
  }
})

jest.mock('react-router-dom', function() {
  const actual = jest.requireActual('react-router-dom')
  return Object.assign({}, actual, {
    useSearchParams: function() {
      return [new URLSearchParams(''), jest.fn()]
    },
  })
})

describe('LyricsPage', function() {
  test('renders lookup hub and tool tabs', function() {
    const markup = renderToStaticMarkup(<LyricsPage />)

    expect(markup).toContain('Lyrics')
    expect(markup).toContain('Lookup')
    expect(markup).toContain('Syllables + Stress')
    expect(markup).toContain('Reverse Dictionary')
    expect(markup).toContain('Phrase Finder')
    expect(markup).toContain('Clear search')
    expect(markup).toContain('dictionary, thesaurus, alliteration, and rhyme finder')
  })
})
