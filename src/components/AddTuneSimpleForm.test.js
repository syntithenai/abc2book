/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import AddTuneSimpleForm from './AddTuneSimpleForm'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./ComposerSearchButton', function() {
  const React = require('react')
  return function ComposerSearchButton(props) {
    if (typeof props.children === 'function') {
      return props.children({
        buttonGroup: React.createElement('button', {
          type: 'button',
          'data-testid': 'field-search-button',
          disabled: !!props.disabled,
        }, 'Search'),
        suggestionsDropdown: null,
        errorNode: null,
      })
    }
    return null
  }
})

jest.mock('./FieldVoiceFillButton', function() {
  return function FieldVoiceFillButton() { return null }
})

jest.mock('./BookSelectorModal', function() {
  return function BookSelectorModal() { return null }
})

jest.mock('./TagsSelectorModal', function() {
  return function TagsSelectorModal() { return null }
})

jest.mock('./AddTuneYouTubePicker', function() {
  const React = require('react')
  return function AddTuneYouTubePicker(props) {
    return React.createElement('div', {
      'data-testid': 'add-tune-youtube-block',
      'data-search-query': props.searchQuery || '',
      'data-search-nonce': String(props.searchNonce || 0),
    }, 'YouTube')
  }
})

jest.mock('../useMusicBrainzArtistOptions', function() {
  return function useMusicBrainzArtistOptions() { return { options: [], loading: false } }
})

describe('AddTuneSimpleForm', function() {
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
  })

  test('shows Search and YouTube below books/tags layout', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: { title: 'Song', artist: '' },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="field-search-button"]').disabled).toBe(false)
    expect(container.querySelector('[data-testid="add-tune-youtube-block"]')).toBeTruthy()
    expect(container.querySelector('.add-tune-books-tags')).toBeTruthy()
    expect(container.querySelector('[data-testid="add-tune-files-block"]')).toBeNull()
    expect(container.querySelector('[data-testid="add-tune-media-block"]')).toBeNull()
  })

  test('shows Files and Audio blocks only when they have values', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: {
          title: 'Song',
          tuneFiles: [{ id: 'f1', name: 'sheet.png', type: 'image/png' }],
          links: [{ link: 'recording:r1', title: 'Take', recordingId: 'r1' }],
        },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="add-tune-files-block"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="add-tune-media-block"]')).toBeTruthy()
  })

  test('clicking a selected artist updates the YouTube search to that artist', function() {
    act(function() {
      root.render(React.createElement(AddTuneSimpleForm, {
        values: {
          title: 'Whiskey in the Jar',
          artist: 'Traditional',
          artists: ['The Dubliners', 'Metallica'],
        },
        tunes: {},
        candidateId: 'add-1',
        onChange: jest.fn(),
      }))
    })

    const chip = container.querySelector('[data-testid="chip-list-select-item"]')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toBe('The Dubliners')

    act(function() {
      chip.click()
    })

    const youtube = container.querySelector('[data-testid="add-tune-youtube-block"]')
    expect(youtube.getAttribute('data-search-query')).toBe('Whiskey in the Jar The Dubliners')
    expect(Number(youtube.getAttribute('data-search-nonce'))).toBeGreaterThan(0)
  })
})
