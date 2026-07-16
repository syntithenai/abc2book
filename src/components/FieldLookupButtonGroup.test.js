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

  test('Search starts without a mode dialog', function() {
    const onSearch = jest.fn()
    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        onSearch: onSearch,
      }))
    })
    const search = container.querySelector('[data-testid="field-search-button"]')
    act(function() { search.click() })
    expect(onSearch).toHaveBeenCalledWith('auto')
    expect(container.textContent).not.toContain('Auto')
  })

  test('busy Search becomes Cancel and shows progress', function() {
    const onSearch = jest.fn()
    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        busy: true,
        progress: 40,
        onSearch: onSearch,
      }))
    })
    expect(container.textContent).toContain('Cancel')
    expect(container.querySelector('[data-testid="field-search-progress"]')).toBeTruthy()
    act(function() {
      container.querySelector('[data-testid="field-search-button"]').click()
    })
    expect(onSearch).toHaveBeenCalled()
  })

  test('hides Suggestions until suggestionCount is positive', function() {
    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        suggestionCount: 0,
        onOpenSuggestions: jest.fn(),
        onSearch: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="field-suggestions-open"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="field-suggestions-clear"]')).toBeFalsy()
    expect(container.textContent).not.toContain('Suggestions')

    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        suggestionCount: 2,
        onOpenSuggestions: jest.fn(),
        onSearch: jest.fn(),
      }))
    })
    expect(container.querySelector('[data-testid="field-suggestions-open"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="field-suggestions-clear"]')).toBeFalsy()
    expect(container.textContent).toContain('Suggestions')
  })

  test('Suggestions is a separate button without a count badge', function() {
    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        suggestionCount: 3,
        onOpenSuggestions: jest.fn(),
        onSearch: jest.fn(),
      }))
    })
    const search = container.querySelector('[data-testid="field-search-button"]')
    const suggestions = container.querySelector('[data-testid="field-suggestions-open"]')
    expect(search).toBeTruthy()
    expect(suggestions).toBeTruthy()
    expect(suggestions.textContent).toBe('Suggestions')
    expect(suggestions.textContent).not.toMatch(/\d/)
    const position = search.compareDocumentPosition(suggestions)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Not joined into the same ButtonGroup as Search
    expect(suggestions.closest('.btn-group')).toBeFalsy()
    expect(search.closest('.btn-group')).toBeTruthy()
  })

  test('external link only when showExternal', function() {
    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        externalUrl: 'https://example.com',
        externalLinkIcon: <span>ext</span>,
        showExternal: false,
        onSearch: jest.fn(),
      }))
    })
    expect(container.querySelector('a[href="https://example.com"]')).toBeFalsy()

    act(function() {
      root.render(React.createElement(FieldLookupButtonGroup, {
        automaticLookup: true,
        externalUrl: 'https://example.com',
        externalLinkIcon: <span>ext</span>,
        showExternal: true,
        onSearch: jest.fn(),
      }))
    })
    expect(container.querySelector('a[href="https://example.com"]')).toBeTruthy()
  })
})
