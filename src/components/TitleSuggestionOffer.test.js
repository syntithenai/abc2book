/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import TitleSuggestionOffer from './TitleSuggestionOffer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TitleSuggestionOffer', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    container = null
    root = null
  })

  test('renders multiple candidates with sources', function() {
    act(function() {
      root.render(React.createElement(TitleSuggestionOffer, {
        candidates: [
          { title: 'Clair de lune', source: 'MusicBrainz' },
          { title: 'Clair de Lune (easy)', source: 'Your collection' },
        ],
        onAccept: function() {},
        onDismiss: function() {},
      }))
    })
    const offer = container.querySelector('[data-testid="title-suggestion-offer"]')
    expect(offer.textContent).toContain('Clair de lune')
    expect(offer.textContent).toContain('MusicBrainz')
    expect(offer.textContent).toContain('Your collection')
    expect(container.querySelector('[data-testid="title-suggestion-use-1"]')).toBeTruthy()
  })

  test('supports legacy single suggestion props', function() {
    act(function() {
      root.render(React.createElement(TitleSuggestionOffer, {
        suggestion: 'Clair de lune',
        source: 'MusicBrainz',
        onAccept: function() {},
        onDismiss: function() {},
      }))
    })
    expect(container.querySelector('[data-testid="title-suggestion-offer"]').textContent)
      .toContain('Suggested title:')
  })
})
