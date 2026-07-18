/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import FieldLookupReviewButton from './FieldLookupReviewButton'
import {
  __resetFieldSearchResultCacheForTests,
  setFieldSearchResults,
  targetKeyForFieldSearch,
} from '../fieldSearchResultCache'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('./SearchResultPickerModal', function() {
  const React = require('react')
  return function MockPicker(props) {
    if (!props.show) return null
    const current = (props.items || []).find(function(item) {
      return item && item.__current
    })
    const imported = (props.items || []).find(function(item) {
      return item && !item.__current
    })
    return React.createElement('div', { 'data-testid': 'suggestion' },
      React.createElement('span', { 'data-testid': 'current-preview' },
        current && (current.preview || current.title)),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'pick-import',
        onClick: function() {
          if (typeof props.onSelect === 'function') {
            props.onSelect(imported, 1)
          }
        },
      }, 'Pick')
    )
  }
})

describe('FieldLookupReviewButton Original Value', function() {
  let container
  let root
  let applied

  beforeEach(function() {
    applied = null
    __resetFieldSearchResultCacheForTests()
    setFieldSearchResults(
      targetKeyForFieldSearch(null, 'c1'),
      'lyrics',
      [{ text: 'imported lyrics', source: 'web' }]
    )
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
    __resetFieldSearchResultCacheForTests()
  })

  test('Original Value stays frozen after applying a search result', function() {
    function Harness(props) {
      return React.createElement(FieldLookupReviewButton, {
        candidateId: 'c1',
        kind: 'lyrics',
        currentValue: props.currentValue,
        onApply: function(result) { applied = result },
      })
    }

    act(function() {
      root.render(React.createElement(Harness, { currentValue: '(empty baseline)' }))
    })

    const caret = container.querySelector('[data-testid="field-cached-results-lyrics"]')
    expect(caret).toBeTruthy()

    act(function() { caret.click() })
    expect(container.querySelector('[data-testid="current-preview"]').textContent)
      .toBe('(empty baseline)')

    act(function() {
      container.querySelector('[data-testid="pick-import"]').click()
    })
    expect(applied && applied.text).toBe('imported lyrics')

    act(function() {
      root.render(React.createElement(Harness, { currentValue: 'imported lyrics' }))
    })
    act(function() {
      container.querySelector('[data-testid="field-cached-results-lyrics"]').click()
    })
    expect(container.querySelector('[data-testid="current-preview"]').textContent)
      .toBe('(empty baseline)')
  })
})
