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
  return function AddTuneYouTubePicker() {
    return React.createElement('div', { 'data-testid': 'add-tune-youtube-block' }, 'YouTube')
  }
})

jest.mock('../useMusicBrainzArtistOptions', function() {
  return function useMusicBrainzArtistOptions() { return [] }
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
  })
})
