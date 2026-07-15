/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { FieldLookupButtonGroup } from './FieldLookupButtonGroup'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

jest.mock('../useMediaQuery', function() {
  return {
    useIsNarrowViewport: function() { return false },
  }
})

jest.mock('./FieldSearchModeDialog', function() {
  const React = require('react')
  return function MockModeDialog(props) {
    if (!props.show) return null
    return React.createElement('div', { 'data-testid': 'mode-dialog' },
      React.createElement('button', { type: 'button', onClick: props.onAuto }, 'Auto'),
      React.createElement('button', { type: 'button', onClick: props.onReview }, 'Review')
    )
  }
})

describe('FieldLookupButtonGroup', function() {
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

  test('opens mode dialog by default', function() {
    const onSearch = jest.fn()
    act(function() {
      root.render(
        React.createElement(FieldLookupButtonGroup, {
          automaticLookup: true,
          busy: false,
          onSearch: onSearch,
        })
      )
    })
    const searchBtn = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Search') >= 0
    })
    act(function() { searchBtn.click() })
    expect(container.querySelector('[data-testid="mode-dialog"]')).toBeTruthy()
    expect(onSearch).not.toHaveBeenCalled()
  })

  test('skips mode dialog and uses defaultSearchMode when confirmSearchMode is false', function() {
    const onSearch = jest.fn()
    act(function() {
      root.render(
        React.createElement(FieldLookupButtonGroup, {
          automaticLookup: true,
          busy: false,
          confirmSearchMode: false,
          defaultSearchMode: 'review',
          onSearch: onSearch,
        })
      )
    })
    const searchBtn = Array.from(container.querySelectorAll('button')).find(function(btn) {
      return (btn.textContent || '').indexOf('Search') >= 0
    })
    act(function() { searchBtn.click() })
    expect(container.querySelector('[data-testid="mode-dialog"]')).toBeNull()
    expect(onSearch).toHaveBeenCalledWith('review')
  })

  test('hides Search label when narrow', function() {
    act(function() {
      root.render(
        React.createElement(FieldLookupButtonGroup, {
          automaticLookup: true,
          busy: false,
          narrow: true,
          onSearch: function() {},
        })
      )
    })
    expect((container.textContent || '').indexOf('Search')).toBe(-1)
  })
})
