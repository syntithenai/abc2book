/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import FieldSuggestionsDropdown from './FieldSuggestionsDropdown'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('FieldSuggestionsDropdown', function() {
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

  test('renders nothing when empty', function() {
    act(function() {
      root.render(React.createElement(FieldSuggestionsDropdown, {
        items: [],
        onClear: jest.fn(),
        onSelect: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="field-suggestions-dropdown"]')).toBeFalsy()
  })

  test('Clear and item selection', function() {
    const onClear = jest.fn()
    const onSelect = jest.fn()
    act(function() {
      root.render(React.createElement(FieldSuggestionsDropdown, {
        items: [{ artist: 'Ada' }, { artist: 'Bo' }],
        onClear: onClear,
        onSelect: onSelect,
      }))
    })
    const toggle = container.querySelector('[data-testid="field-suggestions-dropdown"]')
    expect(toggle).toBeTruthy()
    expect(toggle.textContent).toContain('2')
    act(function() { toggle.click() })
    act(function() {
      const clear = document.querySelector('[data-testid="field-suggestions-clear"]')
      expect(clear).toBeTruthy()
      clear.click()
    })
    expect(onClear).toHaveBeenCalled()
    act(function() { toggle.click() })
    act(function() {
      const item = document.querySelector('[data-testid="field-suggestions-item-0"]')
      expect(item).toBeTruthy()
      item.click()
    })
    expect(onSelect).toHaveBeenCalledWith({ artist: 'Ada' }, 0)
  })
})
