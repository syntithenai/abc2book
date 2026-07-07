import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import LyricsPage from './LyricsPage'

jest.mock('react-router-dom', function() {
  const actual = jest.requireActual('react-router-dom')
  return Object.assign({}, actual, {
    useSearchParams: function() {
      return [new URLSearchParams(''), jest.fn()]
    },
  })
})

describe('LyricsPage', function() {
  test('renders the hub and core tabs', function() {
    const markup = renderToStaticMarkup(<LyricsPage />)

    expect(markup).toContain('Lyrics')
    expect(markup).toContain('Dictionary')
    expect(markup).toContain('Thesaurus')
    expect(markup).toContain('heart')
  })
})